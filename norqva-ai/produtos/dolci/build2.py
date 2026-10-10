# -*- coding: utf-8 -*-
import html, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import RECIPES, PAIRINGS, PLANNING

HERE = os.path.dirname(os.path.abspath(__file__))
E = html.escape
FOOT = "Dolci della Nonna • Edição Digital 2026"
JPG = os.path.join(HERE, "jpg")
IMG = {'tiramisu': '01_tiramisu', 'pannacotta': '02_panna_cotta', 'nonna': '03_torta_della_nonna', 'caprese': '04_torta_caprese', 'cantucci': '05_cantucci', 'affogato': '06_affogato', 'zabaione': '07_zabaione', 'crostata': '08_crostata', 'budino': '09_budino', 'cannoli': '10_cannoli'}
F = "/usr/share/fonts/truetype/liberation/"

CSS = f"""
@font-face{{font-family:'DSerif';src:url('file://{F}LiberationSerif-Regular.ttf');font-weight:400;font-style:normal}}
@font-face{{font-family:'DSerif';src:url('file://{F}LiberationSerif-Bold.ttf');font-weight:700;font-style:normal}}
@font-face{{font-family:'DSerif';src:url('file://{F}LiberationSerif-Italic.ttf');font-weight:400;font-style:italic}}
@font-face{{font-family:'DSerif';src:url('file://{F}LiberationSerif-BoldItalic.ttf');font-weight:700;font-style:italic}}
@font-face{{font-family:'DSans';src:url('file://{F}LiberationSans-Regular.ttf');font-weight:400}}
@font-face{{font-family:'DSans';src:url('file://{F}LiberationSans-Bold.ttf');font-weight:700}}
@font-face{{font-family:'DSans';src:url('file://{F}LiberationSans-Italic.ttf');font-weight:400;font-style:italic}}
:root{{--bg:#faf8f5;--ink:#1a1a1a;--gold:#9e7e4e;--gold-l:#b39a75;--rule:#e5dfd5;--box:#f2ece2;--gray:#595857;--green:#2f3a30;--dark:#161817}}
@page{{size:210mm 297mm;margin:0}}
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{background:var(--bg);color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}}
body{{font-family:'DSans',sans-serif;font-size:9.4pt;line-height:1.45}}
.page{{width:210mm;height:297mm;position:relative;overflow:hidden;background:var(--bg);page-break-after:always;break-after:page}}
.page:last-child{{page-break-after:auto;break-after:auto}}
.hdr{{position:absolute;top:9mm;left:16mm;right:16mm;height:7mm;border-bottom:.6pt solid var(--rule);display:flex;justify-content:space-between;align-items:flex-start}}
.hdr .l{{font-family:'DSerif';font-weight:700;font-size:6.6pt;letter-spacing:.32em;color:var(--gold);text-transform:uppercase}}
.hdr .r{{font-size:6.8pt;color:var(--gray);letter-spacing:.04em}}
.ftr{{position:absolute;bottom:9mm;left:16mm;right:16mm;border-top:.6pt solid var(--rule);padding-top:2.2mm;display:flex;justify-content:space-between}}
.ftr .l{{font-family:'DSerif';font-style:italic;font-size:7pt;color:var(--gray)}}
.ftr .r{{font-family:'DSerif';font-weight:700;font-size:7.6pt}}
.body{{position:absolute;top:21mm;bottom:20mm;left:16mm;right:16mm;overflow:hidden}}
.kicker{{font-family:'DSerif';font-weight:700;font-size:7pt;letter-spacing:.32em;color:var(--gold);text-transform:uppercase}}
.label{{font-family:'DSans';font-weight:700;font-size:6.8pt;letter-spacing:.16em;color:var(--gold);text-transform:uppercase}}
h1.big{{font-family:'DSerif';font-weight:400;font-size:25pt;line-height:1.1;margin:2mm 0 4mm;text-transform:uppercase}}
.lead{{font-family:'DSerif';font-style:italic;font-size:11pt;color:var(--gray);line-height:1.45}}
.sec{{font-family:'DSerif';font-weight:700;font-size:8pt;letter-spacing:.24em;color:var(--gold);text-transform:uppercase;border-bottom:.6pt solid var(--rule);padding-bottom:1.6mm;margin-bottom:2.6mm}}
p{{margin-bottom:2.4mm}}
.orn{{display:block;margin:0 auto}}
/* ---------- capa ---------- */
.cover{{background:var(--dark);color:#efe7da}}
.cover .frame{{position:absolute;inset:11mm;border:.7pt solid rgba(179,154,117,.55)}}
.cover .frame2{{position:absolute;inset:13mm;border:.4pt solid rgba(179,154,117,.3)}}
.cover .top{{position:absolute;top:30mm;left:0;right:0;text-align:center}}
.cover .brand{{font-family:'DSans';font-size:8.5pt;letter-spacing:.42em;color:var(--gold-l);margin-top:3mm}}
.cover .title{{position:absolute;top:78mm;left:0;right:0;text-align:center}}
.cover .t1{{font-family:'DSerif';font-size:44pt;letter-spacing:.06em;line-height:1;color:#f3ece0}}
.cover .t2{{font-family:'DSerif';font-style:italic;font-size:30pt;color:var(--gold-l);margin-top:3mm;letter-spacing:.02em}}
.cover .sub{{font-family:'DSerif';font-size:13.5pt;letter-spacing:.14em;text-transform:uppercase;color:#c9b28c;margin-top:9mm;line-height:1.5}}
.cover .menu{{position:absolute;top:168mm;left:42mm;right:42mm;border-top:.6pt solid rgba(179,154,117,.5);border-bottom:.6pt solid rgba(179,154,117,.5);padding:6mm 0;text-align:center;font-family:'DSerif';font-style:italic;font-size:11pt;line-height:1.9;color:#d8ccb8}}
.cover .menu b{{color:var(--gold-l);font-style:normal;font-weight:400;padding:0 2mm}}
.cover .bottom{{position:absolute;bottom:26mm;left:0;right:0;text-align:center}}
.cover .count{{font-family:'DSerif';font-size:10pt;letter-spacing:.3em;color:#efe7da}}
.cover .ed{{font-family:'DSans';font-weight:700;font-size:7.6pt;letter-spacing:.42em;color:var(--gold-l);margin-top:5mm}}
.cover .compl{{font-family:'DSerif';font-style:italic;font-size:9pt;color:#a99d8a;margin-top:2.5mm}}
/* ---------- sumário ---------- */
.toc{{margin-top:6mm;border-top:.6pt solid var(--rule)}}
.toc .row{{display:flex;align-items:baseline;border-bottom:.6pt solid var(--rule);padding:3.15mm 0}}
.toc .n{{font-family:'DSerif';font-size:15pt;width:16mm}}
.toc .t{{flex:1;font-weight:700;font-size:8.6pt;letter-spacing:.03em;text-transform:uppercase}}
.toc .t i{{font-family:'DSerif';font-weight:400;font-size:9pt;text-transform:none;letter-spacing:0;color:var(--gray);margin-left:2mm}}
.toc .p{{font-family:'DSerif';font-size:7.5pt;color:var(--gray);letter-spacing:.04em}}
.toc .grp{{padding:4.5mm 0 1.6mm;border-bottom:.6pt solid var(--rule)}}
/* ---------- receita ---------- */
.rtop{{display:flex;gap:7mm;align-items:flex-start}}
.rnum{{font-family:'DSerif';font-size:52pt;line-height:.9;color:var(--ink)}}
.rtitle{{font-family:'DSerif';font-weight:700;font-size:27pt;line-height:1.1;margin-top:.5mm}}
.rtag{{margin-top:2mm}}
.rintro{{font-family:'DSerif';font-style:italic;font-size:11pt;color:var(--gray);line-height:1.45;margin-top:2.6mm}}
.meta{{display:grid;grid-template-columns:1.25fr 1fr 1.1fr .7fr;border-top:.6pt solid var(--rule);border-bottom:.6pt solid var(--rule);margin:4.5mm 0 5mm}}
.meta>div{{padding:2.8mm 3mm 2.8mm 0}}
.meta>div+div{{padding-left:3.5mm;border-left:.6pt solid var(--rule)}}
.meta .v{{font-weight:700;font-size:9pt;line-height:1.3;margin-top:1.2mm}}
.cols{{display:grid;grid-template-columns:39% 1fr;gap:7mm}}
.ing h4{{font-family:'DSerif';font-style:italic;font-weight:400;font-size:10.8pt;color:var(--ink);margin:3.2mm 0 1.6mm}}
.ing h4:first-of-type{{margin-top:0}}
.ing ul{{list-style:none}}
.ing li{{position:relative;padding-left:3.6mm;margin-bottom:1.7mm;font-size:9.4pt;line-height:1.4;break-inside:avoid}}
.ing li:before{{content:'';position:absolute;left:0;top:1.9mm;width:1.3mm;height:1.3mm;background:var(--gold);transform:rotate(45deg)}}
.steps .st{{display:flex;gap:3mm;margin-bottom:3mm;break-inside:avoid}}
.steps .st .k{{font-family:'DSerif';font-weight:700;font-size:12.5pt;color:var(--gold);width:7mm;flex:none;line-height:1.15}}
.steps .st .x{{font-size:9.7pt;line-height:1.48}}
.tip{{background:var(--box);border-left:2.2pt solid var(--gold);padding:4.5mm 4.5mm;margin-top:6mm}}
.tip .label{{margin-bottom:1.4mm;display:flex;align-items:center;gap:2mm}}
.tip p{{font-family:'DSerif';font-style:italic;font-size:10.6pt;line-height:1.45;margin:0}}
.note{{border:.6pt solid var(--rule);background:#fff;padding:3mm 3.6mm;margin-top:3mm}}
.note .label{{margin-bottom:1mm}}
.note p{{font-size:8.9pt;line-height:1.42;margin:0}}
/**/.endorn{{position:absolute;left:0;right:0;bottom:2mm;text-align:center;font-family:'DSerif';font-style:italic;font-size:9pt;color:var(--gold)}}
.endorn div{{margin-top:1mm}}
.note.safe{{border-color:var(--gold-l)}}
/* ---------- geral ---------- */
.two{{display:grid;grid-template-columns:1fr 1fr;gap:8mm}}
.card{{background:var(--box);padding:5mm 6mm}}
.card h3{{font-family:'DSerif';font-weight:700;font-size:13pt;margin-bottom:2mm}}
.card p{{font-size:9.8pt;line-height:1.5;margin:0}}
.prose p{{font-size:10pt;line-height:1.55;margin-bottom:3.2mm}}
.prose .ing li{{font-size:10pt;margin-bottom:2.4mm}}
.prose .measures td{{font-size:9.6pt;padding:2.4mm 2mm 2.4mm 0}}
table.t{{width:100%;border-collapse:collapse;margin-top:2mm}}
table.t th{{font-family:'DSerif';font-weight:700;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);text-align:left;padding:2mm 3mm 2mm 0;border-bottom:.6pt solid var(--rule)}}
table.t td{{font-size:9.3pt;padding:3.3mm 3mm 3.3mm 0;border-bottom:.6pt solid var(--rule);vertical-align:top;line-height:1.38}}
table.t td.n{{font-weight:700}}
table.t td.g{{color:var(--gold);font-weight:700}}
.panel{{background:var(--green);color:#efe7da;padding:8mm 7mm}}
.panel .q{{font-family:'DSerif';font-size:30pt;color:var(--gold-l);line-height:.6;height:7mm}}
.panel .qt{{font-family:'DSerif';font-style:italic;font-size:12pt;line-height:1.5}}
.panel .label{{color:var(--gold-l)}}
.panel hr{{border:0;border-top:.6pt solid rgba(179,154,117,.45);margin:6mm 0 4mm}}
.panel p{{font-size:8.6pt;line-height:1.5;color:#ddd5c6}}
.measures td{{font-size:8.6pt;padding:1.6mm 2mm 1.6mm 0;border-bottom:.6pt solid var(--rule)}}
.measures td:last-child{{text-align:right;font-weight:700}}
/* ---------- fotos ---------- */
.cover-photo{{background-size:cover;background-position:center 62%}}
.cover-photo .shade{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,15,14,.93) 0%,rgba(14,15,14,.78) 30%,rgba(14,15,14,.15) 52%,rgba(14,15,14,0) 70%,rgba(14,15,14,.72) 88%,rgba(14,15,14,.92) 100%)}}
.opener .photo{{position:absolute;top:0;left:0;right:0;height:148mm;background-size:cover;background-position:center}}
.opener .photo:after{{content:'';position:absolute;left:0;right:0;bottom:0;height:.8mm;background:var(--gold)}}
.opener .obody{{position:absolute;top:160mm;left:20mm;right:20mm;bottom:22mm}}
.opener .onum{{font-family:'DSerif';font-size:64pt;line-height:.85;color:var(--gold)}}
.opener .otitle{{font-family:'DSerif';font-weight:700;font-size:34pt;line-height:1.08;margin-top:3mm}}
.opener .otag{{margin-top:3mm}}
.opener .ointro{{font-family:'DSerif';font-style:italic;font-size:13pt;line-height:1.5;color:var(--gray);margin-top:6mm;max-width:150mm}}
.opener .ometa{{display:flex;gap:9mm;margin-top:7mm;border-top:.6pt solid var(--rule);padding-top:3.5mm}}
.opener .ometa .v{{font-weight:700;font-size:9pt;margin-top:1mm}}
"""

