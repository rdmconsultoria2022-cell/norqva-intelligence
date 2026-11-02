"""NORQVA-0161: imagem única com as capas dos livros de cada kit (sem preço), para o atendente do WhatsApp.

Gera frontend/public/images/whatsapp/kit-capas-<kit>.jpg (1080x1350), no mesmo visual dos cartões de oferta
(build_cards.py). Rodar: python build_kit_covers.py  (precisa de Playwright + Chromium).
Mudou a capa de algum livro ou a composição de um kit: rodar de novo.
"""
import base64
import pathlib

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[3]
IMG = ROOT / "frontend" / "public" / "images"
OUT = IMG / "whatsapp"
FONTS = ROOT / "norqva-ai" / "produtos" / "bordado" / "fonts"

BOOKS = {
    "trattoria": ("kit/capa_trat.jpg", "Trattoria em Casa"),
    "risotos": ("livros/risotos/capa.jpg", "Risotos & Polentas"),
    "antipasti": ("livros/antipasti/capa.jpg", "Antipasti & Aperitivo"),
    "paes": ("livros/paes/capa.jpg", "Pães & Fermentação Natural"),
    "dolci": ("kit/capa_dolci.jpg", "Dolci della Nonna"),
    "cardapio": ("kit/capa_cardapio.jpg", "Bônus: Cardápio de 4 semanas"),
}

KITS = {
    "colecao": ("Coleção Trattoria Completa", "5 livros + bônus", ["trattoria", "risotos", "antipasti", "paes", "dolci", "cardapio"]),
    "kit5": ("Kit Trattoria Completo", "5 livros digitais", ["trattoria", "risotos", "antipasti", "paes", "dolci"]),
    "kit4": ("Complete a coleção", "+4 livros digitais", ["risotos", "antipasti", "paes", "dolci"]),
    "kit2": ("Kit Cozinha Italiana", "2 livros digitais", ["trattoria", "dolci"]),
}


def data_uri(path: pathlib.Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def font(name: str) -> str:
    return data_uri(FONTS / name, "font/woff")


def html(title: str, sub: str, books: list[str]) -> str:
    n = len(books)
    cols = 3 if n >= 5 else 2
    width = 280 if cols == 3 else 360
    cards = []
    for i, key in enumerate(books, 1):
        rel, name = BOOKS[key]
        bonus = key == "cardapio"
        label = name if bonus else f"<b>{i}</b> {name}"
        cards.append(
            f'<figure class="{"bonus" if bonus else ""}"><img src="{data_uri(IMG / rel, "image/jpeg")}">'
            f"<figcaption>{label}</figcaption></figure>"
        )
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:Playfair;src:url({font('playfair-display-latin-400-normal.woff')})}}
@font-face{{font-family:Playfair;font-style:italic;src:url({font('playfair-display-latin-400-italic.woff')})}}
@font-face{{font-family:Poppins;src:url({font('poppins-latin-500-normal.woff')})}}
@font-face{{font-family:Poppins;font-weight:600;src:url({font('poppins-latin-600-normal.woff')})}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:1080px;height:1350px;background:radial-gradient(120% 80% at 50% 0%,#2a211a 0%,#141110 55%,#0d0b0a 100%);color:#f3ead9;font-family:Poppins,sans-serif;overflow:hidden;display:flex;flex-direction:column;align-items:center;padding-top:64px}}
.brand{{font-size:20px;letter-spacing:8px;color:#c9a25c}}
.kicker{{margin-top:18px;font-size:24px;letter-spacing:3px;text-transform:uppercase;color:#d8c6a5}}
h1{{font-family:Playfair;font-weight:400;font-size:62px;line-height:1.1;margin-top:10px;color:#fbf3e4;text-align:center}}
.sub{{font-family:Playfair;font-style:italic;font-size:32px;color:#c9a25c;margin-top:6px}}
.grid{{display:flex;flex-wrap:wrap;justify-content:center;gap:30px 34px;width:{cols * width + (cols - 1) * 34}px;margin-top:44px}}
figure{{width:{width}px;display:flex;flex-direction:column;align-items:center}}
img{{width:{width - 30}px;aspect-ratio:2/3;object-fit:cover;border-radius:6px;box-shadow:0 14px 34px rgba(0,0,0,.55);border:1px solid rgba(201,162,92,.35)}}
figcaption{{margin-top:12px;font-size:21px;line-height:1.25;text-align:center;color:#efe5d2;min-height:52px}}
figcaption b{{display:inline-block;background:#c9a25c;color:#1a1410;border-radius:50%;width:30px;height:30px;line-height:30px;font-weight:600;margin-right:6px}}
.bonus figcaption{{color:#c9a25c;font-style:italic}}
.foot{{position:absolute;bottom:46px;font-size:22px;color:#d8c6a5;letter-spacing:1px}}
</style></head><body>
<div class="brand">NORQVA</div><div class="kicker">O que vem no</div><h1>{title}</h1><div class="sub">{sub}</div>
<div class="grid">{''.join(cards)}</div>
<div class="foot">Livros em PDF · acesso pelo WhatsApp e por e-mail</div>
</body></html>"""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={"width": 1080, "height": 1350})
        for key, (title, sub, books) in KITS.items():
            page.set_content(html(title, sub, books), wait_until="load")
            page.wait_for_timeout(300)
            dest = OUT / f"kit-capas-{key}.jpg"
            page.screenshot(path=str(dest), type="jpeg", quality=86)
            print("ok", dest.relative_to(ROOT), dest.stat().st_size // 1024, "KB")
        b.close()


if __name__ == "__main__":
    main()
