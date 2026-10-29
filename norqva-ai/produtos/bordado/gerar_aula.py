# -*- coding: utf-8 -*-
"""Vídeo-aula do Kit de Bordado (roteiro aprovado em 29/10/2026): cenas feitas com IA na KIE.

Usa a mesma apresentadora do anúncio (pasta "apresentadora", criada pelo gerar_apresentadora.py).
Passo 1 (imagens): a KIE (google/nano-banana-edit) cria a primeira imagem de cada cena de mãos, com as mesmas
          mangas mostarda e a mesma mesa da apresentadora. Rápido e barato: confira antes de gerar os vídeos.
Passo 2 (vídeos): a KIE (Veo 3.1) anima cada cena (até 8 s) com a fala dela em português.
A montagem, os desenhos do PDF na tela e as legendas são feitos pelo Claude depois.

Roda no Windows e no Linux, só com Python. Precisa da KIE_API_KEY.
Uso:
  python gerar_aula.py imagens        cria as imagens que faltam (aula/cena_XX.png)
  python gerar_aula.py videos         cria os vídeos que faltam (aula/aula_XX.mp4)
  python gerar_aula.py videos 07 12   refaz só os vídeos 07 e 12 (o mesmo vale para imagens)
Mande a pasta "aula" no chat.
"""
import json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "aula")
FOTO_URL = os.path.join(HERE, "apresentadora", "foto_url.txt")
KEY = os.environ.get("KIE_API_KEY", "").strip()
BASE = "https://api.kie.ai/api/v1/jobs"

MAOS = (
    "Top-down close-up photo, vertical 9:16, of the same woman's hands (same mustard cotton sleeves, natural short nails, no rings) "
    "working on the same wooden table from the image, soft natural daylight from a window, cozy and realistic, sharp focus on the hands. "
    "No face, no text, no logos, no watermark. Scene: "
)
VOZ = (
    "Vertical 9:16 video, realistic, natural daylight, slow and clear hand movements, steady camera. "
    "The same woman narrates off-camera in Brazilian Portuguese, warm, calm and clear, like a teacher: "
)
FALA_CAM = (
    "Vertical 9:16 smartphone selfie video, the same woman from the image, same clothes and room, natural daylight. "
    "She talks to the camera in Brazilian Portuguese, warm and confident, natural lip sync. No music, no text. She says: "
)