def orn(w=60, color="#9e7e4e"):
    # filete com losango central
    return (f'<svg class="orn" width="{w}mm" height="4mm" viewBox="0 0 120 8" xmlns="http://www.w3.org/2000/svg">'
            f'<line x1="0" y1="4" x2="50" y2="4" stroke="{color}" stroke-width=".5"/>'
            f'<line x1="70" y1="4" x2="120" y2="4" stroke="{color}" stroke-width=".5"/>'
            f'<path d="M60 0 L64 4 L60 8 L56 4 Z" fill="{color}"/>'
            f'<circle cx="52.5" cy="4" r=".9" fill="{color}"/><circle cx="67.5" cy="4" r=".9" fill="{color}"/></svg>')

def monogram(size=14, color="#b39a75"):
    # monograma geométrico simples: losango duplo com D
    return (f'<svg width="{size}mm" height="{size}mm" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">'
            f'<path d="M20 1 L39 20 L20 39 L1 20 Z" fill="none" stroke="{color}" stroke-width=".8"/>'
            f'<path d="M20 5 L35 20 L20 35 L5 20 Z" fill="none" stroke="{color}" stroke-width=".4"/>'
            f'<text x="20" y="25.2" text-anchor="middle" font-family="DSerif" font-style="italic" font-size="15" fill="{color}">D</text></svg>')

