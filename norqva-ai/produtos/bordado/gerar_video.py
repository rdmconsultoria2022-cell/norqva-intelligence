# -*- coding: utf-8 -*-
"""NORQVA-0134: vídeo ilustrativo (feito com IA) de uma mulher bordando o gatinho do Kit de Bordado.

Passo 1: a KIE (google/nano-banana-edit) cria a cena inicial a partir do bastidor do gatinho que está no site.
Passo 2: a KIE (kling-2.6/image-to-video) anima a cena: a mão passa a agulha e a linha pelo risco.

Roda no Windows e no Linux, só com Python (sem instalar nada). Precisa da variável KIE_API_KEY
(no Windows já está salva com setx; abra um PowerShell novo).
Uso:
  python gerar_video.py           gera a cena e o vídeo (salva nesta mesma pasta)
  python gerar_video.py video     refaz só o vídeo, a partir da cena já aprovada (cena_url.txt)
Saída nesta pasta: bordando_cena.png, bordando.mp4 e cena_url.txt. Mande o bordando.mp4 no chat.
"""
import json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = os.environ.get("KIE_API_KEY", "").strip()
BASE = "https://api.kie.ai/api/v1/jobs"
SOURCE = "https://acesso.norqva.com.br/images/bordado/bastidor_gato.jpg"

CENA = (
    "Use the embroidery design from this image exactly as it is: the sitting cat outline in terracotta thread. "
    "New photo: close-up, slightly from above, of a woman's hands embroidering this same cat on cream linen stretched in a round wooden hoop. "
    "About half of the cat outline is already stitched in terracotta back stitch; the rest of the outline is still a faint light-blue transfer line. "
    "Her right hand holds a needle with terracotta thread, mid-stitch on the line; her left hand holds the hoop. "
    "Natural short nails, no rings, no tattoos. On the wooden table: a small scissors and two skeins of thread (terracotta and sage). "
    "Warm soft daylight from a window, cozy and calm, realistic photo, shallow depth of field. "
    "No text, no logos, no watermark, no face visible."
)
MOVIMENTO = (
    "The woman's right hand pushes the needle down through the fabric on the faint line and pulls the terracotta thread up, "
    "completing one more small back stitch along the cat outline; slow, calm, realistic hand movement; the left hand keeps the hoop steady. "
    "Static camera, close-up, the cat design stays the same, no new objects, no text."
)


def call(url, body=None):
    headers = {"Authorization": f"Bearer {KEY}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def run(model, inp, label, limit=1200):
    r = call(f"{BASE}/createTask", {"model": model, "input": inp})
    if r.get("code") != 200:
        raise RuntimeError(f"{label}: a KIE recusou o pedido: {r.get('msg') or r}")
    task = r["data"]["taskId"]
    start = time.time()
    while time.time() - start < limit:
        time.sleep(10)
        d = call(f"{BASE}/recordInfo?taskId={task}")["data"]
        if d.get("state") == "success":
            urls = json.loads(d["resultJson"]).get("resultUrls") or []
            if not urls:
                raise RuntimeError(f"{label}: a KIE não devolveu o arquivo")
            return urls[0]
        if d.get("state") == "fail":
            raise RuntimeError(f"{label}: a geração falhou: {d.get('failMsg')}")
        print(".", end="", flush=True)
    raise TimeoutError(f"{label}: a KIE demorou demais")


def baixar(url, nome):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    out = os.path.join(HERE, nome)
    with open(out, "wb") as f:
        f.write(urllib.request.urlopen(req, timeout=300).read())
    return out


def main():
    if not KEY:
        sys.exit("KIE_API_KEY não encontrada. No Windows: abra um PowerShell novo e rode de novo.")
    try:
        print(f"Saldo na KIE: {call('https://api.kie.ai/api/v1/chat/credit').get('data')} créditos.")
    except Exception:
        pass
    url_txt = os.path.join(HERE, "cena_url.txt")
    if len(sys.argv) > 1 and sys.argv[1].lower() == "video" and os.path.exists(url_txt):
        cena = open(url_txt, encoding="utf-8").read().strip()
    else:
        print("1/2 Criando a cena (mãos bordando o gatinho) ", end="", flush=True)
        cena = run("google/nano-banana-edit", {"prompt": CENA, "image_urls": [SOURCE], "output_format": "png", "aspect_ratio": "1:1"}, "cena")
        open(url_txt, "w", encoding="utf-8").write(cena)
        print(" ok ->", baixar(cena, "bordando_cena.png"))
    print("2/2 Animando a cena (cerca de 2 a 5 minutos) ", end="", flush=True)
    video = run("kling-2.6/image-to-video", {"prompt": MOVIMENTO, "image_urls": [cena], "sound": False, "duration": "5"}, "vídeo")
    print(" ok ->", baixar(video, "bordando.mp4"))
    print("\nPronto. Mande o arquivo bordando.mp4 (e o bordando_cena.png) no chat.")


if __name__ == "__main__":
    main()