# (cena, tipo, cena da imagem inicial, movimento, fala)
CENAS = [
    ("01", "cam", "", "She smiles and waves slightly.", "Oi! Nesta aula eu vou te mostrar, do começo ao fim, como bordar o gatinho do kit."),
    ("02", "cam", "", "She gestures to the table.", "Preparar o desenho, começar e finalizar. Pega aí agulha, linha e bastidor que eu te espero."),
    ("03", "maos", "neatly arranged on the table: a square of white cotton fabric, a round wooden embroidery hoop, terracotta and sage embroidery floss skeins, a card of embroidery needles, a blue water-soluble fabric pen, small scissors and masking tape",
     "Her hands touch each item lightly, one by one.", "Separei aqui o que vou usar: tricoline de algodão, bastidor de quinze centímetros, linha de algodão, agulha, caneta que sai com água e uma tesourinha."),
    ("04", "maos", "close-up of her two hands holding a 50 cm length of terracotta six-strand embroidery floss in the air, starting to pull one single strand apart from the others. No embroidery hoop and no cat embroidery anywhere in the picture: only the floss, the hands and the table",
     "She slowly pulls one single strand out of the six-strand floss, then another, and lays three strands side by side.", "A linha vem com seis fios. Eu separo três, puxando um fio de cada vez, devagar, e junto de novo."),
    ("05", "maos", "a printed A4 sheet with a simple sitting cat line drawing and a small 5 cm ruler printed at the bottom, a plastic ruler placed next to the printed ruler",
     "She aligns the plastic ruler with the printed ruler and taps it, checking the size.", "Primeiro eu imprimo a página do gatinho em tamanho real e confiro a reguinha: cinco centímetros certinhos."),
    ("06", "maos", "the printed cat drawing taped to a bright window glass with masking tape, white fabric being placed over it so the drawing shows through",
     "She smooths the fabric over the paper on the window and tapes the corners.", "Agora colo o papel na janela, o tecido por cima, bem esticado, e prendo com fita crepe."),
    ("07", "maos", "her hand holding a blue water-soluble fabric pen tracing the cat outline on the white fabric against the window light, half of the outline already traced",
     "She traces the cat outline gently with the blue pen, following the line.", "Copio o desenho com a caneta que sai com água, sem apertar. Se o tecido for escuro, use papel carbono para tecido."),
    ("08", "maos", "the white fabric with the cat drawn ONLY as a thin light-blue pen outline (not embroidered, no thread on it at all) lying over the inner ring of a wooden embroidery hoop on the table, her two hands holding the separate outer wooden ring just above it, about to press it down",
     "She presses the outer ring over the fabric and the inner ring, then pulls the fabric edges to tighten it.", "Coloco o tecido entre os dois aros do bastidor e vou puxando as bordas."),
    ("09", "maos", "the fabric stretched drum-tight in the wooden hoop with the blue cat outline, her fingers tightening the screw at the top of the hoop",
     "She tightens the screw and taps the fabric lightly; it is tight like a drum.", "Tem que ficar esticado como um tamborzinho. O parafuso eu deixo no alto, assim não enrosca na linha."),
    ("10", "maos", "close-up of her hands threading terracotta floss through the long eye of an embroidery needle; in the background the hoop shows the cat ONLY as a thin light-blue pen outline, not embroidered yet, no terracotta stitches on the fabric",
     "She threads the needle and ties a small knot at the end of the thread.", "Passo a linha na agulha e faço um nozinho na ponta. Eu começo sempre pelo avesso."),
    ("11", "maos", "close-up from above of the hoop: the whole cat is a thin light-blue pen outline, NOT embroidered, no stitches yet; the needle with terracotta thread is just coming up through the fabric at one point of the blue line on the cat's back. The thread is terracotta, never blue",
     "The needle comes up through the fabric on the blue line and the thread is pulled through.", "Agora o ponto atrás. Nos números ímpares a agulha sai, nos pares ela entra."),
    ("12", "maos", "close-up from above of the hoop: the whole cat is drawn as a thin light-blue pen outline, and only a short segment of about 3 cm on the cat's back is covered with small terracotta back stitches; the rest of the cat is still just the blue line. The needle is about to go down at the end of the last stitch",
     "She makes two small back stitches along the blue line: up a little ahead, down at the end of the previous stitch.", "Sai no um, volta no dois, um pontinho pra trás. Sai no três, um ponto à frente, e entra de novo no dois."),
    ("13", "maos", "close-up of the hoop, the cat's body and ears outlined in small terracotta back stitches, about half done",
     "She continues small, even back stitches along the cat outline.", "Pontinhos de uns três milímetros, sempre do mesmo tamanho. Assim eu faço o corpo e as orelhas."),
    ("14", "maos", "close-up of the hoop, the cat's curved tail being embroidered in slanted stem stitch in terracotta",
     "She makes slanted stem stitches along the curved tail, keeping the thread on the same side.", "No rabo eu uso o ponto haste: pontos inclinados, sempre com a linha do mesmo lado."),
    ("15", "maos", "close-up of the hoop, a thinner terracotta thread with two strands, the cat's closed eyes and whiskers being stitched",
     "She stitches the small curved eyes and the short whisker lines with tiny back stitches.", "Nos olhos e nos bigodes eu uso só dois fios e ponto atrás curtinho. Fica delicado."),
    ("16", "maos", "the hoop turned over: we see the BACK (wrong side) of the fabric, where the cat appears as a mirrored line of slightly messy terracotta stitches with a few loose thread tails; her needle slides under three stitches on this back side, small scissors in her other hand",
     "On the back of the fabric, she slides the needle under three stitches and snips the thread close.", "Pra arrematar, viro o bastidor, passo a agulha por baixo de três ou quatro pontos e corto rente."),
    ("17", "maos", "the finished embroidered cat on the white fabric (out of the hoop) being dabbed with a damp cloth so the blue pen lines disappear",
     "She dabs the fabric with a damp cloth; the blue lines fade away.", "A caneta sai com um pouquinho de água fria. Eu deixo secar bem."),
    ("18", "maos", "a fluffy white towel on an ironing board; on top, the embroidered square of fabric placed FACE DOWN, so we only see the back of the stitches (the cat faintly visible from behind, mirrored); her hand presses a steam iron on this back side",
     "She irons the back of the fabric gently over the towel.", "Depois passo a ferro pelo avesso, em cima de uma toalha felpuda, pra não amassar os pontos."),
    ("19", "maos", "the hoop seen from the BACK: inside the wooden ring we see the back of the white fabric (the terracotta cat seen from behind, mirrored); the excess fabric around the ring is trimmed to about 3 cm and gathered behind the ring with a running stitch, her fingers pulling the gathering thread. The center is white fabric, never bare wood",
     "She pulls the running stitch thread so the fabric gathers neatly behind the hoop, then ties it.", "Monto de novo no bastidor, corto o tecido deixando três dedos, alinhavo em volta e puxo pra franzir atrás."),
    ("20", "cam", "", "She holds up a finished embroidery hoop with a sitting cat in terracotta and smiles.", "Viu como é fácil? No kit tem cinquenta riscos pra você bordar no seu ritmo."),
    ("21", "cam", "", "She smiles warmly.", "Do mais simples ao mais caprichado. Borda o seu e me mostra!"),
]


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