def leaf(color="#9e7e4e"):
    return (f'<svg width="3.4mm" height="3.4mm" viewBox="0 0 10 10"><path d="M5 0 L10 5 L5 10 L0 5 Z" fill="none" stroke="{color}" stroke-width="1.1"/>'
            f'<path d="M5 3 L7 5 L5 7 L3 5 Z" fill="{color}"/></svg>')

def page(body, n, hdr):
    return (f'<section class="page"><div class="hdr"><span class="l">{hdr}</span><span class="r">NORQVA EDITORIAL</span></div>'
            f'<div class="body">{body}</div>'
            f'<div class="ftr"><span class="l">{FOOT}</span><span class="r">{n:02d}</span></div></section>')

pages = []

# 1. capa
T=[r['title'] for r in RECIPES]
menu = '<br>'.join(' <b>·</b> '.join(T[a:b]) for a,b in [(0,4),(4,7),(7,10)])
cov = "file://" + os.path.join(JPG, "00_capa.jpg")
pages.append(f'''<section class="page cover cover-photo" style="background-image:url('{cov}')"><div class="shade"></div><div class="frame"></div><div class="frame2"></div>
<div class="top" style="top:22mm">{monogram(13)}<div class="brand">NORQVA</div></div>
<div class="title" style="top:52mm"><div class="t1">DOLCI</div><div class="t2">della Nonna</div>
<div style="margin-top:6mm">{orn(46, "#b39a75")}</div>
<div class="sub" style="margin-top:6mm">10 sobremesas italianas<br>para fechar o jantar</div></div>
<div class="bottom" style="bottom:24mm"><div class="count">10 RECEITAS SELECIONADAS</div><div class="ed">NORQVA EDITORIAL</div>
<div class="compl" style="color:#c9bca6">Complemento de Trattoria em Casa</div></div></section>''')

