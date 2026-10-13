# -*- coding: utf-8 -*-
"""Gera ANTIPASTI_E_APERITIVO.pdf (Volume IV da coleção Cozinha Italiana em Casa).

Mesmo visual do Volume III (paes/build_paes.py). Roda no Linux e no Windows: as fontes Liberation são usadas quando
existem; no Windows entram Times New Roman e Arial, que têm as mesmas medidas. O Chromium é o do Playwright,
ou o de /opt/pw-browsers quando existir.
Uso: python build_antipasti.py  (fotos: python gerar_fotos.py)
"""
import glob, html, os, sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content_antipasti import RECIPES, PAIRINGS, PLANNING

HERE = os.path.dirname(os.path.abspath(__file__))
E = html.escape
FOOT = "Antipasti & Aperitivo • Edição Digital 2026"
JPG = os.path.join(HERE, "jpg")
IMG = {r["slug"]: f"{i + 1:02d}_{r['slug']}" for i, r in enumerate(RECIPES)}
SHORT = ["Bruschetta", "Crostini", "Caponata", "Pimentões assados", "Abobrinha à scapece", "Involtini",
         "Cogumelos recheados", "Frittata", "Arancini", "Polpettine", "Tagliere", "Spritz"]
assert len(SHORT) == len(RECIPES) == 12


def uri(path):
    return Path(path).resolve().as_uri()


def font_faces():
    lib = "/usr/share/fonts/truetype/liberation/"
    if os.path.isdir(lib):
        serif = [lib + f"LiberationSerif-{s}.ttf" for s in ("Regular", "Bold", "Italic", "BoldItalic")]
        sans = [lib + f"LiberationSans-{s}.ttf" for s in ("Regular", "Bold", "Italic")]
    else:  # Windows: métricas iguais às da Liberation
        w = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
        serif = [os.path.join(w, f) for f in ("times.ttf", "timesbd.ttf", "timesi.ttf", "timesbi.ttf")]
        sans = [os.path.join(w, f) for f in ("arial.ttf", "arialbd.ttf", "ariali.ttf")]
    css = ""
    for src, wgt, sty in zip(serif, (400, 700, 400, 700), ("normal", "normal", "italic", "italic")):
        css += f"@font-face{{font-family:'DSerif';src:url('{uri(src)}');font-weight:{wgt};font-style:{sty}}}\n"
    for src, wgt, sty in zip(sans, (400, 700, 400), ("normal", "normal", "italic")):
        css += f"@font-face{{font-family:'DSans';src:url('{uri(src)}');font-weight:{wgt};font-style:{sty}}}\n"
    return css