def urls_db():
    p = os.path.join(OUT, "imagens_urls.json")
    return (json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}), p


def main():
    if not KEY:
        sys.exit("KIE_API_KEY não encontrada. No Windows: abra um PowerShell novo e rode de novo.")
    if not os.path.exists(FOTO_URL):
        sys.exit("Não achei apresentadora/foto_url.txt. Rode este arquivo na mesma pasta do gerar_apresentadora.py.")
    foto = open(FOTO_URL, encoding="utf-8").read().strip()
    os.makedirs(OUT, exist_ok=True)
    args = [a.lower() for a in sys.argv[1:]]
    etapa = args[0] if args else ""
    wanted = [a.zfill(2) for a in args[1:] if a.isdigit()]
    if etapa not in ("imagens", "videos"):
        sys.exit("Use: python gerar_aula.py imagens   (depois)   python gerar_aula.py videos")
    try:
        print(f"Saldo na KIE: {call('https://api.kie.ai/api/v1/chat/credit').get('data')} créditos.")
    except Exception:
        pass
    db, dbp = urls_db()
    falhas = []
    for num, tipo, cena, mov, fala in CENAS:
        if wanted and num not in wanted:
            continue
        try:
            if etapa == "imagens":
                if tipo != "maos" or (not wanted and os.path.exists(os.path.join(OUT, f"cena_{num}.png"))):
                    continue
                print(f"Imagem {num} ", end="", flush=True)
                url = run("google/nano-banana-edit", {"prompt": MAOS + cena, "image_urls": [foto], "output_format": "png", "aspect_ratio": "9:16"}, f"imagem {num}")
                db[num] = url
                json.dump(db, open(dbp, "w", encoding="utf-8"), indent=1)
                print(" ok ->", baixar(url, f"cena_{num}.png"))
            else:
                if not wanted and os.path.exists(os.path.join(OUT, f"aula_{num}.mp4")):
                    continue
                if tipo == "maos" and num not in db:
                    raise RuntimeError("falta a imagem desta cena: rode antes  python gerar_aula.py imagens")
                img = foto if tipo == "cam" else db[num]
                prompt = (f'{FALA_CAM}"{fala}" {mov}' if tipo == "cam" else f'{VOZ}"{fala}" Action: {mov} No text, no subtitles.')
                print(f"Vídeo {num} (2 a 6 minutos) ", end="", flush=True)
                url = run("veo-3-1", {"prompt": prompt, "image_urls": [img], "aspect_ratio": "9:16",
                                      "generation_type": "FIRST_AND_LAST_FRAMES_2_VIDEO", "enable_translation": False}, f"vídeo {num}")
                print(" ok ->", baixar(url, f"aula_{num}.mp4"))
        except Exception as e:
            print(" FALHOU")
            falhas.append(f"{num}: {e}")
    if falhas:
        print("\nFalharam:", *falhas, sep="\n  ")
        print("Rode de novo o mesmo comando: ele faz só os que faltam.")
    else:
        print("\nPronto. Mande a pasta 'aula' no chat.")


if __name__ == "__main__":
    main()