# numeração
P_ABERT, P_TEC, P_REC0 = 3, 4, 5
# cada receita = página de abertura (foto) + página da receita
P_PLAN = P_REC0 + 2 * len(RECIPES)
P_HARM, P_FIM = P_PLAN + 1, P_PLAN + 2

# 2. sumário
rows = []
def row(n, t, p, sub=""):
    sub = f'<i>{E(sub)}</i>' if sub else ""
    rows.append(f'<div class="row"><span class="n">{n}</span><span class="t">{E(t)}{sub}</span><span class="p">PÁG. {p:02d}</span></div>')
row("", "Antes de começar", P_ABERT, "Como usar, utensílios, ingredientes")
row("", "Três técnicas que se repetem", P_TEC, "Banho-maria, cremes, massa frola")
for i, r in enumerate(RECIPES):
    row(f"{i+1:02d}", r["title"], P_REC0 + 2 * i, r["tag"].split(" — ")[0])
row("", "Planejando a sobremesa", P_PLAN, "Antecedência e conservação")
row("", "Qual doce depois de qual prato", P_HARM)
row("", "Encerramento", P_FIM)
toc = f'''<div class="kicker" style="margin-top:3mm">Sumário</div><h1 class="big">Um passeio pelas sobremesas italianas</h1>
<div class="toc">{''.join(rows)}</div>
<p style="font-family:'DSerif';font-style:italic;font-size:9pt;color:var(--gray);margin-top:6mm">As fotografias deste livro são ilustrativas e mostram uma sugestão de apresentação. O seu doce pode variar na cor e no formato.</p>'''
pages.append(page(toc, 2, "Sumário"))

