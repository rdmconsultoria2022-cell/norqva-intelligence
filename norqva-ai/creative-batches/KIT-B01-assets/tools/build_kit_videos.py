# -*- coding: utf-8 -*-
"""KIT-B01: 6 vídeos verticais (1080x1920, 15 s) do Kit Cozinha Italiana em Casa. Sem preço no vídeo (D-0053).
Montagem com Pillow (quadros) + ffmpeg (vídeo e trilha original de music.py). Uso: python3 build_kit_videos.py <saida_dir>
"""
import math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
IMGS = os.path.join(ROOT, "frontend", "public", "images")
OUT = sys.argv[1] if len(sys.argv) > 1 else "."
W, H, FPS = 1080, 1920, 30
SCENE, XF = 3.0, 0.4
BG = (20, 17, 15)
GOLD = (179, 154, 117)
CREAM = (239, 231, 218)
LIB = "/usr/share/fonts/truetype/liberation/"


def font(name, size):
    return ImageFont.truetype(LIB + name, size)


SERIF_B, SERIF_I, SANS_B = "LiberationSerif-Bold.ttf", "LiberationSerif-Italic.ttf", "LiberationSans-Bold.ttf"
BRAND = "COZINHA ITALIANA EM CASA"
CTA_TXT = "Toque em Saiba mais"

COVERS = ["kit/capa_trat.jpg", "kit/capa_dolci.jpg", "livros/paes/capa.jpg", "livros/antipasti/capa.jpg", "livros/risotos/capa.jpg"]

# cada cena: (tipo, imagem, título, subtítulo)
VIDEOS = {
    "KIT-B01-H01-M1-C1": [
        ("covers", None, "Uma biblioteca inteira de cozinha italiana", "5 livros digitais em PDF"),
        ("photo", "kit/trat_carbonara.jpg", "Massas, molhos e pizzas", "Trattoria em Casa · 28 receitas"),
        ("photo", "livros/paes/rustico.jpg", "Pães e fermentação natural", "12 receitas passo a passo"),
        ("photo", "livros/risotos/milanese.jpg", "Risotos e polentas", "12 receitas com foto"),
        ("kit", None, "5 livros · 74 receitas com foto", CTA_TXT),
    ],
    "KIT-B01-H02-M1-C1": [
        ("photo", "kit/trat_carbonara.jpg", "Do primeiro prato à sobremesa", "Carbonara"),
        ("photo", "kit/dolci_tiramisu.jpg", "Tiramisù de família", "Dolci della Nonna"),
        ("photo", "livros/risotos/milanese.jpg", "Risoto alla milanese", "Risotos & Polentas"),
        ("photo", "livros/antipasti/arancini.jpg", "Arancini de muçarela", "Antipasti & Aperitivo"),
        ("kit", None, "Tudo isso em 5 livros digitais", CTA_TXT),
    ],
    "KIT-B01-H03-M1-C1": [
        ("portrait", "kit/nonna.jpg", "Domingo é dia de cozinha italiana", "Receitas explicadas passo a passo"),
        ("photo", "kit/trat_ravioli.jpg", "Massa feita em casa", "Trattoria em Casa"),
        ("photo", "kit/trat_ragu.jpg", "Ragù alla bolognese", "ingredientes em gramas e xícaras"),
        ("photo", "kit/dolci_tiramisu.jpg", "E a sobremesa para fechar", "Dolci della Nonna"),
        ("kit", None, "5 livros digitais · 74 receitas", CTA_TXT),
    ],
    "KIT-B01-H04-M1-C1": [
        ("photo", "livros/paes/rustico.jpg", "Pão de fermentação natural, na sua cozinha", "Pães & Fermentação Natural"),
        ("photo", "livros/paes/ciabatta.jpg", "Ciabatta", "passo a passo, em gramas"),
        ("photo", "livros/paes/focaccia.jpg", "Focaccia barese", "12 receitas no livro"),
        ("photo", "kit/trat_focaccia.jpg", "E o resto da mesa italiana", "massas, risotos, doces e antipasti"),
        ("kit", None, "O livro de pães e mais 4 no kit", CTA_TXT),
    ],
    "KIT-B01-H05-M1-C1": [
        ("photo", "kit/dolci_tiramisu.jpg", "Sobremesas italianas de família", "Dolci della Nonna"),
        ("photo", "kit/dolci_cannoli.jpg", "Cannoli", "receita passo a passo"),
        ("photo", "kit/dolci_pannacotta.jpg", "Panna cotta", "com medidas em gramas"),
        ("photo", "livros/antipasti/tagliere.jpg", "E antes da sobremesa, a mesa inteira", "mais 4 livros no kit"),
        ("kit", None, "5 livros digitais · 74 receitas", CTA_TXT),
    ],
    "KIT-B01-H06-M1-C1": [
        ("photo", "livros/antipasti/tagliere.jpg", "Abra a mesa à italiana", "Antipasti & Aperitivo"),
        ("photo", "livros/antipasti/caponata.jpg", "Caponata siciliana", "receita passo a passo"),
        ("photo", "livros/antipasti/arancini.jpg", "Arancini de muçarela", "12 receitas no livro"),
        ("photo", "livros/risotos/polenta_grelhada.jpg", "Risotos e polentas para o jantar", "Risotos & Polentas"),
        ("kit", None, "5 livros digitais · 74 receitas", CTA_TXT),
    ],
}

