"""NORQVA-0153: imagens das ofertas que o atendente do WhatsApp envia (conteúdo e preço).

Gera frontend/public/images/whatsapp/<oferta>.jpg (1080x1350) com as capas do site.
Os preços daqui precisam ser iguais aos da oferta: o servidor só envia a imagem quando o preço do
catálogo bate com o preço gravado em backend/src/services/whatsapp/offerCards.ts. Mudou o preço?
Mude aqui e lá, rode de novo e publique.
Uso: python build_cards.py   (precisa de Python com Playwright e Chromium)
"""
import base64, os, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[3]
PUB = ROOT / "frontend" / "public"
OUT = PUB / "images" / "whatsapp"
FONTS = ROOT / "norqva-ai" / "produtos" / "bordado" / "fonts"

TRAT, DOLCI, PAES, ANTI, RIS, CARD = (
    "images/kit/capa_trat.jpg", "images/kit/capa_dolci.jpg", "images/livros/paes/capa.jpg",
    "images/livros/antipasti/capa.jpg", "images/livros/risotos/capa.jpg", "images/kit/capa_cardapio.jpg")

CARDS = {
    "OFF-000016": dict(kicker="A coleção completa", title="Coleção Trattoria Completa", sub="5 livros + bônus: cardápio de 4 semanas",
                       covers=[TRAT, RIS, ANTI, PAES, DOLCI, CARD],
                       bullets=["74 receitas italianas com foto e passo a passo", "Massas, risotos, antipasti, pães e sobremesas",
                                "Bônus: cardápio italiano de 4 semanas com lista de compras", "PDF no WhatsApp e no e-mail logo após o pagamento"],
                       old="94,50", price="47,00", badge="Mais completo"),
    "OFF-000010": dict(kicker="Os 5 livros juntos", title="Kit Trattoria Completo", sub="5 livros de receitas em PDF",
                       covers=[TRAT, RIS, ANTI, PAES, DOLCI],
                       bullets=["74 receitas italianas com foto e passo a passo", "Massas, risotos, antipasti, pães e sobremesas",
                                "Medidas em gramas e ml", "PDF no WhatsApp e no e-mail logo após o pagamento"],
                       old="94,50", price="29,90", badge=None),
    "OFF-000001": dict(kicker="Livro avulso", title="Trattoria em Casa", sub="Massas e molhos italianos", covers=[TRAT],
                       bullets=["28 receitas de massas e molhos", "Foto de cada prato e passo a passo numerado", "PDF no WhatsApp e no e-mail logo após o pagamento"],
                       old=None, price="19,90", badge=None),
    "OFF-000005": dict(kicker="Livro avulso", title="Dolci della Nonna", sub="Sobremesas italianas", covers=[DOLCI],
                       bullets=["10 sobremesas italianas", "Foto de cada prato e passo a passo numerado", "PDF no WhatsApp e no e-mail logo após o pagamento"],
                       old=None, price="14,90", badge=None),
    "OFF-000007": dict(kicker="Livro avulso", title="Pães & Fermentação Natural", sub="Pães italianos em casa", covers=[PAES],
                       bullets=["11 pães italianos e o fermento natural", "Foto de cada receita e passo a passo numerado", "PDF no WhatsApp e no e-mail logo após o pagamento"],
                       old=None, price="19,90", badge=None),
    "OFF-000008": dict(kicker="Livro avulso", title="Antipasti & Aperitivo", sub="Para abrir a mesa italiana", covers=[ANTI],
                       bullets=["12 receitas de entradas e petiscos", "Foto de cada prato e passo a passo numerado", "PDF no WhatsApp e no e-mail logo após o pagamento"],
                       old=None, price="19,90", badge=None),
    "OFF-000009": dict(kicker="Livro avulso", title="Risotos & Polentas", sub="O conforto do norte da Itália", covers=[RIS],
                       bullets=["12 receitas de risotos e polentas", "Foto de cada prato e passo a passo numerado", "PDF no WhatsApp e no e-mail logo após o pagamento"],
                       old=None, price="19,90", badge=None),
}


def data_uri(rel):
    p = PUB / rel
    return "data:image/jpeg;base64," + base64.b64encode(p.read_bytes()).decode()


def font(name):
    return "data:font/woff;base64," + base64.b64encode((FONTS / name).read_bytes()).decode()