# 3. abertura
ab = f'''<div class="kicker" style="margin-top:3mm">Antes de começar</div><h1 class="big">Como usar este livro</h1>
<p class="lead" style="max-width:150mm">Na Itália, a sobremesa é um convite para ficar mais um pouco à mesa. Estas dez receitas fecham o cardápio da <i>Trattoria em Casa</i>: algumas se fazem na véspera, outras ficam prontas em minutos.</p>
<div style="margin:4mm 0">{orn(40)}</div>
<div class="two prose">
<div>
<div class="sec">Como ler as receitas</div>
<p>Cada receita começa com <b>rendimento</b>, <b>tempo de preparo</b>, tempo de <b>geladeira</b> ou de <b>forno</b> e <b>nível</b>.
Os ingredientes vêm em gramas e mililitros, com a medida caseira entre parênteses. Sempre que possível, use balança:
na confeitaria, pequenas diferenças mudam o resultado.</p>
<p>Leia a receita inteira antes de começar e separe todos os ingredientes na bancada. Ovos, manteiga e laticínios
saem da geladeira só quando a receita pedir.</p>
<p>Todas as temperaturas de forno são em graus Celsius, com o <b>forno preaquecido</b> por pelo menos 15 minutos.
Cada forno é diferente: observe o ponto indicado, além do tempo.</p>
<div class="sec" style="margin-top:5mm">Medidas caseiras usadas</div>
<table class="measures" style="width:100%;border-collapse:collapse">
<tr><td>1 xícara (chá)</td><td>240 ml</td></tr>
<tr><td>1 colher de sopa</td><td>15 ml</td></tr>
<tr><td>1 colher de chá</td><td>5 ml</td></tr>
<tr><td>1 xícara de farinha de trigo</td><td>cerca de 120 g</td></tr>
<tr><td>1 xícara de açúcar refinado</td><td>cerca de 180 g</td></tr>
</table>
</div>
<div>
<div class="sec">Utensílios básicos</div>
<ul class="ing" style="list-style:none">
{''.join(f'<li style="position:relative;padding-left:3.6mm;margin-bottom:1.5mm">{x}</li>' for x in [
"Balança de cozinha e jogo de xícaras e colheres medidoras",
"Batedor de arame (fouet) e espátula de silicone",
"Batedeira ou mixer com batedor (facilita chantili e claras)",
"Tigela refratária que se apoie sobre uma panela, para o banho-maria",
"Termômetro culinário (indispensável para tiramisù e zabaione)",
"Peneira fina",
"Forma de 22 cm e forma de 24 cm, de fundo removível",
"Refratário de 20 × 30 cm e 6 taças individuais",
"Assadeira grande e papel-manteiga",
"Rolo de massa, filme plástico e faca de serra"])}
</ul>
<div class="tip" style="margin-top:6mm"><div class="label">{leaf()} Fechando a Trattoria em Casa</div>
<p>As receitas deste livro completam o cardápio da <i>Trattoria em Casa</i>. Na página {P_HARM:02d} há um guia para escolher
o doce de acordo com o tipo de prato servido antes.</p></div>
</div></div>
<div class="sec" style="margin-top:7mm">Três ingredientes que fazem diferença</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5mm">
<div class="card" style="padding:4mm 4.5mm"><h3 style="font-size:11pt">Creme de leite fresco</h3><p style="font-size:8.9pt">O de geladeira, com cerca de 35% de gordura. É ele que bate em chantili; o creme de leite de caixinha não serve para isso.</p></div>
<div class="card" style="padding:4mm 4.5mm"><h3 style="font-size:11pt">Chocolate meio amargo</h3><p style="font-size:8.9pt">Prefira barras de 50% a 60% de cacau, para picar. Cobertura fracionada derrete diferente e muda a textura.</p></div>
<div class="card" style="padding:4mm 4.5mm"><h3 style="font-size:11pt">Limão e laranja</h3><p style="font-size:8.9pt">Rale só a parte colorida da casca, logo antes de usar. A parte branca amarga e o perfume se perde rápido.</p></div>
</div>'''
pages.append(page(ab, P_ABERT, "Antes de começar"))

