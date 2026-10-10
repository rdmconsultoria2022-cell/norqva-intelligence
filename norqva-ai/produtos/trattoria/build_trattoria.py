# -*- coding: utf-8 -*-
# Trattoria em Casa — reedição no padrão do Dolci della Nonna (abertura com foto + página da receita).
import html, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from content_trattoria import RECIPES, MODULES, PRINCIPLES, PAIRINGS, PAIRINGS_HEAD, PAIRINGS_INTRO, PAIRINGS_QUOTE, CLOSING, HIGHLIGHT, BOOK
from PIL import Image

E = html.escape
FOOT = "Trattoria em Casa • Edição Digital 2026"
F = "/usr/share/fonts/truetype/liberation/"
exec(open(os.path.join(HERE, '_parts_css.py')).read())  # define CSS (mesmo visual do Dolci)
exec(open(os.path.join(HERE, '_parts_helpers.py')).read())  # orn, monogram, leaf, page

IMG_SRC = os.path.join(HERE, 'imagens')
JPG = os.path.join(HERE, 'jpg')
ORIG = os.path.join(HERE, 'orig')
os.makedirs(JPG, exist_ok=True)
for f in (os.listdir(IMG_SRC) if os.path.isdir(IMG_SRC) else []):
    if f.lower().endswith('.png'):
        dst = os.path.join(JPG, f[:-4] + '.jpg')
        if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(os.path.join(IMG_SRC, f)):
            Image.open(os.path.join(IMG_SRC, f)).convert('RGB').save(dst, 'JPEG', quality=86, optimize=True, progressive=True)

def photo_url(name):
    p = os.path.join(JPG, name + '.jpg')
    return ('file://' + p) if os.path.exists(p) else None

MISSING = []
CSS += """
.cover2{background:#161817;color:#efe7da}
.cover2 .frame{position:absolute;inset:11mm;border:.7pt solid rgba(179,154,117,.55)}
.cover2 .frame2{position:absolute;inset:13mm;border:.4pt solid rgba(179,154,117,.3)}
.cover2 .top{position:absolute;top:24mm;left:0;right:0;text-align:center}
.cover2 .t1{font-family:'DSerif';font-size:36pt;letter-spacing:.08em;color:#f3ece0;text-transform:uppercase;margin-top:6mm}
.cover2 .t2{font-family:'DSerif';font-size:17pt;letter-spacing:.14em;color:#c9b28c;text-transform:uppercase;margin-top:2mm}
.cover2 .ph{position:absolute;top:96mm;left:30mm;right:30mm;height:150mm;background-size:cover;background-position:center;border:.6pt solid rgba(179,154,117,.45)}
.cover2 .bottom{position:absolute;bottom:22mm;left:0;right:0;text-align:center}
.placeholder{background:#e9e2d6;display:flex;align-items:center;justify-content:center;color:#8a7c66;font-family:'DSerif';font-style:italic;font-size:12pt}
.module{background:var(--dark);color:#efe7da}
.module .num{position:absolute;top:70mm;left:24mm;font-family:'DSerif';font-size:120pt;line-height:.8;color:rgba(179,154,117,.85)}
.module .mt{position:absolute;top:118mm;left:24mm;right:24mm}
.module .mt .k{font-family:'DSans';font-weight:700;font-size:8pt;letter-spacing:.42em;color:var(--gold-l)}
.module .mt h2{font-family:'DSerif';font-weight:400;font-size:30pt;line-height:1.15;margin-top:4mm;color:#f3ece0}
.module .mt p{font-family:'DSerif';font-style:italic;font-size:13pt;color:#c9bca6;margin-top:5mm;max-width:140mm;line-height:1.5}
.module .list{position:absolute;top:186mm;left:24mm;right:24mm;border-top:.6pt solid rgba(179,154,117,.45);padding-top:5mm;columns:2;column-gap:10mm}
.module .list div{font-family:'DSerif';font-size:11.5pt;color:#ded3c1;padding:1.6mm 0;break-inside:avoid}
.module .list b{font-family:'DSans';font-size:8pt;color:var(--gold-l);letter-spacing:.1em;margin-right:3mm}
.module .ftr{border-top-color:rgba(179,154,117,.35)}
.module .ftr .l{color:#a99d8a}.module .ftr .r{color:#d8ccb8}
.toc2{columns:2;column-gap:9mm;margin-top:5mm}
.toc2 .mod{break-inside:avoid;margin-bottom:5mm}
.toc2 .mh{font-family:'DSans';font-weight:700;font-size:7pt;letter-spacing:.24em;color:var(--gold);text-transform:uppercase;border-bottom:.6pt solid var(--rule);padding-bottom:1.5mm;margin-bottom:1mm}
.toc2 .r{display:flex;align-items:baseline;gap:2mm;padding:1.25mm 0;border-bottom:.4pt dotted var(--rule);font-size:8.6pt}
.toc2 .r .n{font-family:'DSerif';font-size:10pt;width:7mm;color:var(--gray)}
.toc2 .r .t{flex:1}
.toc2 .r .p{font-family:'DSerif';font-size:7.5pt;color:var(--gray)}
.pcard{background:var(--box);padding:4.5mm 5mm;margin-bottom:4mm}
.pcard .pn{font-family:'DSerif';font-size:20pt;color:var(--gold);line-height:1}
.pcard h3{font-family:'DSerif';font-weight:700;font-size:12.5pt;margin:1.5mm 0}
.pcard p{font-size:9.6pt;line-height:1.5;margin:0}
"""