CSS = font_faces() + """
:root{--bg:#faf8f5;--ink:#1a1a1a;--gold:#9e7e4e;--gold-l:#b39a75;--rule:#e5dfd5;--box:#f2ece2;--gray:#595857;--green:#2f3a30;--dark:#161817}
@page{size:210mm 297mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'DSans',sans-serif;font-size:9.4pt;line-height:1.45}
.page{width:210mm;height:297mm;position:relative;overflow:hidden;background:var(--bg);page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
.hdr{position:absolute;top:9mm;left:16mm;right:16mm;height:7mm;border-bottom:.6pt solid var(--rule);display:flex;justify-content:space-between;align-items:flex-start}
.hdr .l{font-family:'DSerif';font-weight:700;font-size:6.6pt;letter-spacing:.32em;color:var(--gold);text-transform:uppercase}
.hdr .r{font-size:6.8pt;color:var(--gray);letter-spacing:.04em}
.ftr{position:absolute;bottom:9mm;left:16mm;right:16mm;border-top:.6pt solid var(--rule);padding-top:2.2mm;display:flex;justify-content:space-between}
.ftr .l{font-family:'DSerif';font-style:italic;font-size:7pt;color:var(--gray)}
.ftr .r{font-family:'DSerif';font-weight:700;font-size:7.6pt}
.body{position:absolute;top:21mm;bottom:20mm;left:16mm;right:16mm;overflow:hidden}
.kicker{font-family:'DSerif';font-weight:700;font-size:7pt;letter-spacing:.32em;color:var(--gold);text-transform:uppercase}
.label{font-family:'DSans';font-weight:700;font-size:6.8pt;letter-spacing:.16em;color:var(--gold);text-transform:uppercase}
h1.big{font-family:'DSerif';font-weight:400;font-size:25pt;line-height:1.1;margin:2mm 0 4mm;text-transform:uppercase}
.lead{font-family:'DSerif';font-style:italic;font-size:11pt;color:var(--gray);line-height:1.45}
.sec{font-family:'DSerif';font-weight:700;font-size:8pt;letter-spacing:.24em;color:var(--gold);text-transform:uppercase;border-bottom:.6pt solid var(--rule);padding-bottom:1.6mm;margin-bottom:2.6mm}
p{margin-bottom:2.4mm}
.orn{display:block;margin:0 auto}
.cover{background:var(--dark);color:#efe7da}
.cover .frame{position:absolute;inset:11mm;border:.7pt solid rgba(179,154,117,.55)}
.cover .frame2{position:absolute;inset:13mm;border:.4pt solid rgba(179,154,117,.3)}
.cover .top{position:absolute;top:30mm;left:0;right:0;text-align:center}
.cover .brand{font-family:'DSans';font-size:8.5pt;letter-spacing:.42em;color:var(--gold-l);margin-top:3mm}
.cover .title{position:absolute;top:78mm;left:0;right:0;text-align:center}
.cover .t1{font-family:'DSerif';font-size:44pt;letter-spacing:.06em;line-height:1;color:#f3ece0}
.cover .t2{font-family:'DSerif';font-style:italic;font-size:30pt;color:var(--gold-l);margin-top:3mm;letter-spacing:.02em}
.cover .sub{font-family:'DSerif';font-size:13.5pt;letter-spacing:.14em;text-transform:uppercase;color:#c9b28c;margin-top:9mm;line-height:1.5}
.cover .bottom{position:absolute;bottom:26mm;left:0;right:0;text-align:center}
.cover .count{font-family:'DSerif';font-size:10pt;letter-spacing:.3em;color:#efe7da}
.cover .ed{font-family:'DSans';font-weight:700;font-size:7.6pt;letter-spacing:.42em;color:var(--gold-l);margin-top:5mm}
.cover .compl{font-family:'DSerif';font-style:italic;font-size:9pt;color:#a99d8a;margin-top:2.5mm}
.toc{margin-top:5mm;border-top:.6pt solid var(--rule)}
.toc .row{display:flex;align-items:baseline;border-bottom:.6pt solid var(--rule);padding:2.55mm 0}
.toc .n{font-family:'DSerif';font-size:15pt;width:16mm}
.toc .t{flex:1;font-weight:700;font-size:8.6pt;letter-spacing:.03em;text-transform:uppercase}
.toc .t i{font-family:'DSerif';font-weight:400;font-size:9pt;text-transform:none;letter-spacing:0;color:var(--gray);margin-left:2mm}
.toc .p{font-family:'DSerif';font-size:7.5pt;color:var(--gray);letter-spacing:.04em}
.rtop{display:flex;gap:7mm;align-items:flex-start}
.rnum{font-family:'DSerif';font-size:52pt;line-height:.9;color:var(--ink)}
.rtitle{font-family:'DSerif';font-weight:700;font-size:27pt;line-height:1.1;margin-top:.5mm}
.rtag{margin-top:2mm}
.meta{display:grid;grid-template-columns:1.25fr 1fr 1.1fr .7fr;border-top:.6pt solid var(--rule);border-bottom:.6pt solid var(--rule);margin:4.5mm 0 5mm}
.meta>div{padding:2.8mm 3mm 2.8mm 0}
.meta>div+div{padding-left:3.5mm;border-left:.6pt solid var(--rule)}
.meta .v{font-weight:700;font-size:9pt;line-height:1.3;margin-top:1.2mm}
.cols{display:grid;grid-template-columns:39% 1fr;gap:7mm}
.ing h4{font-family:'DSerif';font-style:italic;font-weight:400;font-size:10.8pt;color:var(--ink);margin:3.2mm 0 1.6mm}
.ing h4:first-of-type{margin-top:0}
.ing ul{list-style:none}
.ing li{position:relative;padding-left:3.6mm;margin-bottom:1.7mm;font-size:9.4pt;line-height:1.4;break-inside:avoid}
.ing li:before{content:'';position:absolute;left:0;top:1.9mm;width:1.3mm;height:1.3mm;background:var(--gold);transform:rotate(45deg)}
.steps .st{display:flex;gap:3mm;margin-bottom:3mm;break-inside:avoid}
.steps .st .k{font-family:'DSerif';font-weight:700;font-size:12.5pt;color:var(--gold);width:7mm;flex:none;line-height:1.15}
.steps .st .x{font-size:9.7pt;line-height:1.48}
.tip{background:var(--box);border-left:2.2pt solid var(--gold);padding:4.5mm 4.5mm;margin-top:6mm}
.tip .label{margin-bottom:1.4mm;display:flex;align-items:center;gap:2mm}
.tip p{font-family:'DSerif';font-style:italic;font-size:10.6pt;line-height:1.45;margin:0}
.note{border:.6pt solid var(--rule);background:#fff;padding:3mm 3.6mm;margin-top:3mm}
.note .label{margin-bottom:1mm}
.note p{font-size:8.9pt;line-height:1.42;margin:0}
.endorn{position:absolute;left:0;right:0;bottom:2mm;text-align:center;font-family:'DSerif';font-style:italic;font-size:9pt;color:var(--gold)}
.endorn div{margin-top:1mm}
.note.safe{border-color:var(--gold-l)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:8mm}
.card{background:var(--box);padding:5mm 6mm}
.card h3{font-family:'DSerif';font-weight:700;font-size:13pt;margin-bottom:2mm}
.card p{font-size:9.8pt;line-height:1.5;margin:0}
.prose p{font-size:10pt;line-height:1.55;margin-bottom:3.2mm}
table.t{width:100%;border-collapse:collapse;margin-top:2mm}
table.t th{font-family:'DSerif';font-weight:700;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);text-align:left;padding:2mm 3mm 2mm 0;border-bottom:.6pt solid var(--rule)}
table.t td{font-size:9.3pt;padding:3mm 3mm 3mm 0;border-bottom:.6pt solid var(--rule);vertical-align:top;line-height:1.38}
table.t td.n{font-weight:700}
table.t td.g{color:var(--gold);font-weight:700}
.panel{background:var(--green);color:#efe7da;padding:8mm 7mm}
.panel .q{font-family:'DSerif';font-size:30pt;color:var(--gold-l);line-height:.6;height:7mm}
.panel .qt{font-family:'DSerif';font-style:italic;font-size:12pt;line-height:1.5}
.panel .label{color:var(--gold-l)}
.panel hr{border:0;border-top:.6pt solid rgba(179,154,117,.45);margin:6mm 0 4mm}
.panel p{font-size:8.6pt;line-height:1.5;color:#ddd5c6}
.measures td{font-size:8.6pt;padding:1.6mm 2mm 1.6mm 0;border-bottom:.6pt solid var(--rule)}
.measures td:last-child{text-align:right;font-weight:700}
.cover-photo{background-size:cover;background-position:center 62%}
.cover-photo .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,15,14,.93) 0%,rgba(14,15,14,.78) 30%,rgba(14,15,14,.15) 52%,rgba(14,15,14,0) 70%,rgba(14,15,14,.72) 88%,rgba(14,15,14,.92) 100%)}
.opener .photo{position:absolute;top:0;left:0;right:0;height:148mm;background-size:cover;background-position:center;background-color:#e9e1d4}
.opener .photo:after{content:'';position:absolute;left:0;right:0;bottom:0;height:.8mm;background:var(--gold)}
.opener .obody{position:absolute;top:160mm;left:20mm;right:20mm;bottom:22mm}
.opener .onum{font-family:'DSerif';font-size:64pt;line-height:.85;color:var(--gold)}
.opener .otitle{font-family:'DSerif';font-weight:700;font-size:34pt;line-height:1.08;margin-top:3mm}
.opener .otag{margin-top:3mm}
.opener .ointro{font-family:'DSerif';font-style:italic;font-size:13pt;line-height:1.5;color:var(--gray);margin-top:6mm;max-width:150mm}
.opener .ometa{display:flex;gap:9mm;margin-top:7mm;border-top:.6pt solid var(--rule);padding-top:3.5mm}
.opener .ometa .v{font-weight:700;font-size:9pt;margin-top:1mm}
"""


