# -*- coding: utf-8 -*-
"""NORQVA-0136: apresentadora (feita com IA) do vídeo do Kit de Bordado, em selfie, falando em primeira pessoa.

Passo 1: a KIE (google/nano-banana) cria a foto da apresentadora (vertical 9:16).
Passo 2: a KIE (Veo 3.1) faz 6 trechos de até 8 s com a mesma pessoa falando as falas do roteiro (contrato NORQVA-0136).
A montagem, as cenas do kit e as legendas são feitas pelo Claude depois.

Roda no Windows e no Linux, só com Python. Precisa da KIE_API_KEY (abra um PowerShell novo).
Uso:
  python gerar_apresentadora.py          faz a foto (se ainda não existir) e os trechos que faltam
  python gerar_apresentadora.py 3 5      refaz só os trechos 3 e 5
  python gerar_apresentadora.py foto     refaz a foto (e depois rode de novo para os trechos)
Saída na pasta "apresentadora", ao lado deste arquivo: foto.png, foto_url.txt e trecho1.mp4 ... trecho6.mp4.
Mande a pasta inteira (ou os arquivos) no chat.
"""
import json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "apresentadora")
KEY = os.environ.get("KIE_API_KEY", "").strip()
BASE = "https://api.kie.ai/api/v1/jobs"

FOTO = (
    "Vertical smartphone selfie photo, arm's length, of a friendly Brazilian woman in her early 50s, "
    "shoulder-length wavy dark brown hair with a few grey strands, light round glasses, warm natural smile, "
    "wearing a simple mustard cotton blouse, sitting at a wooden table in a cozy, simple home living room with plants and a window, "
    "soft natural daylight. On the table in front of her: a round wooden embroidery hoop with cream linen and a cat outline stitched in terracotta thread, "
    "a few skeins of thread and small scissors. Realistic, everyday look, not a studio, not an advertisement. No text, no logos, no watermark."
)

ESTILO = (
    "Vertical 9:16 smartphone selfie video, handheld, the same woman from the image, same clothes, same room, natural daylight. "
    "She talks directly to the camera in Brazilian Portuguese, warm and confident, natural lip sync, natural small gestures. "
    "No music, no on-screen text, no subtitles, no logos."
)

# fala de cada trecho (em português do Brasil, primeira pessoa, sem depoimento de cliente, sem preço, sem promessa de renda)
TRECHOS = {
    1: ("She leans slightly toward the camera.", "Se você sempre quis bordar, mas acha que não tem jeito pra isso, presta atenção no que eu vou te mostrar."),
    2: ("She nods with empathy.", "Eu sei que dá medo: a gente acha que precisa saber desenhar e nem sabe por onde começar."),
    3: ("She picks up the wooden embroidery hoop from the table and shows it to the camera.", "Olha só: no Kit de Bordado da Norqva os desenhos já vêm prontos, em tamanho real. São cinquenta riscos."),
    4: ("She points to the stitched cat on the hoop.", "Você imprime, passa o desenho pro tecido e borda seguindo o passo a passo dos pontos."),
    5: ("She holds up a needle with terracotta thread and smiles.", "Não precisa de máquina nem de experiência. É agulha, linha e um bastidor."),
    6: ("She points down toward the bottom of the screen with her finger and smiles.", "Toca no botão aqui embaixo que eu te mando tudo pelo WhatsApp."),
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


def run(model, inp, label, limit=1500):
    r = call(f"{BASE}/createTask", {"model": model, "input": inp})
    if r.get("code") != 200:
        raise RuntimeError(f"{label}: a KIE recusou o pedido: {r.get('msg') or r}")
    task = r["data"]["taskId"]
    start = time.time()
    while time.time() - start < limit:
        time.sleep(10)
        d = call(f"{BASE}/recordInfo?taskId={task}")["data"]
        if d.get("state") == "success":
            res = json.loads(d.get("resultJson") or "{}")
            urls = res.get("resultUrls") or res.get("videoUrls") or []
            if not urls:
                raise RuntimeError(f"{label}: a KIE não devolveu o arquivo ({res})")
            return urls[0]
        if d.get("state") == "fail":
            raise RuntimeError(f"{label}: a geração falhou: {d.get('failMsg')}")
        print(".", end="", flush=True)
    raise TimeoutError(f"{label}: a KIE demorou demais")


def baixar(url, nome):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    out = os.path.join(OUT, nome)
    with open(out, "wb") as f:
        f.write(urllib.request.urlopen(req, timeout=300).read())
    return out


def main():
    if not KEY:
        sys.exit("KIE_API_KEY não encontrada. No Windows: abra um PowerShell novo e rode de novo.")
    os.makedirs(OUT, exist_ok=True)
    args = [a.lower() for a in sys.argv[1:]]
    try:
        print(f"Saldo na KIE: {call('https://api.kie.ai/api/v1/chat/credit').get('data')} créditos.")
    except Exception:
        pass
    url_txt = os.path.join(OUT, "foto_url.txt")
    if "foto" in args or not os.path.exists(url_txt):
        print("Foto da apresentadora ", end="", flush=True)
        foto = run("google/nano-banana", {"prompt": FOTO, "output_format": "png", "image_size": "9:16"}, "foto")
        open(url_txt, "w", encoding="utf-8").write(foto)
        print(" ok ->", baixar(foto, "foto.png"))
        if "foto" in args:
            print("Confira a foto.png. Se gostar, rode: python gerar_apresentadora.py")
            return
    foto = open(url_txt, encoding="utf-8").read().strip()
    wanted = [int(a) for a in args if a.isdigit()]
    nums = wanted or [n for n in TRECHOS if not os.path.exists(os.path.join(OUT, f"trecho{n}.mp4"))]
    falhas = []
    for n in nums:
        acao, fala = TRECHOS[n]
        prompt = f'{ESTILO} {acao} She says in Brazilian Portuguese: "{fala}" Then she stops talking and keeps smiling.'
        print(f"Trecho {n} (2 a 6 minutos) ", end="", flush=True)
        try:
            url = run("veo-3-1", {"prompt": prompt, "image_urls": [foto], "aspect_ratio": "9:16",
                                  "generation_type": "FIRST_AND_LAST_FRAMES_2_VIDEO", "enable_translation": False}, f"trecho {n}")
            print(" ok ->", baixar(url, f"trecho{n}.mp4"))
        except Exception as e:
            print(" FALHOU")
            falhas.append(f"trecho {n}: {e}")
    if falhas:
        print("\nFalharam:", *falhas, sep="\n  ")
        print("Rode de novo o mesmo comando: ele faz só os que faltam. Se repetir o erro, mande a mensagem no chat.")
    else:
        print("\nPronto. Mande a pasta 'apresentadora' (foto.png e trecho1.mp4 a trecho6.mp4) no chat.")


if __name__ == "__main__":
    main()