pages = []

# numeração
P_TOC, P_USE, P_PRIN = 2, 3, 4
page_of = {}
cur = 5
module_page = {}
for num, mtitle, msub, slugs in MODULES:
    module_page[num] = cur
    cur += 1
    for sl in slugs:
        page_of[sl] = cur
        cur += 2
P_HARM, P_FIM = cur, cur + 1
by_slug = {r['slug']: r for r in RECIPES}
order = [sl for _, _, _, slugs in MODULES for sl in slugs]
assert len(order) == len(RECIPES) == 28, (len(order), len(RECIPES))
number = {sl: i + 1 for i, sl in enumerate(order)}

# 1. capa
cov = 'file://' + os.path.join(ORIG, 'cover_photo.jpg')
pages.append(f'''<section class="page cover2"><div class="frame"></div><div class="frame2"></div>
<div class="top">{monogram(13)}<div class="brand" style="font-family:'DSans';font-size:8.5pt;letter-spacing:.42em;color:var(--gold-l);margin-top:3mm">NORQVA</div>
<div class="t1">{E(BOOK['title'])}</div><div class="t2">{E(BOOK['subtitle'])}</div>
<div style="margin-top:6mm">{orn(46, "#b39a75")}</div></div>
<div class="ph" style="background-image:url('{cov}')"></div>
<div class="bottom"><div style="font-family:'DSerif';font-size:10pt;letter-spacing:.3em">{E(BOOK['count'].upper())}</div>
<div style="font-family:'DSans';font-weight:700;font-size:7.6pt;letter-spacing:.42em;color:var(--gold-l);margin-top:5mm">NORQVA EDITORIAL</div></div></section>''')

# 2. sumário
mods = []
for num, mtitle, msub, slugs in MODULES:
    rows = ''.join(f'<div class="r"><span class="n">{number[sl]:02d}</span><span class="t">{E(by_slug[sl]["title"])}</span><span class="p">{page_of[sl]:02d}</span></div>' for sl in slugs)
    mods.append(f'<div class="mod"><div class="mh">Módulo {num} · {E(mtitle)}</div>{rows}</div>')
extra = (f'<div class="mod"><div class="mh">Referência</div>'
         f'<div class="r"><span class="n"></span><span class="t">Como usar este livro</span><span class="p">{P_USE:02d}</span></div>'
         f'<div class="r"><span class="n"></span><span class="t">Os 4 princípios fundamentais</span><span class="p">{P_PRIN:02d}</span></div>'
         f'<div class="r"><span class="n"></span><span class="t">Harmonização de massas &amp; molhos</span><span class="p">{P_HARM:02d}</span></div>'
         f'<div class="r"><span class="n"></span><span class="t">Encerramento</span><span class="p">{P_FIM:02d}</span></div></div>')