def orn(w=60, color="#9e7e4e"):
    return (f'<svg class="orn" width="{w}mm" height="4mm" viewBox="0 0 120 8" xmlns="http://www.w3.org/2000/svg">'
            f'<line x1="0" y1="4" x2="50" y2="4" stroke="{color}" stroke-width=".5"/>'
            f'<line x1="70" y1="4" x2="120" y2="4" stroke="{color}" stroke-width=".5"/>'
            f'<path d="M60 0 L64 4 L60 8 L56 4 Z" fill="{color}"/>'
            f'<circle cx="52.5" cy="4" r=".9" fill="{color}"/><circle cx="67.5" cy="4" r=".9" fill="{color}"/></svg>')


def monogram(size=14, color="#b39a75"):
    return (f'<svg width="{size}mm" height="{size}mm" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">'
            f'<path d="M20 1 L39 20 L20 39 L1 20 Z" fill="none" stroke="{color}" stroke-width=".8"/>'
            f'<path d="M20 5 L35 20 L20 35 L5 20 Z" fill="none" stroke="{color}" stroke-width=".4"/>'
            f'<text x="20" y="25.2" text-anchor="middle" font-family="DSerif" font-style="italic" font-size="15" fill="{color}">A</text></svg>')


def leaf(color="#9e7e4e"):
    return (f'<svg width="3.4mm" height="3.4mm" viewBox="0 0 10 10"><path d="M5 0 L10 5 L5 10 L0 5 Z" fill="none" stroke="{color}" stroke-width="1.1"/>'
            f'<path d="M5 3 L7 5 L5 7 L3 5 Z" fill="{color}"/></svg>')