# 4. técnicas
tec = f'''<div class="kicker" style="margin-top:3mm">Fundamentos</div><h1 class="big">Três técnicas que se repetem</h1>
<p class="lead" style="max-width:150mm">Quase todas as receitas do livro usam pelo menos uma destas técnicas. Vale lê-las uma vez com calma.</p>
<div style="margin:5mm 0 6mm">{orn(40)}</div>
<div class="card" style="margin-bottom:4.5mm"><div class="label" style="margin-bottom:1.5mm">01 — Tiramisù, Zabaione</div>
<h3>Gemas em banho-maria até 70 °C</h3>
<p>Neste livro, nenhuma receita usa ovo cru. As gemas são batidas com o açúcar em uma tigela apoiada sobre uma panela com água em
fervura baixa, sem que o fundo da tigela toque a água. Mexa sem parar com o batedor de arame, raspando as laterais, até a mistura
atingir <b>70 °C</b>, <b>confirmados com termômetro culinário</b>. A mistura engrossa, clareia e cobre as costas da colher, mas
esses sinais mostram só a textura: a aparência, sozinha, não garante a temperatura. Leva de 6 a 10 minutos. Se as bordas começarem a granular, tire a tigela do vapor
por alguns segundos e continue batendo.</p></div>
<div class="card" style="margin-bottom:4.5mm"><div class="label" style="margin-bottom:1.5mm">02 — Torta della Nonna, Budino</div>
<h3>Cremes engrossados com amido</h3>
<p>Amido de milho só firma depois de ferver. Dissolva sempre o amido em líquido frio, leve ao fogo médio mexendo sem parar e,
quando o creme ferver e engrossar, cozinhe <b>mais 1 a 2 minutos</b>. Creme retirado do fogo antes da hora fica ralo no dia
seguinte. Para esfriar sem formar película, cubra com filme plástico encostado na superfície.</p></div>
<div class="card"><div class="label" style="margin-bottom:1.5mm">03 — Torta della Nonna, Crostata</div>
<h3>Massa frola (pasta frolla)</h3>
<p>É uma massa amanteigada e quebradiça. Três cuidados: a manteiga entra <b>gelada</b>, esfarelada com a ponta dos dedos;
a massa é unida <b>sem sovar</b>, só até formar uma bola; e ela <b>descansa 30 minutos</b> na geladeira antes de ser aberta.
Abrir a massa entre dois plásticos evita usar farinha extra, que deixaria a massa dura.</p></div>
<div class="sec" style="margin-top:7mm">Forno: o que vale para todas as receitas assadas</div>
<div class="two prose" style="gap:8mm"><div>
<p>Preaqueça o forno por pelo menos 15 minutos na temperatura indicada e asse na grade do meio. Evite abrir a porta nos
primeiros 20 minutos: a queda de temperatura atrapalha o crescimento e a cor.</p></div><div>
<p>Os tempos são uma referência. Confira sempre o ponto descrito na receita (cor dourada, borda firme, palito com migalhas
úmidas) e, se o seu forno doura demais por cima, cubra com papel-alumínio no fim.</p></div></div>'''
pages.append(page(tec, P_TEC, "Fundamentos"))