toc = f'''<div class="kicker" style="margin-top:3mm">Sumário</div><h1 class="big">28 receitas em 5 módulos</h1>
<div class="toc2">{''.join(mods)}{extra}</div>
<p style="font-family:'DSerif';font-style:italic;font-size:9pt;color:var(--gray);margin-top:3mm">As fotografias deste livro são ilustrativas e mostram uma sugestão de apresentação. O seu prato pode variar na cor e no formato.</p>'''
pages.append(page(toc, P_TOC, "Sumário"))

# 3. como usar
use = f'''<div class="kicker" style="margin-top:3mm">Antes de começar</div><h1 class="big">Como usar este livro</h1>
<p class="lead" style="max-width:150mm">Uma boa massa italiana pede poucos ingredientes e muita atenção ao ponto. Este livro vai do básico ao forno:
comece pelos fundamentos e, depois, combine massas e molhos como quiser.</p>
<div style="margin:4mm 0">{orn(40)}</div>
<div class="two prose"><div>
<div class="sec">Como ler as receitas</div>
<p>Cada receita traz <b>rendimento</b>, <b>tempo de preparo</b>, tempo de <b>cozimento</b> ou de <b>forno</b> e <b>nível</b>.
Os ingredientes vêm em gramas e mililitros, com a medida caseira entre parênteses. Sempre que possível, use balança.</p>
<p>Leia a receita inteira antes de começar e deixe tudo separado na bancada: massa e molho ficam prontos quase ao mesmo tempo.</p>
<p>As temperaturas de forno são em graus Celsius, com o <b>forno preaquecido</b> por pelo menos 15 minutos. Observe o ponto descrito, além do tempo.</p>
<div class="sec" style="margin-top:5mm">Medidas caseiras usadas</div>
<table class="measures" style="width:100%;border-collapse:collapse">
<tr><td>1 xícara (chá)</td><td>240 ml</td></tr><tr><td>1 colher de sopa</td><td>15 ml</td></tr>
<tr><td>1 colher de chá</td><td>5 ml</td></tr><tr><td>1 xícara de farinha de trigo</td><td>cerca de 120 g</td></tr>
<tr><td>Sal da água do cozimento</td><td>10 g por litro</td></tr></table></div>
<div><div class="sec">Utensílios básicos</div>
<ul class="ing" style="list-style:none">
{''.join(f'<li style="position:relative;padding-left:3.6mm;margin-bottom:1.5mm">{x}</li>' for x in [
"Balança de cozinha e jogo de xícaras e colheres medidoras",
"Panela grande (5 litros) para cozinhar a massa",
"Frigideira larga para terminar a massa no molho",
"Rolo de massa, faca afiada e espátula de massa",
"Termômetro culinário (indispensável para a carbonara)",
"Escumadeira e pegador de massa",
"Refratário de 20 × 30 cm para os pratos de forno",
"Assadeira e papel-manteiga para pizza e focaccia",
"Ralador fino para queijos e raspas"])}
</ul>
<div class="tip" style="margin-top:6mm"><div class="label">{leaf()} Massa e molho juntos</div>
<p>Guarde sempre uma xícara da água do cozimento antes de escorrer: ela une o molho à massa. Veja o princípio 04, na página {P_PRIN:02d}.</p></div>
</div></div>'''
pages.append(page(use, P_USE, "Antes de começar"))

# 4. princípios
maos = 'file://' + os.path.join(ORIG, 'maos.jpg')
cards = ''.join(f'<div class="pcard"><div class="pn">{i+1:02d}</div><h3>{E(t)}</h3><p>{E(d)}</p></div>' for i, (t, d) in enumerate(PRINCIPLES))
prin = f'''<div style="display:grid;grid-template-columns:1fr 62mm;gap:7mm;height:100%">
<div><div class="kicker" style="margin-top:3mm">Fundamentos</div><h1 class="big">Os 4 princípios fundamentais</h1>
<p class="lead" style="margin-bottom:5mm">Quatro regras que valem para todas as receitas do livro.</p>{cards}</div>
<div style="display:flex;flex-direction:column;gap:5mm"><div style="flex:1;background:url('{maos}') center/cover;border-radius:1mm"></div>
<p style="font-family:'DSerif';font-style:italic;font-size:12pt;line-height:1.45;color:var(--ink)">{E(HIGHLIGHT)}</p></div></div>'''
pages.append(page(prin, P_PRIN, "Fundamentos"))

