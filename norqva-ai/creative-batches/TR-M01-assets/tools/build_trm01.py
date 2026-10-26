# -*- coding: utf-8 -*-
"""TR-M01: 4 vídeos verticais (1080x1920, 15 s) + 4 imagens de feed (1080x1350) do kit de 5 livros, para a
campanha clique-para-WhatsApp. Mostra as PÁGINAS REAIS dos PDFs num celular desenhado aqui (sem marca),
os pratos com as fotos dos próprios livros e o fechamento "peça pelo WhatsApp". Sem preço (D-0053).

Uso: python3 build_trm01.py <saida_dir> [--pagina] [CHAVE ...]
- --pagina: versão C2 (NORQVA-0141) para a campanha de VENDAS com destino na página do kit (/kit/OFF-000010):
  mesmos vídeos, mas o fechamento troca a conversa do WhatsApp pelas 5 capas, "5 livros de receitas em PDF" e
  "Toque em Saiba mais". Sem WhatsApp, sem canal de entrega e sem preço. Sem a opção, gera a C1 (WhatsApp).
- Gera os PDFs que faltarem com os scripts de norqva-ai/produtos/* e rasteriza as páginas com pdftoppm.
- Trilha: music.py do lote KIT-B01 (original), normalizada a -14 LUFS.
"""
import math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
PROD = os.path.join(ROOT, "norqva-ai", "produtos")
IMGS = os.path.join(ROOT, "frontend", "public", "images")
MUSIC = os.path.join(ROOT, "norqva-ai", "creative-batches", "KIT-B01-assets", "tools", "music.py")
PAGINA = "--pagina" in sys.argv[1:]          # C2: destino na página do kit (botão Saiba mais)
ARGS = [a for a in sys.argv[1:] if a != "--pagina"]
OUT = os.path.abspath(ARGS[0] if ARGS else ".")
CACHE = os.path.join(OUT, "_paginas")

W, H, FPS, DUR, XF = 1080, 1920, 30, 15.0, 0.35
BG = (20, 17, 15)
GOLD = (179, 154, 117)
CREAM = (239, 231, 218)
LIB = "/usr/share/fonts/truetype/liberation/"
SERIF_B, SERIF_I, SANS_B, SANS = "LiberationSerif-Bold.ttf", "LiberationSerif-Italic.ttf", "LiberationSans-Bold.ttf", "LiberationSans-Regular.ttf"
BRAND = "COZINHA ITALIANA EM CASA"
_fonts = {}


def font(name, size):
    if (name, size) not in _fonts:
        _fonts[(name, size)] = ImageFont.truetype(LIB + name, size)
    return _fonts[(name, size)]


# ---------------------------------------------------------------- livros (PDF reais)
BOOKS = {
    "trat": ("trattoria", "build_trattoria.py", "TRATTORIA_EM_CASA_EDICAO_2026.pdf", "Trattoria em Casa", 67),
    "dolci": ("dolci", "build2.py", "DOLCI_DELLA_NONNA.pdf", "Dolci della Nonna", 27),
}
PAGE_W = 2208  # 3x a largura da tela do celular: texto nítido no zoom


def page_img(book, n):
    d, script, pdf, _, _ = BOOKS[book]
    pdfp = os.path.join(PROD, d, pdf)
    if not os.path.exists(pdfp):
        subprocess.run([sys.executable, script], cwd=os.path.join(PROD, d), check=True)
    os.makedirs(CACHE, exist_ok=True)
    out = os.path.join(CACHE, f"{book}-{n:02d}.png")
    if not os.path.exists(out):
        stem = os.path.join(CACHE, f"_{book}_{n}")
        subprocess.run(["pdftoppm", "-f", str(n), "-l", str(n), "-scale-to-x", str(PAGE_W), "-scale-to-y", "-1",
                        "-png", "-singlefile", pdfp, stem], check=True)
        os.replace(stem + ".png", out)
    return Image.open(out).convert("RGB")


COVERS = ["kit/capa_trat.jpg", "kit/capa_dolci.jpg", "livros/paes/capa.jpg", "livros/antipasti/capa.jpg", "livros/risotos/capa.jpg"]
_img = {}