# receitas
for i, r in enumerate(RECIPES):
    n = i + 1
    meta = ''.join(f'<div><div class="label">{E(k)}</div><div class="v">{E(v)}</div></div>' for k, v in r["meta"])
    ing = ''.join(f'<h4>{E(g)}</h4><ul>' + ''.join(f'<li>{E(x)}</li>' for x in items) + '</ul>' for g, items in r["ingredients"])
    steps = ''.join(f'<div class="st"><span class="k">{j+1:02d}</span><span class="x">{E(s)}</span></div>' for j, s in enumerate(r["steps"]))
    nt = lambda k, v: f'<div class="note{" safe" if k.startswith("Segurança") else ""}"><div class="label">{E(k)}</div><p>{E(v)}</p></div>'
    left = r.get("left", [])
    notes = ''.join(nt(k, v) for k, v in r["notes"] if k not in left)
    lnotes = ''.join(nt(k, v) for k, v in r["notes"] if k in left)
    tip = f'<div class="tip"><div class="label">{leaf()} Dica da Nonna</div><p>{E(r["tip"])}</p></div>'
    photo = "file://" + os.path.join(JPG, IMG[r["slug"]] + ".jpg")
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
plan = f'''<div class="kicker" style="margin-top:3mm">Organização</div><h1 class="big">Planejando a sobremesa</h1>
<p class="lead" style="max-width:150mm">Em dia de jantar, o fogão está ocupado com as massas e os molhos. Muitas destas sobremesas
podem ser feitas antes, deixando mais tempo para aproveitar a companhia.</p>
<div style="margin:5mm 0 4mm">{orn(40)}</div>
<table class="t"><tr><th style="width:30%">Receita</th><th style="width:26%">Quando fazer</th><th>Conservação</th></tr>{trs}</table>
<div class="two" style="margin-top:7mm">
<div class="card"><h3>Na véspera</h3><p>Tiramisù, panna cotta, budino e Torta della Nonna ganham com uma noite na geladeira:
os sabores se assentam e a textura firma. Cantucci podem ser feitos com semanas de folga.</p></div>
<div class="card"><h3>Na hora</h3><p>Affogato e zabaione são feitos com os convidados à mesa, em menos de 20 minutos.
Deixe ingredientes e utensílios separados antes do jantar começar.</p></div>
</div>
<div class="note" style="margin-top:5mm"><div class="label">Conservação</div><p>Os prazos consideram ingredientes frescos, preparo higiênico e armazenamento adequado. Quando a tabela indicar geladeira, guarde na parte mais fria dela, coberto, e não deixe a sobremesa fora da geladeira por mais de 2 horas.</p></div>'''
pages.append(page(plan, P_PLAN, "Organização"))

# harmonização
trs = ''.join(f'<tr><td class="n">{E(a)}<div style="font-weight:400;color:var(--gray);font-size:8pt;margin-top:1mm">{E(b)}</div></td>'
              f'<td class="g">{E(c)}</td><td>{E(d)}</td></tr>' for a, b, c, d in PAIRINGS)