def page(body, n, hdr):
    return (f'<section class="page"><div class="hdr"><span class="l">{hdr}</span><span class="r">NORQVA EDITORIAL</span></div>'
            f'<div class="body">{body}</div>'
            f'<div class="ftr"><span class="l">{FOOT}</span><span class="r">{n:02d}</span></div></section>')


def li(items):
    return ''.join(f'<li style="position:relative;padding-left:3.6mm;margin-bottom:1.5mm">{x}</li>' for x in items)


pages = []

# 1. capa
menu = '<br>'.join(' <b>·</b> '.join(SHORT[a:b]) for a, b in [(0, 4), (4, 8), (8, 12)])
cov = uri(os.path.join(JPG, "00_capa.jpg"))
pages.append(f'''<section class="page cover cover-photo" style="background-image:url('{cov}')"><div class="shade"></div><div class="frame"></div><div class="frame2"></div>
<div class="top" style="top:22mm">{monogram(13)}<div class="brand">NORQVA</div></div>
<div class="title" style="top:50mm"><div class="t1">ANTIPASTI</div><div class="t2">&amp; Aperitivo</div>
<div style="margin-top:6mm">{orn(46, "#b39a75")}</div>
<div class="sub" style="margin-top:6mm">Para abrir a mesa<br>à italiana</div></div>
<div class="bottom" style="bottom:24mm"><div class="count">12 RECEITAS SELECIONADAS</div><div class="ed">NORQVA EDITORIAL</div>
<div class="compl" style="color:#c9bca6">Coleção Cozinha Italiana em Casa · Volume IV</div></div></section>''')

# numeração: capa 1, sumário 2, abertura 3, técnicas 4, receitas (abertura com foto + receita), planejamento, harmonização, fim
P_ABERT, P_TEC, P_REC0 = 3, 4, 5
P_PLAN = P_REC0 + 2 * len(RECIPES)
P_HARM, P_FIM = P_PLAN + 1, P_PLAN + 2

# 2. sumário
rows = []


def row(n, t, p, sub=""):
    sub = f'<i>{E(sub)}</i>' if sub else ""
    rows.append(f'<div class="row"><span class="n">{n}</span><span class="t">{E(t)}{sub}</span><span class="p">PÁG. {p:02d}</span></div>')


row("", "Antes de começar", P_ABERT, "Como usar, utensílios, ingredientes")
row("", "Três técnicas que se repetem", P_TEC, "Legumes assados, fritura, mesa segura")
for i, r in enumerate(RECIPES):
    row(f"{i + 1:02d}", r["title"], P_REC0 + 2 * i)
row("", "Planejando o aperitivo", P_PLAN, "O que adiantar e conservação")
row("", "Qual antepasto para cada ocasião", P_HARM)
row("", "Encerramento", P_FIM)
toc = f'''<div class="kicker" style="margin-top:3mm">Sumário</div><h1 class="big">Para começar a refeição</h1>
<div class="toc">{''.join(rows)}</div>
<p style="font-family:'DSerif';font-style:italic;font-size:9pt;color:var(--gray);margin-top:5mm">As fotografias deste livro são ilustrativas e mostram uma sugestão de apresentação. O seu prato pode variar na cor e no formato.</p>'''
pages.append(page(toc, 2, "Sumário"))

