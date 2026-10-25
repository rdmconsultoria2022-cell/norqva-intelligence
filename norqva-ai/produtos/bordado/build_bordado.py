# -*- coding: utf-8 -*-
"""Gera KIT_DE_BORDADO_NORQVA.pdf: 50 riscos originais em tamanho real + guia de pontos para iniciantes.

Tudo é desenhado em código (traço vetorial em milímetros reais), sem fotos.
Fontes OFL (Playfair Display, Lora, Poppins) em fonts/, com as licenças OFL-*.txt.
Uso: python build_bordado.py      (precisa de Playwright + Chromium; prévias PNG com pdftoppm, se existir)
"""
import glob, html, math, os, shutil, subprocess, sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import geo
from geo import svg_wrap, f
from motifs import MOTIFS, rose_head, daisy, lavender, stem_leaves
from lettering import letter_d
import diagrams as D

E = html.escape
OUT_PDF = os.path.join(HERE, "KIT_DE_BORDADO_NORQVA.pdf")
FOOT = "Kit de Bordado NORQVA · 50 riscos para iniciantes"
FONTS = os.path.join(HERE, "fonts")


def uri(p):
    return Path(p).resolve().as_uri()


def font_css():
    faces = [("NSerif", "playfair-display-latin-400-normal.woff", 400, "normal"),
             ("NSerif", "playfair-display-latin-700-normal.woff", 700, "normal"),
             ("NSerif", "playfair-display-latin-400-italic.woff", 400, "italic"),
             ("NSerif", "playfair-display-latin-600-italic.woff", 600, "italic"),
             ("NText", "lora-latin-400-normal.woff", 400, "normal"),
             ("NText", "lora-latin-600-normal.woff", 600, "normal"),
             ("NText", "lora-latin-400-italic.woff", 400, "italic"),
             ("NSans", "poppins-latin-400-normal.woff", 400, "normal"),
             ("NSans", "poppins-latin-500-normal.woff", 500, "normal"),
             ("NSans", "poppins-latin-600-normal.woff", 600, "normal")]
    return "".join(f"@font-face{{font-family:'{n}';src:url('{uri(os.path.join(FONTS, fn))}');font-weight:{w};font-style:{s}}}\n"
                   for n, fn, w, s in faces)


