# -*- coding: utf-8 -*-
"""Gera as fotos do Risotos & Polentas na KIE (google/nano-banana), no cenário dos livros da coleção (D-0055).

Roda no Windows e no Linux. Precisa da variável KIE_API_KEY (no Windows, já salva com setx) e do Pillow.
Uso:
  python gerar_fotos.py              gera só as fotos que ainda faltam em jpg/ (cerca de 4 créditos cada)
  python gerar_fotos.py 03 09        refaz só as fotos 03 e 09 (use "capa" para a capa)
Depois: python build_risotos.py
"""
import io, json, os, sys, time, urllib.request

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content_risotos import PHOTOS, STYLE

HERE = os.path.dirname(os.path.abspath(__file__))
JPG = os.path.join(HERE, "jpg")
KEY = os.environ.get("KIE_API_KEY", "").strip()
BASE = "https://api.kie.ai/api/v1/jobs"
SIZES = {"3:2": (1536, 1024), "2:3": (1024, 1536)}


def call(url, body=None):
    headers = {"Authorization": f"Bearer {KEY}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def generate(name, ratio, scene):
    prompt = f"{scene}. {STYLE}"
    r = call(f"{BASE}/createTask", {"model": "google/nano-banana", "input": {"prompt": prompt, "output_format": "png", "image_size": ratio}})
    if r.get("code") != 200:
        raise RuntimeError(f"{name}: a KIE recusou o pedido: {r.get('msg') or r}")
    task = r["data"]["taskId"]
    start = time.time()
    while time.time() - start < 600:
        time.sleep(8)
        d = call(f"{BASE}/recordInfo?taskId={task}")["data"]
        if d.get("state") == "success":
            urls = json.loads(d["resultJson"]).get("resultUrls") or []
            if not urls:
                raise RuntimeError(f"{name}: a KIE não devolveu imagem")
            req = urllib.request.Request(urls[0], headers={"User-Agent": "Mozilla/5.0"})
            raw = urllib.request.urlopen(req, timeout=120).read()
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            w, h = SIZES[ratio]
            # recorta no centro para a proporção exata e reduz para o tamanho dos outros livros
            src_ratio, dst_ratio = img.width / img.height, w / h
            if src_ratio > dst_ratio:
                nw = int(img.height * dst_ratio)
                img = img.crop(((img.width - nw) // 2, 0, (img.width - nw) // 2 + nw, img.height))
            elif src_ratio < dst_ratio:
                nh = int(img.width / dst_ratio)
                img = img.crop((0, (img.height - nh) // 2, img.width, (img.height - nh) // 2 + nh))
            img = img.resize((w, h), Image.LANCZOS)
            out = os.path.join(JPG, f"{name}.jpg")
            img.save(out, "JPEG", quality=88)
            return out
        if d.get("state") == "fail":
            raise RuntimeError(f"{name}: a geração falhou: {d.get('failMsg')}")
    raise TimeoutError(f"{name}: a KIE demorou mais de 10 minutos")


def main():
    if not KEY:
        sys.exit("KIE_API_KEY não encontrada. No Windows: abra um PowerShell novo depois do setx e rode de novo.")
    os.makedirs(JPG, exist_ok=True)
    wanted = [a.lower() for a in sys.argv[1:]]
    names = []
    for name in PHOTOS:
        num = name.split("_")[0]
        if wanted:
            if num in wanted or ("capa" in wanted and name == "00_capa"):
                names.append(name)
        elif not os.path.exists(os.path.join(JPG, f"{name}.jpg")):
            names.append(name)
    if not names:
        print("Todas as fotos já existem. Para refazer uma, rode: python gerar_fotos.py 03")
        return
    try:
        saldo = call("https://api.kie.ai/api/v1/chat/credit").get("data")
        print(f"Saldo na KIE: {saldo} créditos. Vou gerar {len(names)} foto(s), cerca de {4 * len(names)} créditos.")
    except Exception:
        print(f"Vou gerar {len(names)} foto(s), cerca de {4 * len(names)} créditos.")
    falhas = []
    for name in names:
        ratio, scene = PHOTOS[name]
        try:
            print(f"  {name} ...", end=" ", flush=True)
            out = generate(name, ratio, scene)
            print("ok")
        except Exception as e:
            print("FALHOU")
            falhas.append(f"{name}: {e}")
    if falhas:
        print("\nFalharam:", *falhas, sep="\n  ")
        print("Rode de novo o mesmo comando: ele gera só as que faltam.")
    else:
        print("\nPronto. Agora rode: python build_risotos.py")


if __name__ == "__main__":
    main()