# 3. abertura
ab = f'''<div class="kicker" style="margin-top:3mm">Antes de começar</div><h1 class="big">Como usar este livro</h1>
<p class="lead" style="max-width:155mm">Na Itália, a refeição de festa começa pelo antepasto, e o fim de tarde, pelo aperitivo:
um drinque, alguns petiscos e conversa. Estas doze receitas vão da bruschetta de meia hora aos arancini de domingo.</p>
<div style="margin:4mm 0">{orn(40)}</div>
<div class="two prose">
<div>
<div class="sec">Como ler as receitas</div>
<p>Cada receita começa com <b>rendimento</b>, tempo de <b>preparo</b>, tempo de <b>forno</b> ou de <b>descanso</b> e <b>nível</b>.
Os ingredientes vêm em gramas e mililitros, com a medida caseira entre parênteses.</p>
<p>Quase tudo pode ser adiantado. A página de planejamento, no fim do livro, mostra o que fazer na véspera e o que deixar para a hora,
para você receber sem passar a festa na cozinha.</p>
<p>O forno é sempre <b>preaquecido</b>. Os rendimentos valem para antepasto; se o prato for a refeição, conte metade das porções.</p>
<div class="sec" style="margin-top:4mm">Medidas caseiras usadas</div>
<table class="measures" style="width:100%;border-collapse:collapse">
<tr><td>1 xícara (chá) de líquido</td><td>240 ml</td></tr>
<tr><td>1 colher de sopa / de chá</td><td>15 ml / 5 ml</td></tr>
<tr><td>1 xícara de parmesão ralado fino</td><td>cerca de 80 g</td></tr>
<tr><td>1 xícara de farinha de rosca</td><td>cerca de 110 g</td></tr>
<tr><td>1 xícara de ricota amassada</td><td>cerca de 240 g</td></tr>
<tr><td>1 xícara de farinha de trigo</td><td>cerca de 120 g</td></tr>
<tr><td>1 xícara de arroz arbóreo</td><td>cerca de 200 g</td></tr>
<tr><td>1 colher de chá de sal fino</td><td>cerca de 6 g</td></tr>
</table>
</div>
<div>
<div class="sec">Utensílios básicos</div>
<ul class="ing" style="list-style:none">
{li(["Balança de cozinha e jogo de medidas",
     "Frigideira grande e frigideira canelada ou chapa",
     "Panela funda e termômetro culinário, para fritar",
     "Escumadeira e papel-toalha",
     "Assadeiras, papel-manteiga e refratário de 20 × 30 cm",
     "Forma quadrada de 20 × 20 cm",
     "Peneira e ralador",
     "Tábua grande de madeira e palitos",
     "Potes de vidro com tampa, para a geladeira"])}
</ul>
<div class="tip" style="margin-top:5mm"><div class="label">{leaf()} Segurança na cozinha</div>
<p>Comida pronta fica no máximo 2 horas fora da geladeira, e 1 hora em dia muito quente. Leve à mesa aos poucos e reponha.</p></div>
</div></div>
<div class="sec" style="margin-top:6mm">Três ingredientes que fazem diferença</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5mm">
<div class="card" style="padding:4mm 4.5mm"><h3 style="font-size:11pt">Azeite</h3><p style="font-size:8.9pt">Use azeite extravirgem para temperar e regar no fim. Para fritar, um óleo neutro (soja, girassol ou canola), mais barato e sem gosto.</p></div>
<div class="card" style="padding:4mm 4.5mm"><h3 style="font-size:11pt">Parmesão</h3><p style="font-size:8.9pt">Compre em pedaço e rale na hora: o ralado de pacote perde o aroma. Guarde o pedaço embrulhado em papel-manteiga, na geladeira.</p></div>
<div class="card" style="padding:4mm 4.5mm"><h3 style="font-size:11pt">Tomate</h3><p style="font-size:8.9pt">Para comer cru, só maduro, guardado fora da geladeira. Para cozinhar, o tomate pelado em lata é constante o ano todo.</p></div>
</div>'''
pages.append(page(ab, P_ABERT, "Antes de começar"))