harm = f'''<div style="display:grid;grid-template-columns:1fr 54mm;gap:7mm;height:100%">
<div><div class="kicker" style="margin-top:3mm">Referência</div>
<h1 class="big" style="text-transform:none;font-weight:700;font-size:22pt">Qual doce depois de qual prato</h1>
<p style="font-size:9.8pt;line-height:1.5;margin-bottom:4mm">Para escolher, pense em equilíbrio: depois de um prato rico, uma sobremesa leve e fresca; depois de um prato leve,
um doce mais intenso. Use o quadro como ponto de partida, não como obrigação.</p>
<table class="t"><tr><th style="width:34%">Tipo de prato</th><th style="width:28%">Sobremesas</th><th>Por quê</th></tr>{trs}</table>
<div class="tip" style="margin-top:6mm"><div class="label">{leaf()} Coringas</div>
<p>Cantucci com café e affogato combinam com qualquer cardápio. Se não souber o que escolher, comece por eles.</p></div>
<div class="note" style="margin-top:4mm"><div class="label">Convidados com restrições</div>
<p>A Torta caprese não leva farinha de trigo, mas, para pessoas com doença celíaca, verifique todos os rótulos e o risco de contaminação cruzada. O zabaione tem versão
sem álcool e o affogato tem versão sem café, ambas na própria receita.</p></div>
</div>
<div class="panel"><div class="q">&ldquo;</div>
<div class="qt">Depois de uma boa massa, ninguém precisa de muito: um doce bem feito, um café e mais um pouco de conversa.</div>
<hr><div class="label">Filosofia Norqva</div>
<p style="margin-top:3mm">Sirva porções pequenas. A sobremesa italiana não compete com o prato principal: ela fecha a refeição.</p>
<div style="margin-top:14mm">{orn(40, "#b39a75")}</div>
<p style="margin-top:12mm">Para grupos grandes, ofereça duas opções: uma feita na véspera, como o tiramisù, e uma
servida na hora, como o affogato.</p>
</div></div>'''
pages.append(page(harm, P_HARM, "Referência gastronômica"))

# encerramento
fim = f'''<div style="height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
{monogram(18, "#9e7e4e")}
<div style="font-family:'DSerif';font-weight:700;font-size:24pt;line-height:1.25;margin-top:10mm;text-transform:uppercase;max-width:140mm">
A mesa só termina<br>depois do doce.</div>
<div style="margin:7mm 0">{orn(46)}</div>
<p class="lead" style="max-width:120mm">Que estas receitas acompanhem os seus jantares de casa, e que a sobremesa seja sempre
a desculpa para ficar mais um pouco à mesa.</p>
<p style="font-family:'DSerif';font-style:italic;font-weight:700;color:var(--gold);font-size:12pt;margin-top:8mm">Buon appetito!</p>
<div style="margin-top:22mm;border-top:.6pt solid var(--rule);padding-top:5mm;width:110mm">
<div class="label" style="letter-spacing:.3em">Norqva Editorial</div>
<p style="font-size:8pt;color:var(--gray);margin-top:2mm">Dolci della Nonna — complemento de <i>Trattoria em Casa</i><br>Edição Digital 2026 · Fotografias ilustrativas</p></div>
</div>'''
pages.append(page(fim, P_FIM, "Dolci della Nonna"))

doc = f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Dolci della Nonna</title><style>{CSS}</style></head><body>{"".join(pages)}</body></html>'
out_html = os.path.join(HERE, "dolci.html")
open(out_html, "w", encoding="utf-8").write(doc)

from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args=["--allow-file-access-from-files"])
    pg = b.new_page()
    pg.goto("file://" + out_html)
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
        print(o)
    fonts = pg.evaluate("() => [...document.fonts].map(f=>f.family+':'+f.status)")
    print(set(fonts))
    pg.pdf(path=os.path.join(HERE, "DOLCI_DELLA_NONNA.pdf"), width="210mm", height="297mm", print_background=True,
           margin=dict(top="0", bottom="0", left="0", right="0"))
    b.close()