def load(p):
    if p not in _img:
        full = p if os.path.isabs(p) else os.path.join(IMGS, p)
        _img[p] = Image.open(full).convert("RGB")
    return _img[p]


def dish(book_dir, name):
    return os.path.join(PROD, book_dir, "jpg", name)


# ---------------------------------------------------------------- celular desenhado (sem marca)
PH_X, PH_W, PH_Y = 120, 840, 580     # moldura
BEZ = 20
SC_X, SC_Y, SC_W = PH_X + BEZ, PH_Y + BEZ, PH_W - 2 * BEZ   # tela 800 de largura
STATUS_H, BAR_H = 54, 66
SC_H = H - SC_Y                                              # a tela continua abaixo do quadro
GAP_DOC = 60
DOC_BG = (54, 54, 57)


def phone_layers(px=PH_X, py=PH_Y, pw=PH_W, ph=None, bez=BEZ, rad=96):
    """Moldura (RGBA) e máscara da tela, no tamanho do quadro inteiro."""
    ph = ph or (H - py + 200)
    frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(frame)
    # brilho dourado bem leve atrás, para o celular não sumir no fundo escuro
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle((px - 10, py - 10, px + pw + 10, py + ph), radius=rad + 10, fill=GOLD + (70,))
    glow = glow.filter(ImageFilter.GaussianBlur(28))
    frame.alpha_composite(glow)
    d.rounded_rectangle((px - 4, py + 210, px + 2, py + 290), radius=2, fill=(40, 40, 42, 255))      # botões laterais
    d.rounded_rectangle((px + pw - 2, py + 250, px + pw + 4, py + 380), radius=2, fill=(40, 40, 42, 255))
    d.rounded_rectangle((px, py, px + pw, py + ph), radius=rad, fill=(14, 14, 15, 255), outline=(70, 70, 74, 255), width=3)
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((px + bez, py + bez, px + pw - bez, py + ph - bez), radius=rad - bez, fill=255)
    # vazado onde fica a tela
    alpha = frame.getchannel("A")
    alpha.paste(0, (0, 0), mask)
    frame.putalpha(alpha)
    return frame, mask


PHONE_FRAME, PHONE_MASK = phone_layers()