# 4. técnicas
tec = f'''<div class="kicker" style="margin-top:3mm">Fundamentos</div><h1 class="big">Três técnicas que se repetem</h1>
<p class="lead" style="max-width:150mm">Quase todas as receitas do livro usam pelo menos uma destas técnicas. Vale lê-las uma vez com calma.</p>
<div style="margin:4mm 0 5mm">{orn(40)}</div>
<div class="card" style="margin-bottom:4mm"><div class="label" style="margin-bottom:1.5mm">01 — Receitas 03, 04, 05 e 06</div>
<h3>Legumes que douram, não cozinham no vapor</h3>
<p>Berinjela, abobrinha e pimentão soltam muita água. Para dourarem, precisam de <b>superfície seca</b> e <b>espaço</b>: seque bem com
pano ou papel-toalha e não encha a frigideira ou a assadeira. Legume amontoado cozinha no próprio vapor, fica mole e pálido.
Na berinjela, o sal antes de fritar tira água e faz ela absorver menos azeite.</p></div>
<div class="card" style="margin-bottom:4mm"><div class="label" style="margin-bottom:1.5mm">02 — Receitas 05 e 09</div>
<h3>Fritura segura e sequinha</h3>
<p>Use uma panela ou frigideira funda, com óleo até no máximo a <b>metade</b> da altura, e um <b>termômetro</b>: o ponto é 170 a 175 °C. Sem termômetro,
mergulhe a ponta de um palito de madeira: bolhinhas finas e contínuas em volta indicam o ponto. Frite poucas peças por vez, para o óleo
não esfriar, e escorra sobre papel-toalha. Nunca deixe a panela sozinha; em caso de fogo, tampe e desligue, nunca jogue água.</p></div>
<div class="card"><div class="label" style="margin-bottom:1.5mm">03 — Todas as receitas</div>
<h3>Mesa farta e segura</h3>
<p>Antepasto fica exposto mais tempo que outros pratos. A regra é: comida pronta no máximo <b>2 horas</b> fora da geladeira
(1 hora em dia muito quente). Legumes com alho no azeite ficam sempre na geladeira e duram até 4 dias. Carne moída e ovos
vão à mesa bem cozidos, sem parte rosada nem líquida.</p></div>
<div class="sec" style="margin-top:6mm">O que vale para todas as receitas</div>
<div class="two prose" style="gap:8mm"><div>
<p>Prove e acerte o sal no fim, depois de juntar ingredientes salgados como alcaparras, azeitonas, parmesão e frios.
Pratos servidos frios pedem um pouco mais de tempero que os quentes.</p></div><div>
<p>Pratos marinados, como a caponata e os pimentões, melhoram de um dia para o outro. Tire da geladeira 20 a 30 minutos antes
de servir: o frio esconde o sabor do azeite.</p></div></div>'''
pages.append(page(tec, P_TEC, "Fundamentos"))

# receitas
for i, r in enumerate(RECIPES):
    n = i + 1
    meta = ''.join(f'<div><div class="label">{E(k)}</div><div class="v">{E(v)}</div></div>' for k, v in r["meta"])
    ing = ''.join(f'<h4>{E(g)}</h4><ul>' + ''.join(f'<li>{E(x)}</li>' for x in items) + '</ul>' for g, items in r["ingredients"])
    steps = ''.join(f'<div class="st"><span class="k">{j + 1:02d}</span><span class="x">{E(s)}</span></div>' for j, s in enumerate(r["steps"]))
    nt = lambda k, v: f'<div class="note{" safe" if k.startswith("Segurança") else ""}"><div class="label">{E(k)}</div><p>{E(v)}</p></div>'
    left = r.get("left", [])
    notes = ''.join(nt(k, v) for k, v in r["notes"] if k not in left)
    lnotes = ''.join(nt(k, v) for k, v in r["notes"] if k in left)
    tip = f'<div class="tip"><div class="label">{leaf()} Dica da cozinha</div><p>{E(r["tip"])}</p></div>'
    photo = uri(os.path.join(JPG, IMG[r["slug"]] + ".jpg"))
    ometa = ''.join(f'<div><div class="label">{E(k)}</div><div class="v">{E(v)}</div></div>' for k, v in r["meta"] if k in ("Rendimento", "Preparo", "Nível"))
    opener = (f'<section class="page opener"><div class="photo" style="background-image:url(\'{photo}\')"></div>'
              f'<div class="obody"><div class="kicker">Receita</div><div class="onum">{n:02d}</div>'
              f'<div class="otitle">{E(r["title"])}</div><div class="label otag">{E(r["tag"])}</div>'
              f'<div class="ointro">{E(r["intro"])}</div><div class="ometa">{ometa}</div></div>'
              f'<div class="ftr"><span class="l">{FOOT}</span><span class="r">{P_REC0 + 2 * i:02d}</span></div></section>')
    pages.append(opener)
    body = f'''<div class="rtop"><div class="rnum">{n:02d}</div><div style="flex:1">
<div class="rtitle">{E(r["title"])}</div><div class="label rtag">{E(r["tag"])}</div></div></div>
<div class="meta">{meta}</div>
<div class="cols"><div class="ing"><div class="sec">Ingredientes &amp; medidas</div>{ing}{tip}{lnotes}</div>
<div class="steps"><div class="sec">Modo de preparo</div>{steps}{notes}</div></div>
<div class="endorn">{orn(34)}<div>{E(r["title"])}</div></div>'''
    pages.append(page(body, P_REC0 + 2 * i + 1, f"Receita {n:02d} — {E(r['title'])}"))