# módulos e receitas
for num, mtitle, msub, slugs in MODULES:
    lst = ''.join(f'<div><b>{number[sl]:02d}</b>{E(by_slug[sl]["title"])}</div>' for sl in slugs)
    pages.append(f'''<section class="page module"><div class="num">{num}</div>
<div class="mt"><div class="k">MÓDULO {num}</div><h2>{E(mtitle)}</h2><p>{E(msub)}</p></div>
<div class="list">{lst}</div>
<div class="ftr"><span class="l">{FOOT}</span><span class="r">{module_page[num]:02d}</span></div></section>''')
    for sl in slugs:
        r = by_slug[sl]; n = number[sl]
        url = photo_url(r['img'])
        if not url: MISSING.append(r['img'])
        ph = (f'<div class="photo" style="background-image:url(\'{url}\')"></div>' if url
              else f'<div class="photo placeholder">foto em produção · {E(r["img"])}</div>')
        ometa = ''.join(f'<div><div class="label">{E(k)}</div><div class="v">{E(v)}</div></div>' for k, v in r["meta"] if k in ("Rendimento", "Preparo", "Nível"))
        pages.append(f'<section class="page opener">{ph}<div class="obody"><div class="kicker">Módulo {num} · Receita</div><div class="onum">{n:02d}</div>'
                     f'<div class="otitle">{E(r["title"])}</div><div class="label otag">{E(r["tag"])}</div>'
                     f'<div class="ointro">{E(r["intro"])}</div><div class="ometa">{ometa}</div></div>'
                     f'<div class="ftr"><span class="l">{FOOT}</span><span class="r">{page_of[sl]:02d}</span></div></section>')
        meta = ''.join(f'<div><div class="label">{E(k)}</div><div class="v">{E(v)}</div></div>' for k, v in r["meta"])
        ing = ''.join(f'<h4>{E(g)}</h4><ul>' + ''.join(f'<li>{E(x)}</li>' for x in items) + '</ul>' for g, items in r["ingredients"])
        steps = ''.join(f'<div class="st"><span class="k">{j+1:02d}</span><span class="x">{E(s)}</span></div>' for j, s in enumerate(r["steps"]))
        nt = lambda k, v: f'<div class="note{" safe" if k.startswith("Segurança") else ""}"><div class="label">{E(k)}</div><p>{E(v)}</p></div>'
        left = r.get("left", [])
        notes = ''.join(nt(k, v) for k, v in r["notes"] if k not in left)
        lnotes = ''.join(nt(k, v) for k, v in r["notes"] if k in left)
        tip = f'<div class="tip"><div class="label">{leaf()} Dica do Chef</div><p>{E(r["tip"])}</p></div>' if r.get("tip") else ''
        body = f'''<div class="rtop"><div class="rnum">{n:02d}</div><div style="flex:1">
<div class="rtitle">{E(r["title"])}</div><div class="label rtag">{E(r["tag"])}</div></div></div>
<div class="meta">{meta}</div>
<div class="cols"><div class="ing"><div class="sec">Ingredientes &amp; medidas</div>{ing}{tip}{lnotes}</div>
<div class="steps"><div class="sec">Modo de preparo</div>{steps}{notes}</div></div>
<div class="endorn">{orn(34)}<div>{E(r["title"])}</div></div>'''
        pages.append(page(body, page_of[sl] + 1, f"Receita {n:02d} — {E(r['title'])}"))