CSS = font_css() + """
:root{--bg:#FBF7F0;--ink:#2A2420;--terra:#B4583A;--rose:#D29A8A;--rose-l:#F3E3DA;--sage:#7E9A7A;--gray:#6E625B;--rule:#E8DBCC;--box:#F5ECE2}
@page{size:210mm 297mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'NText',serif;font-size:9.6pt;line-height:1.5}
.page{width:210mm;height:297mm;position:relative;overflow:hidden;background:var(--bg);page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
.page.white{background:#fff}
.hdr{position:absolute;top:10mm;left:18mm;right:18mm;height:6mm;border-bottom:.5pt solid var(--rule);display:flex;justify-content:space-between;align-items:flex-start}
.hdr .l{font-family:'NSans';font-weight:600;font-size:6.4pt;letter-spacing:.28em;color:var(--terra);text-transform:uppercase}
.hdr .r{font-family:'NSans';font-size:6.4pt;letter-spacing:.3em;color:var(--gray)}
.ftr{position:absolute;bottom:9mm;left:18mm;right:18mm;border-top:.5pt solid var(--rule);padding-top:2mm;display:flex;justify-content:space-between}
.ftr .l{font-family:'NText';font-style:italic;font-size:7pt;color:var(--gray)}
.ftr .r{font-family:'NSans';font-weight:600;font-size:7.4pt;color:var(--ink)}
.body{position:absolute;top:21mm;bottom:19mm;left:18mm;right:18mm;overflow:hidden}
.kicker{font-family:'NSans';font-weight:600;font-size:7pt;letter-spacing:.3em;color:var(--terra);text-transform:uppercase}
h1{font-family:'NSerif';font-weight:400;font-size:27pt;line-height:1.08;margin:1.5mm 0 3mm;color:var(--ink)}
h1 i{color:var(--terra)}
h2{font-family:'NSerif';font-weight:700;font-size:13pt;line-height:1.2;margin-bottom:1.6mm}
h3{font-family:'NSans';font-weight:600;font-size:7.2pt;letter-spacing:.16em;text-transform:uppercase;color:var(--terra);margin-bottom:1.4mm}
.lead{font-family:'NText';font-style:italic;font-size:11pt;line-height:1.5;color:var(--gray)}
p{margin-bottom:2.2mm}
.rule{height:0;border-top:.5pt solid var(--rule);margin:4mm 0}
.orn{display:flex;align-items:center;gap:2.4mm;margin:3.5mm 0}
.orn:before,.orn:after{content:'';height:0;border-top:.5pt solid var(--rose);flex:0 0 14mm}
.orn svg{flex:none}
.sw{display:flex;gap:3mm;margin-top:2mm}
.sw div{flex:1;font-family:'NSans';font-size:6.6pt;color:var(--gray);text-align:center}
.sw i{display:block;height:9mm;border-radius:2mm;margin-bottom:1.2mm}
.card{background:var(--box);border-radius:2.5mm;padding:4mm 4.5mm}
.card p{margin:0;font-size:9.2pt;line-height:1.5}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5mm}
ol.steps{list-style:none;counter-reset:s}
ol.steps li{counter-increment:s;position:relative;padding-left:7mm;margin-bottom:1.6mm;font-size:9.2pt;line-height:1.45}
ol.steps li:before{content:counter(s);position:absolute;left:0;top:.2mm;width:4.6mm;height:4.6mm;border-radius:50%;background:var(--terra);color:#fff;font-family:'NSans';font-weight:600;font-size:6.6pt;line-height:4.6mm;text-align:center}
ul.dots{list-style:none}
ul.dots li{position:relative;padding-left:4mm;margin-bottom:1.4mm;font-size:9.2pt;line-height:1.45}
ul.dots li:before{content:'';position:absolute;left:0;top:1.9mm;width:1.5mm;height:1.5mm;border-radius:50%;background:var(--rose)}
.note{border-left:2pt solid var(--terra);background:#fff;padding:3mm 4mm;border-radius:0 2mm 2mm 0}
.note p{margin:0;font-size:9pt}
.tip{display:flex;gap:3mm;align-items:flex-start}
b{font-weight:600}
/* capa */
.cover{background:var(--bg)}
.cover .brand{position:absolute;top:17mm;left:0;right:0;text-align:center;font-family:'NSans';font-weight:600;font-size:8pt;letter-spacing:.6em;color:var(--terra)}
.cover .t1{position:absolute;top:27mm;left:0;right:0;text-align:center;font-family:'NSerif';font-size:40pt;line-height:1;color:var(--ink)}
.cover .t2{position:absolute;top:44mm;left:0;right:0;text-align:center;font-family:'NSerif';font-style:italic;font-size:21pt;color:var(--terra)}
.cover .art{position:absolute;top:62mm;left:0;right:0;display:flex;justify-content:center}
.cover .sub{position:absolute;top:214mm;left:30mm;right:30mm;text-align:center;font-family:'NText';font-style:italic;font-size:13pt;line-height:1.45;color:var(--ink)}
.cover .bul{position:absolute;top:240mm;left:0;right:0;display:flex;justify-content:center;gap:7mm;font-family:'NSans';font-size:7.4pt;letter-spacing:.14em;text-transform:uppercase;color:var(--gray)}
.cover .bul span:before{content:'';display:inline-block;width:1.5mm;height:1.5mm;border-radius:50%;background:var(--rose);margin-right:2mm;vertical-align:.4mm}
.cover .ed{position:absolute;bottom:16mm;left:0;right:0;text-align:center;font-family:'NSans';font-weight:600;font-size:7pt;letter-spacing:.45em;color:var(--terra)}
.cover .frame{position:absolute;inset:9mm;border:.6pt solid var(--rose);border-radius:3mm}
/* pontos */
.stitch{display:grid;grid-template-columns:94mm 1fr;gap:6mm;padding:4.5mm 0 5.5mm;border-bottom:.5pt solid var(--rule)}
.stitch svg.dg{width:94mm;height:78.3mm}
.stitch .note{margin-top:2.6mm}
.stitch:last-child{border-bottom:0}
.stitch .num{font-family:'NSerif';font-size:20pt;color:var(--terra);line-height:1;margin-right:2mm}
.stitch h2{display:flex;align-items:baseline;font-size:16pt}
.stitch .use{font-style:italic;color:var(--gray);font-size:9.2pt;margin:1mm 0 2.6mm}
.legend{display:flex;gap:4mm;font-family:'NSans';font-size:6.6pt;color:var(--gray);margin-top:1.5mm}
.legend i{display:inline-block;width:2.2mm;height:2.2mm;border-radius:50%;vertical-align:-.3mm;margin-right:1mm}
/* riscos */
.slot{position:relative;height:122mm;display:grid;grid-template-columns:116mm 54mm;gap:4mm}
.slot + .slot{border-top:.5pt dashed var(--rule)}
.slot .artbox{display:flex;align-items:center;justify-content:center;overflow:visible}
.info{display:flex;flex-direction:column;justify-content:center;padding:4mm 0}
.n{font-family:'NSerif';font-size:30pt;line-height:.9;color:var(--terra)}
.nm{font-family:'NSerif';font-weight:700;font-size:13.5pt;line-height:1.15;margin:1.6mm 0 2mm}
.pill{display:inline-block;font-family:'NSans';font-weight:600;font-size:6.4pt;letter-spacing:.14em;text-transform:uppercase;padding:.7mm 2.4mm;border-radius:3mm;background:var(--rose-l);color:var(--terra)}
.pill.m{background:#E5EEE3;color:#4F6B4C}
.meta{font-family:'NSans';font-size:7.2pt;color:var(--gray);margin:2.2mm 0 2.6mm;line-height:1.6}
.meta b{color:var(--ink);font-weight:500}
.sts{list-style:none;margin-bottom:3mm}
.sts li{font-size:8.5pt;line-height:1.38;margin-bottom:1.2mm}
.sts li b{font-family:'NSans';font-weight:600;font-size:7pt;letter-spacing:.04em;color:var(--terra);display:block}
.ruler{margin-top:1mm}
.ruler .cap{font-family:'NSans';font-size:6pt;color:var(--gray);margin-top:.6mm;letter-spacing:.02em}
.full .artbox{position:absolute;top:2mm;left:0;right:0;height:180mm;display:flex;align-items:center;justify-content:center}
.full .info2{position:absolute;bottom:0;left:0;right:0;height:56mm;border-top:.5pt solid var(--rule);padding-top:4mm;display:grid;grid-template-columns:62mm 1fr;gap:8mm}
.full .info2 .sts{columns:2;column-gap:6mm}
.sts li{break-inside:avoid}
.idx{columns:2;column-gap:10mm;margin-top:3mm}
.idx .cat{font-family:'NSans';font-weight:600;font-size:7pt;letter-spacing:.2em;text-transform:uppercase;color:var(--terra);margin:2.2mm 0 .8mm;break-after:avoid}
.idx .row{display:flex;align-items:baseline;gap:2mm;font-size:8.8pt;line-height:1.4;border-bottom:.4pt dotted var(--rule);padding:.45mm 0;break-inside:avoid}
.idx .row .k{font-family:'NSans';font-weight:600;font-size:7.4pt;color:var(--terra);width:6mm}
.idx .row .t{flex:1}
.idx .row .lv{font-family:'NSans';font-size:6.4pt;color:var(--gray);width:10mm;white-space:nowrap}
.idx .row .pg{font-family:'NSans';font-size:6.8pt;color:var(--gray);width:12mm;text-align:right;white-space:nowrap}
.alpha{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:49mm;gap:0;margin-top:2mm}
.alpha .cell{display:flex;align-items:center;justify-content:center;border:.4pt dashed var(--rule);margin:-.2pt}
.matrow{display:grid;grid-template-columns:30mm 1fr;gap:4mm;align-items:center;padding:2.6mm 0;border-bottom:.5pt solid var(--rule)}
.matrow:last-child{border-bottom:0}
.matrow h2{font-size:12pt;margin-bottom:.8mm}
.matrow p{margin:0;font-size:9pt;line-height:1.45}
.method{display:grid;grid-template-columns:96mm 1fr;gap:6mm;align-items:start;padding:4mm 0;border-bottom:.5pt solid var(--rule)}
.method:last-child{border-bottom:0}
.method .tag{font-family:'NSans';font-weight:600;font-size:6.6pt;letter-spacing:.16em;text-transform:uppercase;color:var(--gray);margin-bottom:1mm}
"""