_cache = {}


def load(p):
    if p not in _cache:
        _cache[p] = Image.open(os.path.join(IMGS, p)).convert("RGB")
    return _cache[p]


def cover_fit(im, w, h, zoom):
    s = max(w / im.width, h / im.height) * zoom
    r = im.resize((int(im.width * s) + 1, int(im.height * s) + 1), Image.BILINEAR)
    x, y = (r.width - w) // 2, (r.height - h) // 2
    return r.crop((x, y, x + w, y + h))


def wrap(draw, text, fnt, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=fnt) <= maxw:
            cur = t
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def centered(draw, y, text, fnt, fill, maxw=940, lead=1.12):
    for ln in wrap(draw, text, fnt, maxw):
        draw.text((W // 2, y), ln, font=fnt, fill=fill, anchor="ma")
        y += int(fnt.size * lead)
    return y


FADE = Image.linear_gradient("L").resize((W, 260))


def scene_frame(sc, t):
    kind, img, title, sub = sc
    z = 1.0 + 0.07 * (t / SCENE)
    canvas = Image.new("RGB", (W, H), BG)
    ph = 1340
    if kind == "covers":
        d = ImageDraw.Draw(canvas)
        cw, ch, gap = 300, 450, 20
        xs1 = [(W - (3 * cw + 2 * gap)) // 2 + i * (cw + gap) for i in range(3)]
        xs2 = [(W - (2 * cw + gap)) // 2 + i * (cw + gap) for i in range(2)]
        for i, c in enumerate(COVERS):
            im = load(c).resize((cw, ch), Image.LANCZOS)
            x, y = (xs1[i], 250) if i < 3 else (xs2[i - 3], 250 + ch + gap)
            lift = int(10 * math.sin(math.pi * min(1, max(0, (t - 0.12 * i) / 1.2))))
            canvas.paste(im, (x, y - lift))
        d.text((W // 2, 170), BRAND, font=font(SANS_B, 30), fill=GOLD, anchor="mm")
    elif kind == "kit":
        kim = load("kit/capa_kit.jpg").resize((W, int(1500 * W / 1200)), Image.LANCZOS)
        canvas.paste(kim, (0, 0))
    else:
        pim = cover_fit(load(img), W, ph, z)
        canvas.paste(pim, (0, 0))
        canvas.paste(Image.new("RGB", (W, 260), BG), (0, ph - 260), FADE)
        d = ImageDraw.Draw(canvas)
        d.text((W // 2, 180), BRAND, font=font(SANS_B, 30), fill=CREAM, anchor="mm")
    d = ImageDraw.Draw(canvas)
    # texto com entrada suave
    a = min(1.0, t / 0.5)
    dy = int((1 - a) * 28)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    if kind == "kit":
        y = 1375 + dy
        y = centered(ld, y, title, font(SERIF_B, 70), CREAM + (255,)) + 10
        pill_w, pill_h = 700, 110
        ld.rounded_rectangle((W // 2 - pill_w // 2, y + 20, W // 2 + pill_w // 2, y + 20 + pill_h), radius=55, fill=GOLD + (255,))
        ld.text((W // 2, y + 20 + pill_h // 2), sub, font=font(SANS_B, 44), fill=(20, 17, 15, 255), anchor="mm")
    else:
        y = 1370 + dy
        y = centered(ld, y, title, font(SERIF_B, 78), CREAM + (255,)) + 18
        centered(ld, y, sub, font(SERIF_I, 44), GOLD + (255,))
    if a < 1:
        layer.putalpha(layer.getchannel("A").point(lambda v: int(v * a)))
    canvas.paste(layer, (0, 0), layer)
    return canvas


def render(key, scenes, out_mp4, wav):
    n = int(SCENE * len(scenes) * FPS)
    p = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
         "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out_mp4], stdin=subprocess.PIPE)
    for f in range(n):
        T = f / FPS
        i = min(int(T // SCENE), len(scenes) - 1)
        lt = T - i * SCENE
        fr = scene_frame(scenes[i], lt)
        if lt > SCENE - XF and i < len(scenes) - 1:
            nxt = scene_frame(scenes[i + 1], 0.0)
            fr = Image.blend(fr, nxt, (lt - (SCENE - XF)) / XF)
        p.stdin.write(fr.tobytes())
    p.stdin.close()
    p.wait()


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[2:] if len(sys.argv) > 2 else list(VIDEOS)
    tools = os.path.dirname(os.path.abspath(__file__))
    raw = os.path.join(OUT, "_trilha.wav")
    subprocess.run([sys.executable, os.path.join(tools, "music.py"), "15", raw], check=True)
    wav = os.path.join(OUT, "_trilha_14lufs.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.5:LRA=7", "-ar", "48000", wav], check=True)
    for k in only:
        render(k, VIDEOS[k], os.path.join(OUT, f"{k}.mp4"), wav)
        print("ok", k)
    os.remove(raw)