def covers_html(covers):
    n = len(covers)
    if n == 1:
        return f'<div class="one"><img src="{data_uri(covers[0])}"></div>'
    w = 270 if n <= 5 else 250
    step = (890 - w) / (n - 1)
    out = []
    for i, c in enumerate(covers):
        mid = (n - 1) / 2
        rot = (i - mid) * 4
        lift = abs(i - mid) * 14
        out.append(f'<img style="left:{i*step:.0f}px;width:{w}px;top:{lift:.0f}px;transform:rotate({rot:.1f}deg);z-index:{10-int(abs(i-mid)*2)}" src="{data_uri(c)}">')
    return '<div class="fan">' + "".join(out) + "</div>"


def page(c):
    bullets = "".join(f"<li>{b}</li>" for b in c["bullets"])
    old = f'<div class="old">de R$ {c["old"]}</div>' if c["old"] else ""
    badge = f'<div class="badge">{c["badge"]}</div>' if c["badge"] else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:Playfair;src:url({font('playfair-display-latin-400-normal.woff')})}}
@font-face{{font-family:Playfair;font-style:italic;src:url({font('playfair-display-latin-400-italic.woff')})}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:1080px;height:1350px;background:radial-gradient(120% 80% at 50% 0%,#2a211a 0%,#141110 55%,#0d0b0a 100%);color:#f3ead9;font-family:Inter,sans-serif;position:relative;overflow:hidden}}
.frame{{position:absolute;inset:28px;border:1.5px solid rgba(201,162,92,.45)}}
.top{{position:absolute;top:70px;left:0;right:0;text-align:center}}
.brand{{font-size:20px;letter-spacing:8px;color:#c9a25c}}
.kicker{{margin-top:22px;font-size:24px;letter-spacing:3px;text-transform:uppercase;color:#d8c6a5}}
h1{{font-family:Playfair;font-weight:400;font-size:{70 if len(c['title'])<24 else 60}px;line-height:1.1;margin-top:14px;color:#fbf3e4}}
.sub{{font-family:Playfair;font-style:italic;font-size:34px;color:#c9a25c;margin-top:10px}}
.fan{{position:absolute;top:360px;left:95px;width:890px;height:430px}}
.fan img{{position:absolute;height:auto;aspect-ratio:600/880;object-fit:cover;border-radius:6px;box-shadow:0 18px 40px rgba(0,0,0,.6)}}
.one{{position:absolute;top:350px;left:0;right:0;text-align:center}}
.one img{{width:330px;aspect-ratio:600/880;object-fit:cover;border-radius:6px;box-shadow:0 20px 50px rgba(0,0,0,.65)}}
ul{{position:absolute;top:{830 if len(c['covers'])>1 else 860}px;left:110px;right:110px;list-style:none}}
li{{font-size:31px;line-height:1.3;margin:0 0 16px 46px;position:relative;color:#efe5d2}}
li:before{{content:"";position:absolute;left:-44px;top:13px;width:16px;height:16px;transform:rotate(45deg);border:2px solid #c9a25c}}
.price{{position:absolute;bottom:70px;left:60px;right:60px;height:150px;background:#c9a25c;color:#1a1410;border-radius:14px;display:flex;align-items:center;justify-content:center;gap:28px}}
.old{{font-size:30px;text-decoration:line-through;opacity:.7}}
.now{{font-size:78px;font-weight:800;letter-spacing:-1px}}
.how{{font-size:26px;font-weight:600;line-height:1.2}}
.badge{{position:absolute;top:300px;right:90px;background:#8f2f22;color:#fbefe0;font-size:22px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:10px 20px;border-radius:999px;z-index:30}}
</style></head><body><div class="frame"></div>
<div class="top"><div class="brand">NORQVA</div><div class="kicker">{c['kicker']}</div><h1>{c['title']}</h1><div class="sub">{c['sub']}</div></div>
{badge}{covers_html(c['covers'])}<ul>{bullets}</ul>
<div class="price">{old}<div class="now">R$ {c['price']}</div><div class="how">no Pix<br>ou no cartão</div></div>
</body></html>"""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1080, "height": 1350})
        for code, c in CARDS.items():
            pg.set_content(page(c), wait_until="load")
            pg.wait_for_timeout(200)
            out = OUT / f"{code.lower()}.jpg"
            pg.screenshot(path=str(out), type="jpeg", quality=88)
            print(out, os.path.getsize(out))
        b.close()


if __name__ == "__main__":
    main()