def status_bar(img, w):
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, w, STATUS_H), fill=(0, 0, 0))
    d.rounded_rectangle((w // 2 - 95, 14, w // 2 + 95, 44), radius=15, fill=(18, 18, 18))
    d.text((44, STATUS_H // 2 + 2), "9:41", font=font(SANS_B, 24), fill=(235, 235, 235), anchor="lm")
    for i in range(4):  # sinal
        x = w - 120 + i * 11
        d.rectangle((x, 38 - 6 - i * 4, x + 6, 38), fill=(235, 235, 235))
    d.rounded_rectangle((w - 66, 22, w - 30, 38), radius=4, outline=(235, 235, 235), width=2)
    d.rectangle((w - 63, 25, w - 40, 35), fill=(235, 235, 235))


def ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


class Doc:
    """Páginas empilhadas como num leitor de PDF; câmera com zoom."""

    def __init__(self, book, pages):
        self.book, self.pages = book, pages
        ims = [page_img(book, n) for n in pages]
        self.ph = ims[0].height
        pad = 2400
        self.top0 = pad
        hh = pad * 2 + len(ims) * self.ph + (len(ims) - 1) * GAP_DOC
        self.im = Image.new("RGB", (PAGE_W, hh), DOC_BG)
        for i, im in enumerate(ims):
            self.im.paste(im, (0, self.top(i)))

    def top(self, i):
        return self.top0 + i * (self.ph + GAP_DOC)

    def page_at(self, yc):
        i = int((yc - self.top0) // (self.ph + GAP_DOC))
        return self.pages[max(0, min(len(self.pages) - 1, i))]

    def view(self, i, fy=0.0, fx=0.5, zoom=1.0, content_h=None, w=SC_W):
        """Câmera que coloca o ponto (fx, fy) da página i no ALTO da área visível (fy=0: topo da página)."""
        content_h = content_h or (SC_H - STATUS_H - BAR_H)
        s = w / PAGE_W * zoom
        vis_h = content_h / s
        yc = self.top(i) + fy * self.ph + vis_h / 2 - (40 / s if fy == 0 else 0)
        return (fx * PAGE_W, yc, zoom)

    def render(self, cam, w, h):
        xc, yc, zoom = cam
        s = w / PAGE_W * zoom
        bw, bh = w / s, h / s
        x0 = max(0.0, min(PAGE_W - bw, xc - bw / 2)) if bw < PAGE_W else (PAGE_W - bw) / 2
        y0 = yc - bh / 2
        if x0 < 0:  # zoom < 1: fundo cinza dos lados
            base = Image.new("RGB", (w, h), DOC_BG)
            inner = self.im.resize((int(PAGE_W * s), h), Image.BILINEAR, box=(0, y0, PAGE_W, y0 + bh), reducing_gap=2.0)
            base.paste(inner, ((w - inner.width) // 2, 0))
            return base
        return self.im.resize((w, h), Image.BILINEAR, box=(x0, y0, x0 + bw, y0 + bh), reducing_gap=2.0)


def cam_at(keys, t):
    """keys: [(t, cam)]; mantém e interpola com suavização."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, c0), (t1, c1) in zip(keys, keys[1:]):
        if t <= t1:
            a = ease((t - t0) / (t1 - t0)) if t1 > t0 else 1
            # zoom em escala log fica mais natural
            z = math.exp(math.log(c0[2]) + (math.log(c1[2]) - math.log(c0[2])) * a)
            return (c0[0] + (c1[0] - c0[0]) * a, c0[1] + (c1[1] - c0[1]) * a, z)
    return keys[-1][1]


def pdf_screen(doc, cam, label, sw=SC_W, sh=SC_H):
    """Conteúdo da tela: barra de status, barra do leitor de PDF e as páginas."""
    scr = Image.new("RGB", (sw, sh), DOC_BG)
    ch = sh - STATUS_H - BAR_H
    scr.paste(doc.render(cam, sw, ch), (0, STATUS_H + BAR_H))
    status_bar(scr, sw)
    d = ImageDraw.Draw(scr)
    d.rectangle((0, STATUS_H, sw, STATUS_H + BAR_H), fill=(32, 32, 34))
    # ícone de documento
    x0, y0 = 30, STATUS_H + 15
    d.rounded_rectangle((x0, y0, x0 + 28, y0 + 36), radius=4, fill=(196, 74, 58))
    d.text((x0 + 14, y0 + 18), "PDF", font=font(SANS_B, 10), fill=(255, 255, 255), anchor="mm")
    d.text((x0 + 44, STATUS_H + BAR_H // 2), label, font=font(SANS_B, 25), fill=(230, 230, 230), anchor="lm")
    n_total = BOOKS[doc.book][4]
    d.text((sw - 30, STATUS_H + BAR_H // 2), f"{doc.page_at(cam[1])} / {n_total}", font=font(SANS, 23), fill=(170, 170, 170), anchor="rm")
    return scr


# ---------------------------------------------------------------- tela de conversa (ilustração)
CHAT_BG = (233, 226, 214)


def bubble(d, x, y, w, lines, mine, fnt=None):
    fnt = fnt or font(SANS, 29)
    lh = 38
    h = 26 + lh * len(lines)
    fill = (214, 233, 196) if mine else (255, 255, 255)
    bx = x if not mine else SC_W - 24 - w
    d.rounded_rectangle((bx, y, bx + w, y + h), radius=20, fill=fill)
    for i, (ln, f) in enumerate(lines):
        d.text((bx + 22, y + 14 + i * lh), ln, font=f or fnt, fill=(30, 30, 30))
    return y + h + 16


def chat_screen(t):
    """Ilustração do atendimento: pedido, confirmação do Pix e link de acesso aos 5 livros."""
    scr = Image.new("RGB", (SC_W, SC_H), CHAT_BG)
    status_bar(scr, SC_W)
    d = ImageDraw.Draw(scr)
    hb = STATUS_H + 92
    d.rectangle((0, STATUS_H, SC_W, hb), fill=(42, 37, 32))
    d.ellipse((26, STATUS_H + 16, 86, STATUS_H + 76), fill=GOLD)
    d.text((56, STATUS_H + 46), "CI", font=font(SERIF_B, 28), fill=BG, anchor="mm")
    d.text((104, STATUS_H + 30), "Cozinha Italiana em Casa", font=font(SANS_B, 28), fill=(240, 240, 240), anchor="lm")
    d.text((104, STATUS_H + 64), "atendimento", font=font(SANS, 22), fill=(190, 180, 165), anchor="lm")
    d.text((SC_W // 2, hb + 26), "ilustração", font=font(SERIF_I, 22), fill=(130, 120, 105), anchor="mm")
    y = hb + 54
    steps = [0.25, 0.85, 1.45]
    if t >= steps[0]:
        y = bubble(d, 0, y, 430, [("Quero o kit dos 5 livros", None)], True)
    if t >= steps[1]:
        y = bubble(d, 24, y, 520, [("Pagamento confirmado!", font(SANS_B, 29)), ("Aqui está o acesso ao seu kit:", None)], False)
    if t >= steps[2]:
        # cartão do link com as 5 capas
        bx, bw, bh = 24, SC_W - 120, 380
        d.rounded_rectangle((bx, y, bx + bw, y + bh), radius=20, fill=(255, 255, 255))
        d.rounded_rectangle((bx + 14, y + 14, bx + bw - 14, y + 210), radius=12, fill=BG)
        cw, chh = 98, 147
        gx = bx + 14 + ((bw - 28) - (5 * cw + 4 * 10)) // 2
        for i, c in enumerate(COVERS):
            k = ease((t - steps[2] - 0.12 * i) / 0.35)
            if k <= 0:
                continue
            cv = load(c).resize((cw, chh), Image.LANCZOS)
            scr.paste(cv, (gx + i * (cw + 10), y + 14 + 31 + int((1 - k) * 20)))
        d = ImageDraw.Draw(scr)
        d.text((bx + 26, y + 236), "Baixar os 5 livros em PDF", font=font(SANS_B, 30), fill=(30, 30, 30))
        d.text((bx + 26, y + 280), "Abra o link e toque em baixar.", font=font(SANS, 27), fill=(90, 90, 90))
        d.text((bx + 26, y + 322), "Trattoria · Dolci · Pães · Antipasti · Risotos", font=font(SANS, 23), fill=(150, 120, 80))
    return scr


def place_phone(canvas, scr):
    layer = Image.new("RGB", (W, H), BG)
    layer.paste(scr.crop((0, 0, SC_W, H - SC_Y)), (SC_X, SC_Y))
    canvas.paste(layer, (0, 0), PHONE_MASK)


# ---------------------------------------------------------------- textos
def wrap(draw, text, fnt, maxw):
    out = []
    for para in text.split("\n"):
        words, cur = para.split(), ""
        for w in words:
            t = (cur + " " + w).strip()
            if draw.textlength(t, font=fnt) <= maxw:
                cur = t
            else:
                out.append(cur)
                cur = w
        out.append(cur)
    return out


def centered(draw, y, text, fnt, fill, maxw=960, lead=1.12, cx=W // 2):
    for ln in wrap(draw, text, fnt, maxw):
        draw.text((cx, y), ln, font=fnt, fill=fill, anchor="ma")
        y += int(fnt.size * lead)
    return y


def text_layer(draw_fn, a, dy):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer), dy)
    if a < 1:
        layer.putalpha(layer.getchannel("A").point(lambda v: int(v * a)))
    return layer


def header(ld, dy, title, sub, y0=225, tsize=74):
    ld.text((W // 2, y0 + dy), BRAND, font=font(SANS_B, 30), fill=GOLD + (255,), anchor="mm")
    y = centered(ld, y0 + 42 + dy, title, font(SERIF_B, tsize), CREAM + (255,), lead=1.08) + 12
    if sub:
        centered(ld, y, sub, font(SERIF_I, 42), GOLD + (255,))


# ---------------------------------------------------------------- cenas
FADE = Image.linear_gradient("L").resize((W, 260))


def scene_frame(sc, t, first):
    kind = sc["kind"]
    canvas = Image.new("RGB", (W, H), BG)
    a = 1.0 if first else min(1.0, t / 0.45)
    dy = 0 if first else int((1 - a) * 26)
    if kind == "pdf":
        cam = cam_at(sc["keys"], t)
        place_phone(canvas, pdf_screen(sc["doc"], cam, sc["label"]))
        canvas.paste(PHONE_FRAME, (0, 0), PHONE_FRAME)
        lay = text_layer(lambda ld, d: header(ld, d, sc["title"], sc.get("sub")), a, dy)
    elif kind == "chat":
        place_phone(canvas, chat_screen(t))
        canvas.paste(PHONE_FRAME, (0, 0), PHONE_FRAME)
        # título entra com a cena; o botão aparece depois da conversa
        lay = text_layer(lambda ld, d: header(ld, d, sc["title"], sc.get("sub"), tsize=70), a, dy)
        canvas.paste(lay, (0, 0), lay)
        b = ease((t - 1.7) / 0.4)
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        if b > 0:
            def pill(ld, d):
                pw, ph = 640, 96
                y = 1420 + d
                ld.rounded_rectangle((W // 2 - pw // 2 + 6, y + 8, W // 2 + pw // 2 + 6, y + ph + 8), radius=48, fill=(0, 0, 0, 150))
                ld.rounded_rectangle((W // 2 - pw // 2, y, W // 2 + pw // 2, y + ph), radius=48, fill=GOLD + (255,))
                ld.text((W // 2, y + ph // 2), "Toque em Enviar mensagem", font=font(SANS_B, 40), fill=BG + (255,), anchor="mm")
            lay = text_layer(pill, b, int((1 - b) * 30))
    elif kind == "final":
        # C2: fechamento para a página do kit, as 5 capas reais + "Toque em Saiba mais" (sem WhatsApp, sem preço)
        probe = ImageDraw.Draw(Image.new("RGB", (W, 10)))
        n_title = len(wrap(probe, sc["title"], font(SERIF_B, 80), 960))
        top = 290 + n_title * int(80 * 1.08) + 12 + int(42 * 1.12) + 46
        cw, ch, gap = 272, 408, 22
        xs1 = [(W - (3 * cw + 2 * gap)) // 2 + i * (cw + gap) for i in range(3)]
        xs2 = [(W - (2 * cw + gap)) // 2 + i * (cw + gap) for i in range(2)]
        for i, c in enumerate(COVERS):
            k = 1.0 if first else ease((t - 0.1 * i) / 0.45)
            if k <= 0:
                continue
            im = load(c).resize((cw, ch), Image.LANCZOS)
            x, y = (xs1[i], top) if i < 3 else (xs2[i - 3], top + ch + gap)
            y += int((1 - k) * 40)
            if k < 1:
                canvas.paste(Image.blend(Image.new("RGB", (cw, ch), BG), im, k), (x, y))
            else:
                canvas.paste(im, (x, y))
        lay = text_layer(lambda ld, d: header(ld, d, sc["title"], sc.get("sub"), y0=235, tsize=80), a, dy)
        canvas.paste(lay, (0, 0), lay)
        pill_y = top + 2 * ch + gap + 90
        b = ease((t - 1.0) / 0.4)
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        if b > 0:
            def pill(ld, d):
                pw, ph = 560, 96
                y = pill_y + d
                ld.rounded_rectangle((W // 2 - pw // 2 + 6, y + 8, W // 2 + pw // 2 + 6, y + ph + 8), radius=48, fill=(0, 0, 0, 150))
                ld.rounded_rectangle((W // 2 - pw // 2, y, W // 2 + pw // 2, y + ph), radius=48, fill=GOLD + (255,))
                ld.text((W // 2, y + ph // 2), "Toque em Saiba mais", font=font(SANS_B, 42), fill=BG + (255,), anchor="mm")
            lay = text_layer(pill, b, int((1 - b) * 30))
    elif kind == "covers":
        cw, ch, gap = 300, 450, 22
        xs1 = [(W - (3 * cw + 2 * gap)) // 2 + i * (cw + gap) for i in range(3)]
        xs2 = [(W - (2 * cw + gap)) // 2 + i * (cw + gap) for i in range(2)]
        for i, c in enumerate(COVERS):
            im = load(c).resize((cw, ch), Image.LANCZOS)
            x, y = (xs1[i], 300) if i < 3 else (xs2[i - 3], 300 + ch + gap)
            lift = int(10 * math.sin(math.pi * min(1, max(0, (t - 0.12 * i) / 1.2))))
            canvas.paste(im, (x, y - lift))

        def f(ld, d):
            ld.text((W // 2, 235 + d), BRAND, font=font(SANS_B, 30), fill=GOLD + (255,), anchor="mm")
            y = centered(ld, 1290 + d, sc["title"], font(SERIF_B, 74), CREAM + (255,)) + 14
            centered(ld, y, sc["sub"], font(SERIF_I, 44), GOLD + (255,))
        lay = text_layer(f, a, dy)
    else:  # photo: foto do próprio livro, legenda igual ao nome da receita no livro
        z = 1.0 + 0.07 * (t / sc["dur"])
        im = load(sc["img"])
        ph = 1340
        s = max(W / im.width, ph / im.height) * z
        r = im.resize((int(im.width * s) + 1, int(im.height * s) + 1), Image.BILINEAR)
        fx = sc.get("fx", 0.5)
        x = int((r.width - W) * fx)
        canvas.paste(r.crop((x, (r.height - ph) // 2, x + W, (r.height - ph) // 2 + ph)), (0, 0))
        canvas.paste(Image.new("RGB", (W, 260), BG), (0, ph - 260), FADE)
        sh = Image.new("RGBA", (W, 330), (0, 0, 0, 0))
        sh.putalpha(Image.linear_gradient("L").rotate(180).resize((W, 330)).point(lambda v: int(v * 0.8)))
        canvas.paste(sh, (0, 0), sh)

        def f(ld, d):
            ld.text((W // 2, 225), BRAND, font=font(SANS_B, 30), fill=CREAM + (255,), anchor="mm", stroke_width=3, stroke_fill=(20, 17, 15, 200))
            y = centered(ld, 1370 + d, sc["title"], font(SERIF_B, 78), CREAM + (255,)) + 18
            centered(ld, y, sc["sub"], font(SERIF_I, 44), GOLD + (255,))
        lay = text_layer(f, a, dy)
    canvas.paste(lay, (0, 0), lay)
    return canvas


# ---------------------------------------------------------------- roteiros
_docs = {}


def doc(book, pages):
    k = (book, tuple(pages))
    if k not in _docs:
        _docs[k] = Doc(book, pages)
    return _docs[k]


def pdf_scene(dur, book, pages, keys_fn, title, sub):
    dc = doc(book, pages)
    return dict(kind="pdf", dur=dur, doc=dc, keys=keys_fn(dc), label=BOOKS[book][3] + ".pdf", title=title, sub=sub)


CHAT = dict(kind="chat", title="Peça pelo WhatsApp e receba os livros na conversa",
            sub="Pagamento por Pix. O link para baixar chega aqui.")


# C2 (--pagina): fechamento para a página do kit, no lugar da conversa
FINAL = dict(kind="final", title="5 livros de receitas em PDF",
             sub="Trattoria · Dolci · Pães · Antipasti · Risotos")
CLOSE = FINAL if PAGINA else CHAT
SUFFIX = "C2" if PAGINA else "C1"


def covers(dur, title, sub):
    return dict(kind="covers", dur=dur, title=title, sub=sub)


def photo(dur, img, title, sub, fx=0.5):
    return dict(kind="photo", dur=dur, img=img, title=title, sub=sub, fx=fx)


def build_videos():
    v = {
        # H01: veja por dentro, rolando o Trattoria de verdade
        "TR-M01-H01-M1-C1": [
            pdf_scene(6.4, "trat", [1, 2, 25, 26], lambda d: [
                (0.0, d.view(0)), (1.15, d.view(0)),
                (1.75, d.view(1)), (2.55, d.view(1)),
                (3.2, d.view(2)), (4.2, d.view(2)),
                (4.85, d.view(3, fy=0.055, fx=0.235, zoom=2.5)), (6.4, d.view(3, fy=0.1, fx=0.235, zoom=2.5))],
                "Veja por dentro os livros de receitas em PDF", "Trattoria em Casa · 67 páginas"),
            covers(4.1, "São 5 livros no kit", "74 receitas · 187 páginas em PDF"),
            dict(CLOSE, dur=4.5),
        ],
        # H02: sobremesas (renovação do H05), abrindo com o Dolci no celular
        "TR-M01-H02-M1-C1": [
            pdf_scene(4.6, "dolci", [1, 5, 6], lambda d: [
                (0.0, d.view(0)), (1.0, d.view(0)),
                (1.6, d.view(1)), (2.6, d.view(1)),
                (3.25, d.view(2, fy=0.055, fx=0.235, zoom=2.5)), (4.6, d.view(2, fy=0.085, fx=0.235, zoom=2.5))],
                "Livro de sobremesas italianas em PDF", "Dolci della Nonna · 10 receitas"),
            photo(2.4, dish("dolci", "02_panna_cotta.jpg"), "Panna cotta", "com calda de frutas vermelhas"),
            photo(2.4, dish("dolci", "10_cannoli.jpg"), "Cannoli em taça", "Dolci della Nonna", fx=0.55),
            covers(2.1, "E mais 4 livros no kit", "massas, pães, antipasti e risotos"),
            dict(CLOSE, dur=3.5),
        ],
        # H03: o jantar de hoje: página da receita, depois o prato
        "TR-M01-H03-M1-C1": [
            pdf_scene(4.9, "trat", [25, 26], lambda d: [
                (0.0, d.view(0)), (1.1, d.view(0)),
                (1.8, d.view(1, fy=0.055, fx=0.235, zoom=2.5)), (3.0, d.view(1, fy=0.075, fx=0.235, zoom=2.5)),
                (3.8, d.view(1, fy=0.215, fx=0.685, zoom=2.0)), (4.9, d.view(1, fy=0.25, fx=0.685, zoom=2.0))],
                "Livro de massas italianas em PDF", "Hoje: carbonara, passo a passo"),
            photo(2.4, dish("trattoria", "10_carbonara.jpg"), "Carbonara", "sem creme de leite, como em Roma"),
            photo(2.4, dish("trattoria", "08_ragu.jpg"), "Ragù alla bolognese", "no mesmo livro: Trattoria em Casa"),
            covers(2.0, "5 livros · 74 receitas", "massas, doces, pães, antipasti e risotos"),
            dict(CLOSE, dur=3.3),
        ],
        # H04: medidas e passo a passo (zoom na página real do tiramisù)
        "TR-M01-H04-M1-C1": [
            pdf_scene(6.0, "dolci", [6], lambda d: [
                (0.0, d.view(0, fy=0.215, fx=0.235, zoom=2.5)), (2.6, d.view(0, fy=0.245, fx=0.235, zoom=2.5)),
                (3.25, d.view(0, fy=0.215, fx=0.685, zoom=2.0)), (4.6, d.view(0, fy=0.27, fx=0.685, zoom=2.0)),
                (5.4, d.view(0, fy=0.0, zoom=1.0)), (6.0, d.view(0, fy=0.0, zoom=1.0))],
                "Receitas em PDF com medidas e passo a passo", "Gramas, ml e xícaras, como neste tiramisù"),
            photo(2.5, dish("dolci", "01_tiramisu.jpg"), "Tiramisù", "a foto da receita, no mesmo livro", fx=0.6),
            covers(2.5, "5 livros · 74 receitas", "passo a passo numerado, em PDF"),
            dict(CLOSE, dur=4.0),
        ],
    }
    return {k.replace("-C1", "-" + SUFFIX): sc for k, sc in v.items()}


def render(key, scenes, out_mp4, wav):
    total = sum(s["dur"] for s in scenes)
    assert abs(total - DUR) < 1e-6, (key, total)
    starts, acc = [], 0.0
    for s in scenes:
        starts.append(acc)
        acc += s["dur"]
    n = int(DUR * FPS)
    p = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
         "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p",
         "-profile:v", "high", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out_mp4], stdin=subprocess.PIPE)
    for f in range(n):
        T = f / FPS
        i = max(k for k in range(len(scenes)) if starts[k] <= T + 1e-9)
        lt = T - starts[i]
        fr = scene_frame(scenes[i], lt, i == 0)
        if i < len(scenes) - 1 and lt > scenes[i]["dur"] - XF:
            nxt = scene_frame(scenes[i + 1], 0.0, False)
            fr = Image.blend(fr, nxt, (lt - (scenes[i]["dur"] - XF)) / XF)
        p.stdin.write(fr.tobytes())
    p.stdin.close()
    p.wait()


# ---------------------------------------------------------------- imagens de feed 4:5
FW, FH = 1080, 1350
FEED = {
    "TR-M01-H01-M1-C1": ("trat", [25], dict(i=0, fy=0.0, zoom=1.0), "Veja por dentro os livros de receitas em PDF"),
    "TR-M01-H02-M1-C1": ("dolci", [5], dict(i=0, fy=0.0, zoom=1.0), "Livro de sobremesas italianas em PDF"),
    "TR-M01-H03-M1-C1": ("trat", [26], dict(i=0, fy=0.055, fx=0.235, zoom=2.5), "Carbonara passo a passo, no livro em PDF"),
    "TR-M01-H04-M1-C1": ("dolci", [6], dict(i=0, fy=0.215, fx=0.235, zoom=2.5), "Receitas em PDF com medidas e passo a passo"),
}


def feed_image(key, out):
    book, pages, v, title = FEED[key.replace("-C2", "-C1")]
    dc = doc(book, pages)
    canvas = Image.new("RGB", (FW, FH), BG)
    d = ImageDraw.Draw(canvas)
    d.text((FW // 2, 70), BRAND, font=font(SANS_B, 28), fill=GOLD, anchor="mm")
    y = centered(d, 104, title, font(SERIF_B, 64), CREAM, maxw=980, lead=1.08)
    py = y + 34
    pw, px = 680, (FW - 680) // 2
    frame, mask = phone_layers(px=px, py=py, pw=pw, ph=FH - py + 200, bez=16, rad=80)
    frame, mask = frame.crop((0, 0, FW, FH)), mask.crop((0, 0, FW, FH))
    sw = pw - 32
    scr_h = FH - (py + 16)
    cam = dc.view(v["i"], fy=v["fy"], fx=v.get("fx", 0.5), zoom=v.get("zoom", 1.0), content_h=scr_h - STATUS_H - BAR_H, w=sw)
    scr = pdf_screen(dc, cam, BOOKS[book][3] + ".pdf", sw, scr_h)
    layer = Image.new("RGB", (FW, FH), BG)
    layer.paste(scr, (px + 16, py + 16))
    canvas.paste(layer, (0, 0), mask)
    canvas.paste(frame, (0, 0), frame)
    # faixa de baixo: oferta e entrega
    band_y = FH - 300
    band = Image.new("RGBA", (FW, 300), (0, 0, 0, 0))
    band.putalpha(Image.linear_gradient("L").resize((FW, 300)).point(lambda v: min(255, int(v * 2.6))))
    solid = Image.new("RGB", (FW, 300), BG)
    canvas.paste(solid, (0, band_y), band.getchannel("A"))
    d = ImageDraw.Draw(canvas)
    d.text((FW // 2, FH - 128), "5 livros em PDF · 74 receitas", font=font(SERIF_B, 50), fill=CREAM, anchor="mm")
    tail = "Toque em Saiba mais e veja o kit" if PAGINA else "Peça pelo WhatsApp e receba os livros na conversa"
    d.text((FW // 2, FH - 62), tail, font=font(SERIF_I, 38), fill=GOLD, anchor="mm")
    canvas.save(out, quality=92)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    videos = build_videos()
    only = ARGS[1:] if len(ARGS) > 1 else list(videos)
    raw = os.path.join(OUT, "_trilha.wav")
    wav = os.path.join(OUT, "_trilha_14lufs.wav")
    subprocess.run([sys.executable, MUSIC, str(DUR), raw], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.5:LRA=7", "-ar", "48000", wav], check=True)
    for k in only:
        feed_image(k, os.path.join(OUT, f"{k}-feed.jpg"))
        render(k, videos[k], os.path.join(OUT, f"{k}.mp4"), wav)
        print("ok", k)
    os.remove(raw)
    os.remove(wav)