# harmonização
trs = ''.join('<tr>' + ''.join(f'<td class="{"n" if i == 0 else ("g" if i == 1 else "")}">{E(c)}</td>' for i, c in enumerate(row)) + '</tr>' for row in PAIRINGS)
ths = ''.join(f'<th>{E(h)}</th>' for h in PAIRINGS_HEAD)
jantar = 'file://' + os.path.join(ORIG, 'jantar.jpg')
harm = f'''<div style="display:grid;grid-template-columns:1fr 58mm;gap:7mm;height:100%">
<div><div class="kicker" style="margin-top:3mm">Referência</div>
<h1 class="big" style="text-transform:none;font-weight:700;font-size:22pt">Harmonização de massas &amp; molhos</h1>
<p style="font-size:9.8pt;line-height:1.5;margin-bottom:4mm">{E(PAIRINGS_INTRO)}</p>
<table class="t"><tr>{ths}</tr>{trs}</table>
<div class="tip" style="margin-top:6mm"><div class="label">{leaf()} Regra de bolso</div>
<p>Massa fina e delicada pede molho leve; massa larga, porosa ou recheada aguenta molhos encorpados e de forno.</p></div></div>
<div class="panel" style="padding:0;display:flex;flex-direction:column">
<div style="height:120mm;background:url('{jantar}') center/cover"></div>
<div style="padding:7mm 6mm"><div class="q">&ldquo;</div><div class="qt">{E(PAIRINGS_QUOTE)}</div><hr>
<div class="label">Filosofia Norqva</div><p style="margin-top:3mm">Poucos ingredientes, bem escolhidos, e atenção ao ponto da massa.</p></div></div></div>'''
pages.append(page(harm, P_HARM, "Referência gastronômica"))

# encerramento
fim = f'''<div style="height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
{monogram(18, "#9e7e4e")}
<div style="font-family:'DSerif';font-weight:700;font-size:22pt;line-height:1.3;margin-top:10mm;text-transform:uppercase;max-width:150mm">{E(CLOSING['title'])}</div>
<div style="margin:7mm 0">{orn(46)}</div>
<p class="lead" style="max-width:125mm">{E(CLOSING['text'])}</p>
<p style="font-family:'DSerif';font-style:italic;font-weight:700;color:var(--gold);font-size:12pt;margin-top:8mm">{E(CLOSING['signoff'])}</p>
<div style="margin-top:22mm;border-top:.6pt solid var(--rule);padding-top:5mm;width:110mm">
<div class="label" style="letter-spacing:.3em">Norqva Editorial</div>
<p style="font-size:8pt;color:var(--gray);margin-top:2mm">Trattoria em Casa — Massas &amp; Molhos Italianos<br>Edição Digital 2026 · Fotografias ilustrativas</p></div></div>'''
pages.append(page(fim, P_FIM, "Trattoria em Casa"))

doc = f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Trattoria em Casa</title><style>{CSS}</style></head><body>{"".join(pages)}</body></html>'
out_html = os.path.join(HERE, "trattoria.html")
open(out_html, "w", encoding="utf-8").write(doc)

from playwright.sync_api import sync_playwright
OUT = os.path.join(HERE, "TRATTORIA_EM_CASA_EDICAO_2026.pdf")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args=["--allow-file-access-from-files"])
    pg = b.new_page()
    pg.goto("file://" + out_html)
    pg.wait_for_timeout(1500)
    pg.evaluate("""() => { document.querySelectorAll('.endorn').forEach(o=>{
        const b=o.parentElement; const top=o.getBoundingClientRect().top; let maxB=0;
        b.querySelectorAll('*').forEach(e=>{ if(o.contains(e)||e===o) return; const r=e.getBoundingClientRect(); if(r.height>0) maxB=Math.max(maxB,r.bottom)});
        if (top - maxB < 40) o.remove(); }); }""")
    over = pg.evaluate("""() => [...document.querySelectorAll('.page')].map((p,i)=>{
        const b=p.querySelector('.body'); if(!b) return null;
        let maxB=0; b.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect(); if(r.height>0) maxB=Math.max(maxB,r.bottom)});
        const br=b.getBoundingClientRect();
        return {page:i+1, free_mm: Math.round((br.bottom-maxB)/3.7795)}; }).filter(o=>o && o.free_mm < 0)""")
    print('PAGINAS ESTOURADAS:', over)
    pg.pdf(path=OUT, width="210mm", height="297mm", print_background=True, margin=dict(top="0", bottom="0", left="0", right="0"))
    b.close()
print('páginas:', len(pages), '| fotos faltando:', len(MISSING), MISSING)