# planejamento
trs = ''.join(f'<tr><td class="n">{E(a)}</td><td>{E(b)}</td><td>{E(c)}</td></tr>' for a, b, c in PLANNING)
plan = f'''<div class="kicker" style="margin-top:3mm">Organização</div><h1 class="big">Planejando o aperitivo</h1>
<p class="lead" style="max-width:155mm">Um bom aperitivo se faz na véspera. No dia, sobra só o que precisa ir quente ou crocante à mesa:
fritar, assar e montar.</p>
<div style="margin:4mm 0 3mm">{orn(40)}</div>
<table class="t"><tr><th style="width:24%">Receita</th><th style="width:36%">Quando preparar</th><th>Conservação</th></tr>{trs}</table>
<div class="two" style="margin-top:5mm">
<div class="card" style="padding:4mm 5mm"><h3>Um roteiro para receber</h3><p>Véspera: caponata, pimentões, arroz dos arancini, creme de feijão e torradinhas.
No dia, de manhã: frittata e rolinhos montados. Uma hora antes: empanar os arancini e assar o que vai ao forno. Meia hora antes: montar a tábua. Na chegada: fritar, montar a bruschetta e servir o spritz.</p></div>
<div class="card" style="padding:4mm 5mm"><h3>Quanto fazer</h3><p>Para um aperitivo antes do jantar, 4 a 5 antepastos diferentes, 5 a 6 unidades por pessoa.
Se o aperitivo for a refeição, 8 a 10 por pessoa, e uma tábua mais farta.</p></div>
</div>'''
pages.append(page(plan, P_PLAN, "Organização"))

# harmonização
trs = ''.join(f'<tr><td class="n">{E(a)}<div style="font-weight:400;color:var(--gray);font-size:8pt;margin-top:1mm">{E(b)}</div></td>'
              f'<td class="g">{E(c)}</td><td>{E(d)}</td></tr>' for a, b, c, d in PAIRINGS)
harm = f'''<div style="display:grid;grid-template-columns:1fr 54mm;gap:7mm;height:100%">
<div><div class="kicker" style="margin-top:3mm">Referência</div>
<h1 class="big" style="text-transform:none;font-weight:700;font-size:22pt">Qual antepasto para cada ocasião</h1>
<p style="font-size:9.8pt;line-height:1.5;margin-bottom:4mm">As massas citadas estão no <i>Trattoria em Casa</i>, o primeiro volume da coleção, e os pães e grissini, no Volume III.
Use o quadro como ponto de partida, não como regra.</p>
<table class="t"><tr><th style="width:34%">Ocasião</th><th style="width:28%">Antepastos</th><th>Por quê</th></tr>{trs}</table>
<div class="tip" style="margin-top:5mm"><div class="label">{leaf()} Antipasto e aperitivo</div>
<p>O antipasto abre a refeição, à mesa. O aperitivo vem antes dela, de pé, com um drinque e petiscos de uma mordida. As receitas deste livro servem aos dois.</p></div>
</div>
<div class="panel"><div class="q">&ldquo;</div>
<div class="qt">A mesa italiana começa antes do primeiro prato: com pão, azeite, um petisco e boa conversa.</div>
<hr><div class="label">Filosofia Norqva</div>
<p style="margin-top:3mm">Comece pelas receitas rápidas, como a bruschetta e os crostini, e guarde os arancini para um domingo sem pressa.</p>
<div style="margin-top:14mm">{orn(40, "#b39a75")}</div>
<p style="margin-top:12mm">Escolha poucas receitas e faça bem: três antepastos caprichados valem mais que dez feitos às pressas.</p>
</div></div>'''
pages.append(page(harm, P_HARM, "Referência gastronômica"))