pages = []
ORN = ('<div class="orn"><svg xmlns="http://www.w3.org/2000/svg" width="6mm" height="6mm" viewBox="0 0 12 12"><g fill="none" stroke="#B4583A" stroke-width=".7">'
       + "".join(f'<ellipse cx="6" cy="3.3" rx="1.5" ry="2.6" transform="rotate({a} 6 6)"/>' for a in (0, 72, 144, 216, 288)) + '<circle cx="6" cy="6" r=".9"/></g></svg></div>')


def page(body, n, hdr, white=False, extra_cls=""):
    cls = "page" + (" white" if white else "") + (" " + extra_cls if extra_cls else "")
    return (f'<section class="{cls}"><div class="hdr"><span class="l">{hdr}</span><span class="r">NORQVA</span></div>'
            f'<div class="body">{body}</div><div class="ftr"><span class="l">{FOOT}</span><span class="r">{n:02d}</span></div></section>')


def ruler(cm=5):
    w = cm * 10 + 2
    g = f'<path d="M1,1 H{1 + cm * 10}" stroke="#2A2420" stroke-width="0.3"/>'
    for mm in range(cm * 10 + 1):
        h = 3.2 if mm % 10 == 0 else (2.1 if mm % 5 == 0 else 1.2)
        g += f'<path d="M{1 + mm},1 V{1 + h}" stroke="#2A2420" stroke-width="{0.3 if mm % 10 == 0 else 0.18}"/>'
    for c in range(cm + 1):
        g += f'<text x="{1 + 10 * c}" y="7.4" text-anchor="middle" font-family="NSans" font-size="2.4" fill="#2A2420">{c}</text>'
    return (f'<div class="ruler"><svg xmlns="http://www.w3.org/2000/svg" width="{w}mm" height="8.2mm" viewBox="0 0 {w} 8.2">{g}</svg>'
            f'<div class="cap">Régua de conferência: deve medir 5 cm exatos</div></div>')


def hoop_for(m):
    big = max(m["w"], m["h"])
    return 15 if big <= 112 else (18 if big <= 135 else 20)


def cm(v):
    return f"{v / 10:.1f}".replace(".", ",")


def level_pill(lv):
    return f'<span class="pill{" m" if lv == "Médio" else ""}">{lv}</span>'


def stitches_html(m):
    return '<ul class="sts">' + "".join(f"<li><b>{E(k)}</b>{E(v)}</li>" for k, v in m["stitches"]) + "</ul>"


def art(m):
    return svg_wrap(m["w"], m["h"], m["draw"]())


# ================================================================ numeração
P_COVER, P_USO, P_MAT, P_TR1, P_TR2 = 1, 2, 3, 4, 5
P_PONTOS = 6            # 6–10
P_COMECAR = 11
P_INDICE = 12
P_RISCO0 = 13
pat_pages = []          # lista de listas de motivos
i = 0
while i < len(MOTIFS):
    m = MOTIFS[i]
    if m["layout"] == "full":
        pat_pages.append([m])
        i += 1
    else:
        nxt = MOTIFS[i + 1]
        assert nxt["layout"] == "half", (m["num"], nxt["num"])
        pat_pages.append([m, nxt])
        i += 2
PAGE_OF = {}
for k, grp in enumerate(pat_pages):
    for m in grp:
        PAGE_OF[m["num"]] = P_RISCO0 + k
P_ALFA = P_RISCO0 + len(pat_pages)
P_FIM = P_ALFA + 2

# ================================================================ 1. capa


