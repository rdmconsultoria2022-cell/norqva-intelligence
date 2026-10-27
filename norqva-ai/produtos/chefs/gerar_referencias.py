"""Gera as folhas de referência dos chefs virtuais da Brigada da Casa na KIE (google/nano-banana).

Personagens fictícios (documento "Brigada da Casa — Etapa 1"). Nenhum comando cita pessoa real.
Roda no Windows e no Linux. Precisa da variável KIE_API_KEY (no Windows, já salva com setx) e do Pillow.
Uso:
  python gerar_referencias.py                 gera 3 versões de cada chef que ainda faltam (cerca de 4 créditos cada)
  python gerar_referencias.py rodrigo         refaz só as versões do Rodrigo (ou marina, tito)
As imagens ficam em referencias/<chef>_1.jpg, _2.jpg e _3.jpg. Escolha uma de cada e mande para o Claude conferir.
"""
import io, json, os, sys, time, urllib.request

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "referencias")
KEY = os.environ.get("KIE_API_KEY", "").strip()
BASE = "https://api.kie.ai/api/v1/jobs"
VERSIONS = 3

GUARD = ("Fictional person. Do not resemble any real person, celebrity, chef or TV personality. "
         "No text, no logos, no watermarks.")

SHEET = ("Character reference sheet, photorealistic, three views of the same person side by side: front view, "
         "left profile, three-quarter view, head and shoulders, {expr}, plain light grey studio background, "
         "soft even light, 85mm lens, ultra detailed skin texture. {desc}. " + GUARD)

CHEFS = {
    "rodrigo": {
        "expr": "neutral expression",
        "desc": ("Brazilian man, 45 years old, angular face, strong defined jawline, dark brown eyes, thick eyebrows, "
                 "small pale scar on the chin, short grey hair combed back, full beard trimmed close and grey on the "
                 "sides, medium height, lean athletic build, strong forearms, no tattoos. Wearing a charcoal grey "
                 "high-collar chef jacket with sleeves rolled to the elbows, brown leather apron with copper straps, "
                 "simple steel wristwatch"),
    },
    "marina": {
        "expr": "neutral friendly expression",
        "desc": ("Japanese-Brazilian woman, 38 years old, oval face, high cheekbones, expressive dark eyes, light "
                 "freckles across the nose, natural makeup, wavy voluminous black hair tied in a high bun with loose "
                 "strands at the nape, no bangs, no glasses, tall and slender, delicate precise hands. Wearing a white "
                 "mandarin-collar chef jacket with sage green piping, sage green linen apron, small pearl stud "
                 "earrings, no patterns"),
    },
    "tito": {
        "expr": "warm gentle expression",
        "desc": ("Brazilian man of Italian descent, 62 years old, long face, light tanned olive skin, laugh lines around "
                 "the eyes, green eyes, thick well-groomed white mustache, no beard, short white hair mostly covered by "
                 "a brown tweed flat cap, tall and slim, slightly stooped, large flour-dusted hands. Wearing a light "
                 "blue cotton shirt with rolled sleeves, raw linen apron tied at the waist, terracotta scarf around "
                 "the neck, no vest, no bow tie"),
    },
}


def call(url, body=None):
    headers = {"Authorization": f"Bearer {KEY}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def generate(name, prompt):
    r = call(f"{BASE}/createTask", {"model": "google/nano-banana", "input": {"prompt": prompt, "output_format": "png", "image_size": "3:2"}})
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
            img = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=120).read())).convert("RGB")
            out = os.path.join(OUT, f"{name}.jpg")
            img.save(out, "JPEG", quality=92)
            return out
        if d.get("state") == "fail":
            raise RuntimeError(f"{name}: a geração falhou: {d.get('failMsg')}")
    raise TimeoutError(f"{name}: a KIE demorou mais de 10 minutos")


def main():
    if not KEY:
        sys.exit("KIE_API_KEY não encontrada. No Windows: abra um PowerShell novo depois do setx e rode de novo.")
    os.makedirs(OUT, exist_ok=True)
    only = [a.lower() for a in sys.argv[1:]]
    for chef, c in CHEFS.items():
        if only and chef not in only:
            continue
        prompt = SHEET.format(expr=c["expr"], desc=c["desc"])
        for v in range(1, VERSIONS + 1):
            name = f"{chef}_{v}"
            if not only and os.path.exists(os.path.join(OUT, f"{name}.jpg")):
                print(f"{name}: já existe, pulando")
                continue
            print(f"{name}: gerando...", flush=True)
            try:
                print(f"{name}: pronta em {generate(name, prompt)}")
            except Exception as e:
                print(f"{name}: ERRO: {e}")
    print(f"\nPronto. As imagens estão em {OUT}")


if __name__ == "__main__":
    main()