# encerramento
fim = f'''<div style="height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
{monogram(18, "#9e7e4e")}
<div style="font-family:'DSerif';font-weight:700;font-size:24pt;line-height:1.25;margin-top:10mm;text-transform:uppercase;max-width:150mm">
Antes do prato principal,<br>a conversa.</div>
<div style="margin:7mm 0">{orn(46)}</div>
<p class="lead" style="max-width:120mm">Que estas receitas abram muitas mesas na sua casa, com tempo para brindar,
beliscar e conversar sem pressa.</p>
<p style="font-family:'DSerif';font-style:italic;font-weight:700;color:var(--gold);font-size:12pt;margin-top:8mm">Buon appetito!</p>
<div style="margin-top:22mm;border-top:.6pt solid var(--rule);padding-top:5mm;width:120mm">
<div class="label" style="letter-spacing:.3em">Norqva Editorial</div>
<p style="font-size:8pt;color:var(--gray);margin-top:2mm">Antipasti &amp; Aperitivo — Coleção Cozinha Italiana em Casa, Volume IV<br>Edição Digital 2026 · Fotografias ilustrativas</p></div>
</div>'''
pages.append(page(fim, P_FIM, "Antipasti & Aperitivo"))

doc = f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Antipasti &amp; Aperitivo</title><style>{CSS}</style></head><body>{"".join(pages)}</body></html>'
doc = doc.replace(' °C', '&nbsp;°C')  # não quebrar a linha antes de °C
out_html = os.path.join(HERE, "antipasti.html")
open(out_html, "w", encoding="utf-8").write(doc)

missing = [p for p in [os.path.join(JPG, "00_capa.jpg")] + [os.path.join(JPG, v + ".jpg") for v in IMG.values()] if not os.path.exists(p)]
if missing:
    print("FOTOS FALTANDO:", *missing, sep="\n  ")

from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    kw = {"args": ["--allow-file-access-from-files"]}
    linux = glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome")
    if linux:
        kw["executable_path"] = linux[0]
    b = p.chromium.launch(**kw)
    pg = b.new_page()
    pg.goto(uri(out_html))
    pg.wait_for_timeout(1500)
    removed = pg.evaluate("""() => { let n=0; document.querySelectorAll('.endorn').forEach(o=>{
        const b=o.parentElement; const top=o.getBoundingClientRect().top; let maxB=0;
        b.querySelectorAll('*').forEach(e=>{ if(o.contains(e)||e===o) return; const r=e.getBoundingClientRect(); if(r.height>0) maxB=Math.max(maxB,r.bottom)});
        if (top - maxB < 40) { o.remove(); n++; } }); return n; }""")
    print('ornamentos removidos:', removed)
    over = pg.evaluate("""() => [...document.querySelectorAll('.page')].map((p,i)=>{
        const b=p.querySelector('.body'); if(!b) return null;
        let maxB=0; b.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect(); if(r.height>0) maxB=Math.max(maxB,r.bottom)});
        const br=b.getBoundingClientRect();
        return {page:i+1, free_mm: Math.round((br.bottom-maxB)/3.7795)}; }).filter(Boolean)""")
    for o in over:
        print(o, "  <-- ESTOURA" if o["free_mm"] < 0 else "")
    fonts = pg.evaluate("() => [...document.fonts].map(f=>f.family+':'+f.status)")
    print(set(fonts))
    pg.pdf(path=os.path.join(HERE, "ANTIPASTI_E_APERITIVO.pdf"), width="210mm", height="297mm", print_background=True,
           margin=dict(top="0", bottom="0", left="0", right="0"))
    b.close()
print("ok:", os.path.join(HERE, "ANTIPASTI_E_APERITIVO.pdf"))