def cover_art():
    S = 118
    c = (S / 2, S / 2)
    R = 50
    g = f'<circle cx="{c[0]}" cy="{c[1]}" r="{R + 3.2}" fill="none" stroke="#C99A6B" stroke-width="2.2"/>'
    g += f'<circle cx="{c[0]}" cy="{c[1]}" r="{R + 0.6}" fill="#FFFDF9" stroke="#B88757" stroke-width="1.3"/>'
    g += f'<rect x="{c[0] - 4}" y="{c[1] - R - 9.5}" width="8" height="6.5" rx="1.2" fill="#C99A6B"/>'
    g += f'<rect x="{c[0] - 1.6}" y="{c[1] - R - 13}" width="3.2" height="4.4" rx="0.8" fill="#B88757"/>'
    stitch = 'stroke-dasharray="2.3 0.75"'

    def grp(inner, color, sw=0.85, dash=True):
        return (f'<g fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" '
                f'{stitch if dash else ""}>{inner}</g>')
    from geo import curve as gc, path as gp, on as gon, leaf as gleaf, lobed as globed
    stems = [[(59, 98), (55, 80), (46, 62), (40, 52)], [(60, 98), (62, 78), (70, 60), (76, 50)], [(60, 98), (60, 76), (58, 56), (57, 38)],
             [(58, 98), (48, 86), (34, 78), (24, 74)], [(61, 98), (74, 88), (88, 80), (95, 76)]]
    g += grp("".join(gp(gc(s)) for s in stems), "#7E9A7A")
    lv = [[(59, 98), (44, 78), (32, 58), (27, 40)], [(61, 98), (80, 80), (88, 62), (92, 46)]]
    g += grp("".join(gp(gc(s)) for s in lv), "#7E9A7A")
    g += grp(lavender(lv[0], u0=0.55, n=7, size=3.6) + lavender(lv[1], u0=0.55, n=7, size=3.6), "#9C83B8", 0.8, False)
    leaves = (stem_leaves(stems[0], [(0.35, 1, 50, 1.0)], L=12, hw=3.6) + stem_leaves(stems[1], [(0.4, -1, 50, 1.0)], L=12, hw=3.6)
              + stem_leaves(stems[2], [(0.55, 1, 50, 0.9), (0.4, -1, 50, 0.9)], L=11, hw=3.4)
              + stem_leaves(stems[3], [(0.7, 1, 40, 0.9), (0.45, -1, 40, 0.9)], L=10, hw=3)
              + stem_leaves(stems[4], [(0.7, -1, 40, 0.9), (0.45, 1, 40, 0.9)], L=10, hw=3))
    g += grp(leaves, "#6F8F6B", 0.8, False)
    g += grp(rose_head((40, 46), 0.62), "#C46F5E", 0.95)
    g += grp(rose_head((77, 45), 0.5), "#D48A78", 0.9)
    g += grp(daisy((57, 31), 10, n=12, r0=2.9, hw=1.6), "#C99A3E", 0.85, False)
    s1, _ = globed((24, 72), 5.2, n=5, ang=-90, depth=0.42)
    s2, _ = globed((95, 74), 5.2, n=5, ang=-80, depth=0.42)
    g += grp(s1 + s2, "#C46F5E", 0.8, False)
    g += f'<g fill="#C99A3E">' + "".join(f'<circle cx="{57 + 1.4 * math.cos(a)}" cy="{31 + 1.4 * math.sin(a)}" r="0.55"/>' for a in [k * 1.26 for k in range(5)]) + "</g>"
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{S * 1.2}mm" height="{S * 1.2}mm" viewBox="0 0 {S} {S}">{g}</svg>'


pages.append(f'''<section class="page cover"><div class="frame"></div>
<div class="brand">NORQVA</div>
<div class="t1">Kit de Bordado</div>
<div class="t2">50 riscos para iniciantes</div>
<div class="art">{cover_art()}</div>
<div class="sub">50 riscos originais em tamanho real<br>+ guia de pontos para começar do zero</div>
<div class="bul"><span>Flores</span><span>Folhagens</span><span>Monogramas</span><span>Bichinhos</span><span>Frases</span></div>
<div class="ed">EDIÇÃO 2026 · PDF PARA IMPRIMIR</div></section>''')

# ================================================================ 2. como usar
uso = f'''<div class="kicker">Antes de tudo</div><h1>Como usar <i>este kit</i></h1>
<p class="lead" style="max-width:150mm">Aqui estão 50 desenhos para bordar, chamados de riscos, prontos para imprimir no tamanho certo, e um guia com os 10 pontos que você vai usar neles. Não precisa saber nada de bordado para começar.</p>
{ORN}
<div class="grid2">
<div>
<h3>1 · Imprima em tamanho real</h3>
<ul class="dots">
<li>Abra o PDF e mande imprimir em papel <b>A4</b>.</li>
<li>Na janela de impressão, escolha <b>Tamanho real</b> ou <b>Escala 100%</b>.</li>
<li>Desligue a opção <b>Ajustar à página</b> (ou "Ajustar à área de impressão"). Ela encolhe o desenho.</li>
<li>Pode imprimir só as páginas dos riscos que for usar.</li>
</ul>
<h3 style="margin-top:4mm">2 · Confira a régua</h3>
<p style="font-size:9.2pt">Cada página de risco traz uma régua de 5 cm. Meça com uma régua comum: precisa dar <b>5 cm exatos</b>. Se der menos, a impressora reduziu o desenho; imprima de novo sem o ajuste.</p>
{ruler()}
<h3 style="margin-top:4.5mm">3 · Escolha o bastidor</h3>
<p style="font-size:9.2pt">Os riscos foram pensados para bastidores de <b>15 a 20 cm</b>, e cada ficha diz qual usar. Quer maior ou menor? Mude a escala na impressão (por exemplo, 120%) e lembre que a régua muda junto: em 120% ela passa a medir 6 cm.</p>
</div>
<div>
<h3>Como ler cada ficha</h3>
<div class="card" style="margin-bottom:4mm"><p><b>Número e nome</b> do risco<br><b>Nível:</b> Fácil (só pontos de linha) ou Médio (tem preenchimento ou detalhes pequenos)<br><b>Medida</b> do desenho e <b>bastidor</b> sugerido<br><b>Pontos sugeridos</b> para cada parte, por exemplo: "Pétalas: ponto margarida"</p></div>
<h3>Por onde começar</h3>
<ul class="dots">
<li>Leia <b>Materiais</b> (pág. {P_MAT:02d}) e <b>Transferir o risco</b> (pág. {P_TR1:02d}).</li>
<li>Treine os pontos num retalho com o <b>Guia de pontos</b> (pág. {P_PONTOS:02d}).</li>
<li>Primeiro bordado: escolha um risco <b>Fácil</b>, como a Margarida (01), o Ramo de folhas (16) ou o Gatinho (36), e use só ponto atrás e ponto haste.</li>
<li>As cores são livres. Uma dica: 3 a 5 cores por bordado já ficam lindas.</li>
</ul>
<div class="note" style="margin-top:4mm"><p>As páginas dos riscos têm <b>fundo branco</b> para gastar menos tinta e para o desenho aparecer bem quando você colocar o papel contra a luz.</p></div>
</div></div>
<div class="rule"></div>
<div class="grid2"><div>
<h3>Uma paleta para começar</h3>
<p style="font-size:9pt">Se não souber que cores comprar, estas cinco combinam com quase todos os riscos. Use os verdes nas folhas e hastes e as outras nas flores e nos detalhes.</p>
<div class="sw"><div><i style="background:#B4583A"></i>Terracota</div><div><i style="background:#D9A08E"></i>Rosa antigo</div><div><i style="background:#7E9A7A"></i>Verde-sálvia</div><div><i style="background:#D3A243"></i>Mostarda</div><div><i style="background:#9C83B8"></i>Lavanda</div></div>
</div><div>
<h3>O que tem no kit</h3>
<div style="font-size:9pt;line-height:1.7">
<div><b>Pág. {P_MAT:02d}</b> · Materiais<br><b>Pág. {P_TR1:02d}</b> · Transferir o risco<br><b>Pág. {P_PONTOS:02d}</b> · Guia com 10 pontos</div>
<div><b>Pág. {P_COMECAR:02d}</b> · Começar e terminar a linha<br><b>Pág. {P_INDICE:02d}</b> · Lista dos 50 riscos<br><b>Pág. {P_RISCO0:02d}</b> · Os 50 riscos</div>
<div><b>Pág. {P_ALFA:02d}</b> · Alfabeto para monogramas<br><b>Pág. {P_FIM:02d}</b> · Acabamento, lavagem e licença</div>
</div></div></div>'''
pages.append(page(uso, P_USO, "Como usar"))

# ================================================================ 3. materiais
mats = [
    (D.ic_bastidor(), "Bastidor", "Aro que deixa o tecido esticado como pele de tambor. Para estes riscos, use de <b>15 a 20 cm</b>. O de madeira com parafuso segura melhor."),
    (D.ic_tecido(), "Tecido", "<b>Tricoline 100% algodão</b> é o mais fácil para começar. <b>Linho</b> ou misto de linho dá um ar de quadro. <b>Etamine</b>, com quadradinhos, é para ponto cruz. Corte o tecido com uns 5 cm a mais que o bastidor em toda a volta (para bastidor de 15 cm, um quadrado de 25 × 25 cm)."),
    (D.ic_meada(), "Linha de algodão (meada)", "A meada de bordar tem <b>6 fios finos</b> torcidos juntos. Você separa quantos quer usar: <b>2 fios</b> para detalhes delicados, <b>3 fios</b> para a maior parte dos riscos e <b>4 a 6 fios</b> para linhas grossas."),
    (D.ic_fios(), "Como separar os fios", "Corte uns 50 cm de linha. Segure uma ponta, puxe <b>um fio de cada vez</b> para cima, devagar (a meada se ajeita sozinha embaixo) e depois junte os fios que vai usar, lado a lado."),
    (D.ic_agulha(), "Agulha para bordado", "Tem o buraco comprido, para os fios passarem fácil. Números <b>7 a 9</b> para 1 a 3 fios; <b>5 ou 6</b> para 4 a 6 fios. Para ponto cruz em etamine, use agulha de ponta arredondada (tapeçaria nº 24)."),
    (D.ic_tesoura(), "Tesoura pequena", "De ponta fina, para cortar a linha bem rente. Guarde só para linha: papel tira o corte."),
    (D.ic_caneta(), "Caneta para tecido", "<b>Hidrossolúvel</b>: some com água. <b>Termossensível</b>: some com o calor do ferro. Teste sempre num cantinho do tecido antes de riscar."),
    (D.ic_carbono(), "Papel carbono para tecido", "Próprio para costura (o de escritório mancha e não sai). Use azul ou vermelho em tecido claro e branco ou amarelo em tecido escuro."),
]
mat = '<div class="kicker">Materiais</div><h1>O que você <i>vai precisar</i></h1>'
mat += '<p class="lead" style="max-width:150mm;margin-bottom:2mm">Tudo se encontra em armarinhos e lojas de artesanato. Para começar, basta um bastidor, um pedaço de tricoline, 4 ou 5 meadas e uma agulha.</p>'
mat += '<div class="grid2" style="gap:0 8mm">' + "".join(
    f'<div class="matrow"><div>{ic}</div><div><h2>{E(t)}</h2><p>{d}</p></div></div>' for ic, t, d in mats) + "</div>"
mat += '''<div class="card" style="margin-top:5mm"><h3>Lista de compras do primeiro bordado</h3>
<div class="grid2" style="gap:2mm 8mm"><ul class="dots"><li>1 bastidor de madeira de 15 cm</li><li>30 × 30 cm de tricoline cru ou branco</li><li>5 meadas de algodão (veja a paleta na pág. 02)</li></ul>
<ul class="dots"><li>1 cartela de agulhas para bordado (nº 5 a 9)</li><li>1 caneta hidrossolúvel</li><li>Tesoura pequena e fita crepe</li></ul></div></div>'''
pages.append(page(mat, P_MAT, "Materiais"))

# ================================================================ 4–5. transferir
tr1 = f'''<div class="kicker">Transferir o risco</div><h1>Do papel <i>para o tecido</i></h1>
<p class="lead" style="max-width:155mm">São três jeitos. Escolha pelo tecido que você tem: claro e fino aceita qualquer um; grosso ou escuro pede o papel carbono.</p>
<div class="note" style="margin:3mm 0 1mm"><p><b>Para todos:</b> passe o tecido a ferro antes, para tirar as dobras, e centralize o desenho deixando a mesma sobra em volta. Risque com traço leve e contínuo: o bordado vai cobrir a linha.</p></div>
<div class="method"><div>{D.t_janela()}</div><div><div class="tag">Método 1 · tecidos claros e finos</div><h2>Contra a luz (janela ou tela)</h2>
<ol class="steps"><li>Prenda o risco impresso numa janela com luz do dia, com fita crepe. Também serve a tela de um tablet no brilho máximo (com o desenho aberto em tamanho real) ou uma mesa de luz.</li>
<li>Ponha o tecido por cima, com o lado direito para você, e prenda também.</li>
<li>Copie o desenho com a <b>caneta hidrossolúvel</b>, sem apertar.</li>
<li>Monte o bastidor e borde. No fim, a marca sai com água fria (veja a pág. {P_FIM:02d}).</li></ol></div></div>
<div class="method"><div>{D.t_carbono()}</div><div><div class="tag">Método 2 · tecidos grossos ou escuros</div><h2>Papel carbono para tecido</h2>
<ol class="steps"><li>Estique o tecido numa mesa lisa e dura, com o lado direito para cima.</li>
<li>Coloque o carbono por cima, com o lado da tinta virado para o tecido.</li>
<li>Ponha o risco por cima de tudo e prenda as três camadas com fita.</li>
<li>Passe por cima das linhas com uma caneta sem tinta ou um lápis duro, apertando com firmeza. Antes de soltar tudo, levante um canto e confira se marcou.</li></ol></div></div><div class="rule" style="margin:2mm 0 3mm"></div>
<h3>Qual caneta usar?</h3>
<div class="grid2">
<div class="card"><h2 style="font-size:11.5pt">Hidrossolúvel</h2><p>Marca azul que sai com água. Boa para tricoline e linho claros. <b>Não passe ferro</b> com a marca ainda no tecido: o calor pode fixar a tinta. Lave primeiro, passe depois.</p></div>
<div class="card"><h2 style="font-size:11.5pt">Termossensível</h2><p>Some com o calor. Boa quando a peça não pode ser molhada. Em tecido escuro pode deixar uma sombra clara: teste antes.</p></div>
</div>
'''
pages.append(page(tr1, P_TR1, "Transferir o risco"))

tr2 = f'''<div class="method" style="padding-top:2mm"><div>{D.t_termo()}</div><div><div class="tag">Método 3 · tecidos claros, quando não pode molhar</div><h2>Caneta termossensível</h2>
<ol class="steps"><li>Faça um teste num retalho: risque, passe o ferro e veja se a marca some por completo.</li>
<li>Copie o desenho contra a luz, como no método 1, usando a caneta termossensível.</li>
<li>Borde normalmente. Não passe o ferro antes de terminar, senão o risco some.</li>
<li>No fim, passe o ferro pelo avesso (ou use o ar quente do secador): a tinta desaparece.</li>
<li>Se a peça ficar num lugar muito frio, a marca pode voltar bem de leve. É só passar o ferro de novo.</li></ol></div></div>
<div class="rule"></div>
<h3>Problemas comuns</h3>
<div class="grid2" style="font-size:9.2pt">
<div><p><b>O desenho saiu torto.</b> Prenda melhor o papel e o tecido com fita nas quatro pontas antes de riscar. Se já riscou, apague (água ou calor, conforme a caneta) e risque de novo.</p>
<p><b>Não enxergo o risco através do tecido.</b> Use mais luz (janela em dia claro) ou passe para o papel carbono.</p></div>
<div><p><b>O carbono quase não marcou.</b> Aperte mais e use uma superfície dura por baixo. Mesa de vidro ou fórmica funciona melhor que madeira macia.</p>
<p><b>Tecido escuro.</b> Use carbono branco ou amarelo, ou caneta de giz para tecido.</p></div>
</div>
<div class="note" style="margin-top:3mm"><p><b>Dica:</b> o bordado vai cobrir o risco, então não precisa copiar os detalhes perfeitos. Bolinhas de nó francês, por exemplo, podem ser marcadas só com um pontinho.</p></div>'''
pages.append(page(tr2, P_TR2, "Transferir o risco"))

# ================================================================ 6–10. guia de pontos
legend = (f'<div class="legend"><span><i style="background:{D.TERRA}"></i>agulha <b>sai</b> (de baixo para cima)</span>'
          f'<span><i style="background:#fff;border:.4mm solid {D.INK}"></i>agulha <b>entra</b></span></div>')
for k in range(5):
    blocks = ""
    for j in range(2):
        idx = 2 * k + j
        name, fn, use, steps = D.STITCHES[idx]
        blocks += (f'<div class="stitch"><div>{fn()}{legend}</div><div><h2><span class="num">{idx + 1:02d}</span>{E(name)}</h2>'
                   f'<div class="use">{E(use)}</div><ol class="steps">' + "".join(f"<li>{E(s)}</li>" for s in steps) + "</ol>"
                   f'<div class="note"><p><b>Dica:</b> {E(D.TIPS[name])}</p></div></div></div>')
    head = ('<div class="kicker">Guia de pontos</div><h1 style="font-size:22pt">Os 10 pontos <i>do kit</i></h1>'
            '<p class="lead" style="font-size:10pt;margin-bottom:1mm">Nos desenhos, os números mostram a ordem: nos ímpares a agulha <b>sai</b> (vem do avesso para a frente), nos pares ela <b>entra</b>. A linha mais clara é o ponto já feito; a mais forte, o ponto da vez.</p>'
            if k == 0 else "")
    pages.append(page(head + blocks, P_PONTOS + k, "Guia de pontos"))

# ================================================================ 11. começar e terminar
com = f'''<div class="kicker">Antes do primeiro ponto</div><h1>Começar e <i>terminar a linha</i></h1>
<p class="lead" style="max-width:150mm">Cinco cuidados simples que fazem o bordado ficar bonito na frente e arrumado atrás.</p>
{ORN}
<div class="grid2">
<div>
<h3>Montar o bastidor</h3>
<ol class="steps"><li>Afrouxe o parafuso e separe os dois aros.</li>
<li>Apoie o aro de dentro na mesa, ponha o tecido por cima com o desenho no centro.</li>
<li>Encaixe o aro de fora, pressionando para baixo.</li>
<li>Ajuste puxando o tecido pelas bordas, de leve e em linha reta (nunca na diagonal, para não entortar o risco), até ficar esticado como um tambor.</li>
<li>Aperte o parafuso.</li></ol>
<h3 style="margin-top:4mm">Tamanho da linha</h3>
<p style="font-size:9.2pt">Corte pedaços de <b>40 a 50 cm</b>, mais ou menos da ponta dos dedos até o cotovelo. Linha comprida demais embola e desfia.</p>
<h3 style="margin-top:4mm">Linha torcendo?</h3>
<p style="font-size:9.2pt">De vez em quando, solte a agulha e deixe-a pendurada: ela gira sozinha e a linha destorce.</p>
</div>
<div>
<h3>Começar</h3>
<ul class="dots"><li><b>Com nó:</b> dê um nó simples na ponta da linha. Ele fica no avesso. É o jeito mais fácil.</li>
<li><b>Sem nó:</b> suba a agulha deixando uns 3 cm de linha no avesso. Segure esse rabinho com o dedo e borde os primeiros pontos por cima dele, prendendo-o.</li></ul>
<h3 style="margin-top:4mm">Terminar</h3>
<ul class="dots"><li>Com a agulha no avesso, passe-a por baixo de 3 ou 4 pontos já bordados.</li>
<li>Repita mais uma vez, voltando no sentido contrário, e corte rente.</li>
<li>Evite levar a linha por trás de espaços vazios grandes: em tecido claro ela aparece na frente. Termine e comece de novo.</li></ul>
<div class="note" style="margin-top:5mm"><p><b>Quantos fios usar nestes riscos?</b> Use <b>3 fios</b> como padrão. Para caules e contornos de destaque, 4 fios. Para olhos, bigodes, estames e letras pequenas, 2 fios.</p></div>
</div></div>
<div class="rule"></div>
<h3>Plano de treino em 3 bordados</h3>
<div class="grid3">
<div class="card"><h2 style="font-size:11pt">1 · Linhas</h2><p>Ramo de folhas (16) ou Gatinho (36), com ponto atrás e ponto haste.</p></div>
<div class="card"><h2 style="font-size:11pt">2 · Laçadas</h2><p>Trio de margaridinhas (07) ou Raminho de lavanda (04), com ponto margarida e nó francês.</p></div>
<div class="card"><h2 style="font-size:11pt">3 · Preenchimento</h2><p>Joaninha (42) ou Rosa simples (03), com ponto cheio e ponto folha.</p></div>
</div>
<div class="rule"></div>
<h3>Erros comuns de quem está começando</h3>
<div class="grid2" style="font-size:9.2pt">
<div><p><b>Puxar a linha com força.</b> O tecido franze e os pontos afundam. Puxe só até a linha deitar no tecido.</p>
<p><b>Pontos de tamanhos diferentes.</b> Escolha um tamanho (3 a 4 mm) e mantenha. Com o tempo vira hábito.</p></div>
<div><p><b>Tecido frouxo no bastidor.</b> Reaperte sempre que perceber o tecido mole: ele afrouxa com o uso.</p>
<p><b>Desistir do primeiro.</b> O primeiro bordado é treino. O segundo já sai bem melhor.</p></div>
</div>'''
pages.append(page(com, P_COMECAR, "Começar e terminar"))

# ================================================================ 12. índice dos riscos
cats = []
for m in MOTIFS:
    if not cats or cats[-1][0] != m["cat"]:
        cats.append((m["cat"], []))
    cats[-1][1].append(m)
idx = ""
for cat, ms in cats:
    idx += f'<div class="cat">{E(cat)}</div>'
    for m in ms:
        idx += (f'<div class="row"><span class="k">{m["num"]:02d}</span><span class="t">{E(m["name"])}</span>'
                f'<span class="lv">{m["level"]}</span><span class="pg">pág. {PAGE_OF[m["num"]]:02d}</span></div>')
ind = f'''<div class="kicker">Os riscos</div><h1>50 riscos <i>originais</i></h1>
<p class="lead" style="max-width:155mm">Todos desenhados pela NORQVA para este kit, em tamanho real. Os riscos 26 a 35 são molduras de monograma: troque a letra pela sua usando o alfabeto da pág. {P_ALFA:02d}.</p>
<div class="idx">{idx}</div>'''
pages.append(page(ind, P_INDICE, "Lista dos riscos"))

# ================================================================ riscos


def info_block(m):
    return (f'<div class="n">{m["num"]:02d}</div><div class="nm">{E(m["name"])}</div><div>{level_pill(m["level"])}</div>'
            f'<div class="meta">Medida: <b>{cm(m["w"])} × {cm(m["h"])} cm</b><br>Bastidor: <b>{hoop_for(m)} cm</b></div>')


for k, grp in enumerate(pat_pages):
    pn = P_RISCO0 + k
    hdr = f"Riscos · {grp[0]['cat']}"
    if len(grp) == 1:
        m = grp[0]
        body = (f'<div class="full"><div class="artbox">{art(m)}</div><div class="info2"><div>{info_block(m)}{ruler()}</div>'
                f'<div><h3>Pontos sugeridos</h3>{stitches_html(m)}</div></div></div>')
    else:
        body = ""
        for m in grp:
            body += (f'<div class="slot"><div class="artbox">{art(m)}</div><div class="info">{info_block(m)}'
                     f'<h3>Pontos sugeridos</h3>{stitches_html(m)}{ruler()}</div></div>')
    pages.append(page(body, pn, hdr, white=True))

# ================================================================ alfabeto
LET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
for half, letters in enumerate((LET[:13], LET[13:])):
    cells = ""
    for ch in letters:
        d, _ = letter_d(ch, (21, 22), 30)
        cells += f'<div class="cell">{svg_wrap(42, 44, geo.path(d))}</div>'
    intro = ('<div class="kicker">Alfabeto para monogramas</div><h1 style="font-size:22pt">Troque a letra <i>da moldura</i></h1>'
             '<p style="font-size:9.2pt;max-width:160mm">Letras com 3 cm de altura, que cabem em todas as molduras 26 a 35. Transfira primeiro a moldura, depois encaixe a letra no centro. '
             'Contorne com ponto haste; se quiser a letra cheia, preencha a parte grossa com ponto cheio.</p>' if half == 0 else
             '<div class="kicker">Alfabeto para monogramas</div><h1 style="font-size:22pt">De N <i>a Z</i></h1>'
             '<p style="font-size:9.2pt;max-width:160mm">Para letras com acento, use a letra sem acento e desenhe o acento à mão, pequeno e inclinado.</p>')
    body = intro + f'<div class="alpha">{cells}</div><div style="margin-top:3mm">{ruler()}</div>'
    pages.append(page(body, P_ALFA + half, "Alfabeto", white=True))

# ================================================================ página final
fim = f'''<div class="kicker">Para terminar</div><h1>Acabamento, <i>cuidados e licença</i></h1>
<div class="grid2" style="margin-top:3mm">
<div>
<h3>Fechar o bastidor como quadro</h3>
<ol class="steps"><li>Tire as marcas do risco (água fria para a caneta hidrossolúvel, ferro para a termossensível) e deixe secar.</li>
<li>Passe a ferro pelo avesso, sobre uma toalha felpuda: assim os pontos não amassam.</li>
<li>Monte de novo no bastidor, com o bordado centralizado e bem esticado, o parafuso no alto.</li>
<li>Corte o tecido em volta deixando 3 a 4 cm além do aro.</li>
<li>Faça um alinhavo nessa sobra, a 1 cm da borda, com linha resistente. Puxe a linha para franzir o tecido para trás do aro e dê um nó.</li>
<li>Se quiser um verso caprichado, cole ou costure um círculo de feltro por trás.</li></ol>
<p style="font-size:9pt;color:var(--gray);margin-top:2mm">Para pendurar, use o próprio parafuso do bastidor e uma fita.</p>
</div>
<div>
<h3>Lavar e guardar</h3>
<ul class="dots"><li>Lave à mão, em água fria, com sabão neutro.</li>
<li>Não torça. Enrole numa toalha para tirar o excesso de água.</li>
<li>Seque à sombra, na horizontal, esticando com as mãos.</li>
<li>Passe a ferro sempre pelo avesso, sobre toalha.</li>
<li>Peças em bastidor: limpe a poeira com pincel macio e evite sol direto, que desbota as linhas.</li></ul>
<div class="card" style="margin-top:5mm"><h2 style="font-size:11pt">Sua peça, seu nome</h2><p>Gostou do resultado? Borde suas iniciais pequenas num canto, com 2 fios. É a assinatura de quem fez.</p></div>
</div></div>
<div class="rule" style="margin-top:6mm"></div>
<div class="grid2">
<div><h3>Licença de uso</h3>
<p style="font-size:9.6pt"><b>Riscos originais NORQVA. Uso pessoal e venda de peças bordadas por você liberados; proibido revender ou distribuir este arquivo.</b></p>
<p style="font-size:8.8pt;color:var(--gray)">Você pode bordar quantas peças quiser, para você, para presentear ou para vender. Não é permitido vender, compartilhar ou publicar este PDF ou os riscos (impressos ou digitais), inteiros ou em partes.</p></div>
<div><h3>Créditos</h3>
<p style="font-size:8.6pt;color:var(--gray)">Riscos, diagramas e textos: NORQVA, 2026. Todos os desenhos foram feitos para este kit.</p>
<p style="font-size:8.6pt;color:var(--gray)">Fontes usadas nos textos e nas letras dos riscos: <b>Playfair Display</b> (Copyright 2017 The Playfair Display Project Authors), <b>Lora</b> (Copyright 2011 The Lora Project Authors) e <b>Poppins</b> (Copyright 2020 The Poppins Project Authors), licenciadas sob a SIL Open Font License, versão 1.1 (scripts.sil.org/OFL).</p></div>
</div>
<div style="text-align:center;margin-top:8mm;font-family:'NSerif';font-style:italic;font-size:15pt;color:var(--terra)">Bom bordado!</div>'''
pages.append(page(fim, P_FIM, "Acabamento"))

assert len(pages) == P_FIM, (len(pages), P_FIM)

doc = (f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Kit de Bordado NORQVA</title>'
       f'<style>{CSS}</style></head><body>{"".join(pages)}</body></html>')
out_html = os.path.join(HERE, "bordado.html")
open(out_html, "w", encoding="utf-8").write(doc)

from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    kw = {"args": ["--allow-file-access-from-files"]}
    linux = glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome")
    if linux:
        kw["executable_path"] = linux[0]
    b = p.chromium.launch(**kw)
    pg = b.new_page()
    pg.goto(uri(out_html))
    pg.wait_for_timeout(1200)
    over = pg.evaluate("""() => [...document.querySelectorAll('.page')].map((p,i)=>{
        const b=p.querySelector('.body'); if(!b) return null;
        let maxB=0; b.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect(); if(r.height>0 && r.width>0) maxB=Math.max(maxB,r.bottom)});
        const br=b.getBoundingClientRect();
        return {page:i+1, free_mm: Math.round((br.bottom-maxB)/3.7795)}; }).filter(Boolean)""")
    bad = [o for o in over if o["free_mm"] < 0]
    print("páginas que estouram:", bad or "nenhuma")
    print("fontes:", sorted(set(pg.evaluate("() => [...document.fonts].map(f=>f.family+':'+f.weight+':'+f.style+':'+f.status)"))))
    pg.pdf(path=OUT_PDF, width="210mm", height="297mm", print_background=True, margin=dict(top="0", bottom="0", left="0", right="0"))
    b.close()
print("ok:", OUT_PDF, f"{os.path.getsize(OUT_PDF) / 1e6:.2f} MB")

prev = os.path.join(HERE, "preview")
if shutil.which("pdftoppm"):
    os.makedirs(prev, exist_ok=True)
    for old in glob.glob(os.path.join(prev, "*.png")):
        os.remove(old)
    subprocess.run(["pdftoppm", "-r", "100", "-png", OUT_PDF, os.path.join(prev, "pagina")], check=True)
    print("prévias em", prev)
else:
    print("pdftoppm não encontrado: prévias PNG não geradas")
