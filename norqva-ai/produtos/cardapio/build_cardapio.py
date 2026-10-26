# -*- coding: utf-8 -*-
"""Gera CARDAPIO_ITALIANO_4_SEMANAS.pdf: bônus da Coleção Trattoria Completa (NORQVA-0138).

Mesmo visual dos livros da coleção (paes/build_paes.py). Roda no Linux e no Windows: as fontes Liberation são usadas
quando existem; no Windows entram Times New Roman e Arial, que têm as mesmas medidas. O Chromium é o do Playwright,
ou o de /opt/pw-browsers quando existir.

Antes de gerar, confere contra os arquivos de conteúdo dos 5 livros:
- toda receita citada existe (nome, número e página vêm do próprio livro);
- todo trecho de ingrediente usado na lista de compras aparece na receita;
- toda linha de ingrediente de cada receita usada entrou na conta (comprada, da despensa ou vinda de outra receita).
Se algo não bater, para com erro e não gera o PDF.

Uso: python build_cardapio.py
"""
import glob, html, importlib.util, math, os, sys
from collections import OrderedDict
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from content_cardapio import ITEMS, SECTIONS, ING, FERMENTO, WEEKS, VARIAR_FDS, VARIAR_DOCES, REF  # noqa: E402

E = html.escape
FOOT = "Cardápio Italiano de 4 Semanas • Edição Digital 2026"
OUT_PDF = os.path.join(HERE, "CARDAPIO_ITALIANO_4_SEMANAS.pdf")


def load(rel, name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, rel))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


# ─────────────── os 5 livros: número e página de cada receita, como no livro ───────────────
BOOKS = OrderedDict([
    ("T", dict(name="Trattoria em Casa", short="Trattoria", vol="I", mod=load("trattoria/content_trattoria.py", "c_trattoria"))),
    ("D", dict(name="Dolci della Nonna", short="Dolci", vol="II", mod=load("dolci/content.py", "c_dolci"))),
    ("P", dict(name="Pães & Fermentação Natural", short="Pães", vol="III", mod=load("paes/content_paes.py", "c_paes"))),
    ("A", dict(name="Antipasti & Aperitivo", short="Antipasti", vol="IV", mod=load("antipasti/content_antipasti.py", "c_antipasti"))),
    ("R", dict(name="Risotos & Polentas", short="Risotos", vol="V", mod=load("risotos/content_risotos.py", "c_risotos"))),
])

RECIPE = {}  # (livro, slug) -> dict(title, num, page, recipe)
for key, b in BOOKS.items():
    recs = b["mod"].RECIPES
    if key == "T":
        # mesma conta de build_trattoria.py: capa 1, sumário 2, como usar 3, princípios 4, depois módulo (1 página)
        # e cada receita em 2 páginas (abertura com foto + receita)
        cur, page_of, order = 5, {}, []
        for _num, _t, _s, slugs in b["mod"].MODULES:
            cur += 1
            for sl in slugs:
                page_of[sl] = cur
                cur += 2
                order.append(sl)
        by = {r["slug"]: r for r in recs}
        for i, sl in enumerate(order):
            RECIPE[(key, sl)] = dict(title=by[sl]["title"], num=i + 1, page=page_of[sl], r=by[sl])
    else:
        # Dolci, Pães, Antipasti e Risotos: capa 1, sumário 2, abertura 3, técnicas 4, receita n na página 5 + 2(n-1)
        for i, r in enumerate(recs):
            RECIPE[(key, r["slug"])] = dict(title=r["title"], num=i + 1, page=5 + 2 * i, r=r)

SHORT = {
    ("T", "ragu"): "Ragù alla bolognese", ("T", "pappardelle"): "Pappardelle", ("T", "aglio-olio"): "Aglio, olio e peperoncino",
    ("T", "gorgonzola"): "Massa ao gorgonzola e nozes", ("T", "focaccia"): "Focaccia genovese", ("T", "lasanha"): "Lasanha alla bolognese",
    ("T", "pesto"): "Massa ao pesto", ("T", "sugo-cereja"): "Sugo de tomate-cereja", ("T", "puttanesca"): "Spaghetti alla puttanesca",
    ("T", "bruschetta"): "Bruschetta de tomate", ("T", "amatriciana"): "Amatriciana", ("T", "cacio-pepe"): "Cacio e pepe",
    ("T", "ravioli"): "Ravioli de ricota", ("T", "burro-salvia"): "Burro e salvia", ("T", "pomodoro"): "Pomodoro e basilico",
    ("T", "cogumelos"): "Massa com cogumelos", ("T", "carbonara"): "Carbonara",
    ("D", "tiramisu"): "Tiramisù", ("D", "caprese"): "Torta caprese", ("D", "pannacotta"): "Panna cotta", ("D", "nonna"): "Torta della Nonna",
    ("P", "piadina"): "Piadina", ("P", "ciabatta"): "Ciabatta", ("P", "rustico"): "Pão rústico", ("P", "azeitonas"): "Pão de azeitonas",
    ("A", "caponata"): "Caponata", ("A", "funghi"): "Cogumelos recheados", ("A", "bruschetta"): "Bruschetta de feijão-branco",
    ("A", "tagliere"): "Tábua de frios e queijos", ("A", "polpettine"): "Almôndegas ao forno", ("A", "frittata"): "Frittata de abobrinha",
    ("A", "involtini"): "Rolinhos de berinjela", ("A", "crostini"): "Crostini de ricota", ("A", "peperoni"): "Pimentões assados",
    ("R", "limao"): "Risoto de limão-siciliano", ("R", "funghi"): "Risoto de cogumelos", ("R", "camarao"): "Risoto de camarão",
    ("R", "ragu"): "Polenta com ragù de cogumelos", ("R", "milanese"): "Risoto alla milanese", ("R", "abobora"): "Risoto de abóbora",
    ("R", "linguica"): "Risoto de linguiça",
}


# ─────────────── conferência contra os livros ───────────────
def lines_of(key):
    return [x for _g, items in RECIPE[key]["r"]["ingredients"] for x in items]


errors = []
used = set()
for w in WEEKS:
    for _d, dishes, _o in w["days"]:
        for b, s, _f, _n in dishes:
            used.add((b, s))
    for b, s, _f in w["extras"]:
        used.add((b, s))
used.add(("P", "fermento"))
for b, s, _t in VARIAR_FDS + VARIAR_DOCES:
    if (b, s) not in RECIPE:
        errors.append(f"receita sugerida não existe: {b}/{s}")
for key in sorted(used):
    if key not in RECIPE:
        errors.append(f"receita não existe no livro: {key}")
        continue
    if key not in ING:
        errors.append(f"receita sem ingredientes mapeados: {key}")
        continue
    lines = lines_of(key)
    for ent in ING[key]:
        src, item = ent[0], ent[1]
        if not any(src in ln for ln in lines):
            errors.append(f"{key}: trecho não está na receita: {src!r}")
        if item is not REF and item not in ITEMS:
            errors.append(f"{key}: item desconhecido {item!r}")
        if item is REF and len(ent) < 5:
            errors.append(f"{key}: falta o motivo de {src!r} não ser comprado")
    for ln in lines:
        if not any(ent[0] in ln for ent in ING[key]):
            errors.append(f"{key}: linha do livro sem destino na lista: {ln!r}")
for key in ING:
    if key not in used:
        errors.append(f"ingredientes mapeados de receita que não está no cardápio: {key}")
if sum(len(w["days"]) for w in WEEKS) != 28:
    errors.append("o cardápio precisa de 28 jantares")
if errors:
    print("CONFERÊNCIA FALHOU:", *errors, sep="\n  ")
    sys.exit(1)
print("conferência ok:", len(used), "receitas,", sum(len(v) for v in ING.values()), "linhas de ingrediente")


# ─────────────── lista de compras de cada semana ───────────────
def week_uses(w):
    """(receita, fator) de tudo o que se cozinha na semana, inclusive bases (massa, caldo, bechamel)."""
    out = []
    for _d, dishes, _o in w["days"]:
        for b, s, f, _n in dishes:
            out.append(((b, s), f))
    for b, s, f in w["extras"]:
        out.append(((b, s), f))
    return out


def shopping(w):
    tot = OrderedDict()  # item -> {unit: qty}, e marcas de "a gosto"
    def add(item, qty, unit):
        d = tot.setdefault(item, {"_free": False})
        if qty is None:
            d["_free"] = True
        else:
            d[unit] = d.get(unit, 0) + qty
    for key, f in week_uses(w):
        for ent in ING[key]:
            src, item, qty, unit = ent[:4]
            if item is REF:
                continue
            add(item, None if qty is None else qty * f, unit)
    start, feeds = FERMENTO[w["n"]]
    for ent in ING[("P", "fermento")]:
        if ent[1] is REF:
            continue
        mult = start if ent[4] == "start" else feeds
        if mult:
            add(ent[1], ent[2] * mult, ent[3])
    return tot


FRAC = {0.5: "½", 0.25: "¼", 0.75: "¾"}


def num(x):
    whole = int(x)
    frac = round(x - whole, 2)
    if frac in FRAC:
        return (f"{whole}" if whole else "") + FRAC[frac]
    if abs(x - round(x)) < 1e-9:
        return str(int(round(x)))
    return f"{x:.1f}".replace(".", ",")


def up(x, step):
    return math.ceil(x / step - 1e-9) * step


UNIT = {
    "dente": ("dente", "dentes"), "talo": ("talo", "talos"), "talos": ("talo", "talos"), "folha": ("folha", "folhas"),
    "folhas": ("folha", "folhas"), "ramo": ("ramo", "ramos"), "ramos": ("ramo", "ramos"), "punhado": ("punhado", "punhados"),
    "cacho": ("cacho", "cachos"), "envelope": ("envelope", "envelopes"), "filé": ("filé", "filés"), "maço": ("maço", "maços"),
    "xícara de folhas": ("xícara de folhas", "xícaras de folhas"),
    "cs": ("colher de sopa", "colheres de sopa"), "cc": ("colher de chá", "colheres de chá"),
    "cs picada": ("colher de sopa picada", "colheres de sopa picada"), "cs picado": ("colher de sopa picado", "colheres de sopa picado"),
    "cc picado": ("colher de chá picado", "colheres de chá picado"), "cs de suco": ("colher de sopa de suco", "colheres de sopa de suco"),
    "ml de café pronto": ("ml de café pronto", "ml de café pronto"),
    "g já refogado e escorrido": ("g já refogado e escorrido", "g já refogado e escorrido"),
}
LOOSE = {"semola": "um pouco para polvilhar", "farinha_trigo": "um pouco para polvilhar", "farinha_arroz": "para polvilhar",
         "azeite": "um pouco para untar e regar"}


def fmt_qty(item, d):
    parts = []
    for unit, q in d.items():
        if unit == "_free":
            continue
        if unit == "g":
            if q >= 1000:
                parts.append(f"{num(up(q, 50) / 1000).replace('.', ',')} kg")
            elif q >= 100:
                parts.append(f"{int(up(q, 10))} g")
            elif q >= 10:
                parts.append(f"{int(up(q, 5))} g")
            else:
                parts.append(f"{num(q)} g")
        elif unit == "ml":
            if q >= 1000:
                v = up(q, 50) / 1000
                parts.append(f"{num(v)} {'litro' if v < 2 else 'litros'}")
            else:
                parts.append(f"{int(up(q, 5))} ml")
        elif unit in ("un", "gema"):
            continue
        else:
            # dente, folha, talo e filé não se compram pela metade
            v = up(q, 1) if unit in ("dente", "folha", "folhas", "talo", "talos", "filé") else up(q, 0.5)
            one, many = UNIT.get(unit, (unit, unit))
            parts.append(f"{num(v)} {one if v <= 1 else many}")
    if item == "ovos":
        whole, yolks = math.ceil(d.get("un", 0) - 1e-9), math.ceil(d.get("gema", 0) - 1e-9)
        total = whole + yolks
        if yolks and whole:
            parts.append(f"{total} ({yolks} só pela gema)")
        elif yolks:
            parts.append(f"{total} (só as gemas)")
        else:
            parts.append(f"{total}")
    elif "un" in d:
        v = math.ceil(d["un"] - 1e-9) if d["un"] >= 1 else d["un"]
        parts.insert(0, num(v))
    txt = " + ".join(parts)
    if d.get("_free"):
        loose = LOOSE.get(item, "a gosto")
        txt = f"{txt} + {loose}" if txt else loose[0].upper() + loose[1:]
    return txt


# ─────────────── visual (o mesmo dos livros) ───────────────
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
:root{--bg:#faf8f5;--ink:#1a1a1a;--gold:#9e7e4e;--gold-l:#b39a75;--rule:#e5dfd5;--box:#f2ece2;--gray:#595857;--green:#2f3a30;--dark:#161817;--terra:#a4532f}
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
h1.big{font-family:'DSerif';font-weight:400;font-size:24pt;line-height:1.1;margin:2mm 0 3mm;text-transform:uppercase}
.lead{font-family:'DSerif';font-style:italic;font-size:10.8pt;color:var(--gray);line-height:1.45}
.sec{font-family:'DSerif';font-weight:700;font-size:8pt;letter-spacing:.24em;color:var(--gold);text-transform:uppercase;border-bottom:.6pt solid var(--rule);padding-bottom:1.6mm;margin-bottom:2.4mm}
p{margin-bottom:2.4mm}
.orn{display:block;margin:0 auto}
.two{display:grid;grid-template-columns:1fr 1fr;gap:8mm}
.prose p{font-size:9.8pt;line-height:1.52;margin-bottom:3mm}
.card{background:var(--box);padding:4mm 5mm}
.card h3{font-family:'DSerif';font-weight:700;font-size:11.5pt;margin-bottom:1.5mm}
.card p{font-size:9pt;line-height:1.45;margin:0}
.tip{background:var(--box);border-left:2.2pt solid var(--gold);padding:4mm 4.5mm}
.tip .label{margin-bottom:1.4mm;display:flex;align-items:center;gap:2mm}
.tip p{font-family:'DSerif';font-style:italic;font-size:10.2pt;line-height:1.45;margin:0}
ul.dots{list-style:none}
ul.dots li{position:relative;padding-left:3.6mm;margin-bottom:1.5mm;font-size:9.4pt;line-height:1.42}
ul.dots li:before{content:'';position:absolute;left:0;top:1.9mm;width:1.3mm;height:1.3mm;background:var(--gold);transform:rotate(45deg)}
/* capa */
.cover{background:var(--dark);color:#efe7da;background-size:cover;background-position:center 58%}
.cover .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,15,14,.95) 0%,rgba(14,15,14,.86) 34%,rgba(14,15,14,.25) 56%,rgba(14,15,14,.1) 70%,rgba(14,15,14,.8) 88%,rgba(14,15,14,.95) 100%)}
.cover .frame{position:absolute;inset:11mm;border:.7pt solid rgba(179,154,117,.55)}
.cover .frame2{position:absolute;inset:13mm;border:.4pt solid rgba(179,154,117,.3)}
.cover .top{position:absolute;top:22mm;left:0;right:0;text-align:center}
.cover .brand{font-family:'DSans';font-size:8.5pt;letter-spacing:.42em;color:var(--gold-l);margin-top:3mm}
.cover .title{position:absolute;top:48mm;left:0;right:0;text-align:center}
.cover .t1{font-family:'DSerif';font-size:40pt;letter-spacing:.06em;line-height:1;color:#f3ece0}
.cover .t2{font-family:'DSerif';font-style:italic;font-size:28pt;color:var(--gold-l);margin-top:3mm}
.cover .sub{font-family:'DSerif';font-size:12.5pt;letter-spacing:.14em;text-transform:uppercase;color:#c9b28c;margin-top:6mm;line-height:1.5}
.cover .bottom{position:absolute;bottom:24mm;left:0;right:0;text-align:center}
.cover .count{font-family:'DSerif';font-size:10pt;letter-spacing:.3em;color:#efe7da}
.cover .ed{font-family:'DSans';font-weight:700;font-size:7.6pt;letter-spacing:.42em;color:var(--gold-l);margin-top:5mm}
.cover .compl{font-family:'DSerif';font-style:italic;font-size:9pt;color:#c9bca6;margin-top:2.5mm}
/* plano da semana */
table.plan{width:100%;border-collapse:collapse;margin-top:2mm}
table.plan th{font-family:'DSerif';font-weight:700;font-size:6.8pt;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);text-align:left;padding:1.6mm 2.5mm 1.6mm 0;border-bottom:.6pt solid var(--rule)}
table.plan td{padding:2mm 2.5mm 2mm 0;border-bottom:.6pt solid var(--rule);vertical-align:top;font-size:8.8pt;line-height:1.32}
table.plan td.day{font-family:'DSerif';font-weight:700;font-size:10.5pt;width:19mm}
table.plan .dish{margin-bottom:1.1mm}
table.plan .dish:last-of-type{margin-bottom:0}
table.plan .dn{font-weight:700}
table.plan .dnote{color:var(--gray);font-size:8pt}
table.plan .ref{font-size:7.8pt;color:var(--gray);white-space:nowrap}
table.plan .ref b{color:var(--terra);font-weight:700}
table.plan .x{font-size:8pt;color:var(--ink);white-space:nowrap}
table.plan .obs{font-family:'DSerif';font-style:italic;font-size:8.6pt;color:var(--gray);margin-top:1mm}
.prep{display:grid;grid-template-columns:1fr 1fr;gap:3.5mm;margin-top:4mm}
.prep .card{padding:3.2mm 4mm}
.prep .card .label{margin-bottom:1mm}
.prep .card p{font-size:8.6pt;line-height:1.42}
/* lista */
.shop{column-count:2;column-gap:8mm;margin-top:1mm}
.shop .grp{break-inside:avoid;margin-bottom:3mm}
.shop .grp.desp{background:var(--box);padding:2.6mm 3.2mm}
.shop .row{display:flex;justify-content:space-between;gap:3mm;border-bottom:.5pt dotted #d8cfc0;padding:.62mm 0;font-size:8.2pt;line-height:1.24;break-inside:avoid}
.shop .row:last-child{border-bottom:0}
.shop .row .n{flex:1}
.shop .row .n:before{content:'';display:inline-block;width:2.4mm;height:2.4mm;border:.6pt solid var(--gold);margin-right:1.8mm;vertical-align:-.3mm}
.shop .row .q{font-weight:700;text-align:right;max-width:44%}
.small{font-size:8pt;color:var(--gray);line-height:1.4}
/* mês */
table.month{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:3mm}
table.month th{font-family:'DSerif';font-weight:700;font-size:7pt;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);padding:1.5mm 1mm;border-bottom:.6pt solid var(--rule);text-align:left}
table.month td{vertical-align:top;padding:2mm 1.4mm 2mm 0;border-bottom:.6pt solid var(--rule);font-size:7.7pt;line-height:1.3}
table.month td.wk{font-family:'DSerif';font-weight:700;font-size:9pt;width:15mm}
table.month td div+div{margin-top:.9mm;color:var(--gray)}
table.idx{width:100%;border-collapse:collapse;margin-top:2mm}
table.idx th{font-family:'DSerif';font-weight:700;font-size:6.8pt;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);text-align:left;padding:1.4mm 2mm 1.4mm 0;border-bottom:.6pt solid var(--rule)}
table.idx td{font-size:7.9pt;padding:.5mm 2mm .5mm 0;border-bottom:.5pt solid var(--rule);line-height:1.25}
table.idx td.c{text-align:center}
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
            f'<text x="20" y="25.2" text-anchor="middle" font-family="DSerif" font-style="italic" font-size="15" fill="{color}">C</text></svg>')


def leaf(color="#9e7e4e"):
    return (f'<svg width="3.4mm" height="3.4mm" viewBox="0 0 10 10"><path d="M5 0 L10 5 L5 10 L0 5 Z" fill="none" stroke="{color}" stroke-width="1.1"/>'
            f'<path d="M5 3 L7 5 L5 7 L3 5 Z" fill="{color}"/></svg>')


def page(body, n, hdr):
    return (f'<section class="page"><div class="hdr"><span class="l">{hdr}</span><span class="r">NORQVA EDITORIAL</span></div>'
            f'<div class="body">{body}</div>'
            f'<div class="ftr"><span class="l">{FOOT}</span><span class="r">{n:02d}</span></div></section>')


def ref(key, full=False):
    b = BOOKS[key[0]]
    rc = RECIPE[key]
    name = b["name"] if full else b["short"]
    return f'<b>{E(name)}</b> · nº {rc["num"]:02d} · pág. {rc["page"]:02d}'


def times_for(key, factor):
    word = {1: "1 receita", 1.5: "1½ receita", 2: "2 receitas"}.get(factor, f"{num(factor)} receitas")
    return word


pages = []

# 1. capa
cov = uri(os.path.join(ROOT, "trattoria", "orig", "jantar.jpg"))
pages.append(f'''<section class="page cover" style="background-image:url('{cov}')"><div class="shade"></div><div class="frame"></div><div class="frame2"></div>
<div class="top">{monogram(13)}<div class="brand">NORQVA</div></div>
<div class="title"><div class="t1">CARDÁPIO ITALIANO</div><div class="t2">de 4 semanas</div>
<div style="margin-top:6mm">{orn(46, "#b39a75")}</div>
<div class="sub">28 jantares para 4 pessoas<br>com a lista de compras de cada semana</div></div>
<div class="bottom"><div class="count">SÓ COM RECEITAS DOS 5 LIVROS DA COLEÇÃO</div><div class="ed">NORQVA EDITORIAL</div>
<div class="compl">Bônus da Coleção Trattoria Completa · Cozinha Italiana em Casa</div></div></section>''')

P_USO, P_MES, P_W0 = 2, 3, 4
P_VAR = P_W0 + 2 * len(WEEKS)
P_IDX, P_FIM = P_VAR + 1, P_VAR + 2

# 2. como usar
book_rows = ''.join(f'<tr><td style="width:12mm" class="c">{b["vol"]}</td><td><b>{E(b["name"])}</b></td><td>{len(b["mod"].RECIPES)} receitas</td></tr>'
                    for b in BOOKS.values())
uso = f'''<div class="kicker" style="margin-top:3mm">Antes de começar</div><h1 class="big">Como usar este cardápio</h1>
<p class="lead" style="max-width:158mm">Quatro semanas de jantar à italiana, montadas só com receitas dos cinco livros da coleção.
Nos dias de semana, pratos rápidos; no fim de semana, o forno, o pão e a sobremesa com mais calma.</p>
<div style="margin:4mm 0">{orn(40)}</div>
<div class="two prose"><div>
<div class="sec">Como ler cada semana</div>
<p>Cada semana tem <b>duas páginas</b>: o plano dos 7 jantares e a lista de compras. A semana começa no <b>sábado</b>,
com as compras da manhã, e termina na sexta.</p>
<p>Ao lado de cada prato está onde a receita fica: o <b>livro</b>, o <b>número da receita</b> e a <b>página</b>.
Na mesma linha, quantas vezes fazer a receita para 4 pessoas.</p>
<div class="sec" style="margin-top:4mm">Para 4 pessoas</div>
<p>As receitas de 4 porções entram uma vez. As de 2 a 3 porções ou de 3 porções entram <b>1½ vez</b>; as de 2 porções,
<b>em dobro</b>. Receitas que rendem mais (lasanha, sobremesas, almôndegas) entram uma vez e a sobra vai para outro dia.</p>
<div class="sec" style="margin-top:4mm">Os cinco livros</div>
<table class="idx"><tr><th>Vol.</th><th>Livro</th><th></th></tr>{book_rows}</table>
</div><div>
<div class="sec">A lista de compras</div>
<p>As quantidades são a <b>soma dos ingredientes</b> das receitas da semana, já multiplicadas para 4 pessoas,
separadas por seção do mercado. O que o livro manda usar "a gosto" aparece assim, sem número.</p>
<p>O bloco <b>Despensa</b> traz o que normalmente já está em casa (sal, azeite, farinha, açúcar, fermento).
Confira a quantidade antes de sair.</p>
<p>Massa fresca, caldo, bechamel e polenta que servem de base para outro prato já estão na lista da semana em que são feitos.</p>
<div class="tip" style="margin-top:4mm"><div class="label">{leaf()} Sobras planejadas</div>
<p>O ragù da semana 1 vira a lasanha da semana 2. O pão de domingo vira bruschetta e almôndegas.
O caldo de legumes é feito no fim de semana e serve os risotos dos dias seguintes.</p></div>
<div class="card" style="margin-top:4mm"><h3>Conservação</h3><p>Siga as notas de conservação de cada receita no livro.
Caldo, ragù e almôndegas congelam bem; esfrie antes de guardar e escreva a data no pote.</p></div>
</div></div>'''
pages.append(page(uso, P_USO, "Como usar"))

# 3. o mês em uma página
days_order = [d for d, _x, _o in WEEKS[0]["days"]]
head = '<th style="width:15mm"></th>' + ''.join(f'<th>{E(d)}</th>' for d in days_order)
mrows = ""
for w in WEEKS:
    cells = ""
    for _d, dishes, _o in w["days"]:
        cells += '<td>' + ''.join(f'<div>{E(SHORT.get((b, s), RECIPE[(b, s)]["title"]))}</div>' for b, s, _f, _n in dishes) + '</td>'
    mrows += f'<tr><td class="wk">Semana {w["n"]}</td>{cells}</tr>'
bread = [("1", "Fermento natural começa no sábado (dia 1)", "Piadina (quinta)"),
         ("2", "Fermento segue até ficar ativo", "Ciabatta com biga (domingo)"),
         ("3", "Fermento ativo: primeira fornada", "Pão rústico (domingo)"),
         ("4", "Fermento na geladeira, 1 alimentação por semana", "Pão de azeitonas (domingo)")]
brows = ''.join(f'<tr><td class="c"><b>{a}</b></td><td>{E(b)}</td><td>{E(c)}</td></tr>' for a, b, c in bread)
sweets = ''.join(f'<tr><td class="c"><b>{w["n"]}</b></td><td>{E(SHORT[k])}</td><td>{ref(k)}</td></tr>'
                 for w in WEEKS for k in [(b, s) for _d, dishes, _o in w["days"] for b, s, _f, _n in dishes if b == "D"])
mes = f'''<div class="kicker" style="margin-top:3mm">Visão geral</div><h1 class="big">O mês em uma página</h1>
<p class="lead" style="max-width:158mm">Prato principal de cada jantar. Os detalhes, as sobras e o que adiantar estão no plano de cada semana.</p>
<table class="month"><tr>{head}</tr>{mrows}</table>
<div class="two" style="margin-top:6mm"><div>
<div class="sec">O pão do mês</div>
<table class="idx"><tr><th style="width:12mm">Sem.</th><th>Fermento natural</th><th>Pão da semana</th></tr>{brows}</table>
<p class="small" style="margin-top:2.5mm">O fermento natural leva de 7 a 10 dias para ficar ativo (Pães, receita 01). Por isso as duas primeiras
semanas usam pães de fermento biológico seco.</p></div><div>
<div class="sec">A sobremesa de domingo</div>
<table class="idx"><tr><th style="width:12mm">Sem.</th><th>Doce</th><th>Onde está</th></tr>{sweets}</table>
<p class="small" style="margin-top:2.5mm">Todas rendem 6 a 10 porções: o que sobra é sobremesa para os primeiros dias da semana.</p></div></div>'''
pages.append(page(mes, P_MES, "Visão geral"))

# 4 a 11. semanas
for wi, w in enumerate(WEEKS):
    p_plan = P_W0 + 2 * wi
    rows = ""
    for day, dishes, obs in w["days"]:
        cell = ""
        for b, s, f, note in dishes:
            key = (b, s)
            dnote = f' <span class="dnote">— {E(note)}</span>' if note else ""
            cell += (f'<div class="dish"><span class="dn">{E(RECIPE[key]["title"])}</span>{dnote}'
                     f'<div class="ref">{ref(key)} &nbsp;·&nbsp; <span class="x">{times_for(key, f)}</span></div></div>')
        if obs:
            cell += f'<div class="obs">{E(obs)}</div>'
        rows += f'<tr><td class="day">{E(day)}</td><td>{cell}</td></tr>'
    cards = ''.join(f'<div class="card"><div class="label">{E(k)}</div><p>{E(v)}</p></div>' for k, v in w["prep"])
    body = f'''<div class="kicker" style="margin-top:2mm">Semana {w["n"]} · de sábado a sexta</div><h1 class="big" style="font-size:21pt">{E(w["title"])}</h1>
<p class="lead" style="font-size:10pt;max-width:165mm">{E(w["lead"])}</p>
<table class="plan"><tr><th>Dia</th><th>Jantar, onde está a receita e quantas vezes fazer para 4 pessoas</th></tr>{rows}</table>
<div class="prep">{cards}</div>'''
    pages.append(page(body, p_plan, f"Semana {w['n']} — plano"))

    tot = shopping(w)
    groups = ""
    for sec, title in SECTIONS:
        its = [(ITEMS[i][0], fmt_qty(i, d)) for i, d in tot.items() if ITEMS[i][1] == sec]
        if not its:
            continue
        its.sort(key=lambda x: x[0].lower())
        rws = ''.join(f'<div class="row"><span class="n">{E(n)}</span><span class="q">{E(q)}</span></div>' for n, q in its)
        groups += f'<div class="grp{" desp" if sec == "desp" else ""}"><div class="sec">{E(title)}</div>{rws}</div>'
    used_here = []
    for key, f in week_uses(w):
        if key not in [u for u, _ in used_here]:
            used_here.append((key, f))
    lst = f'''<div class="kicker" style="margin-top:2mm">Semana {w["n"]} · lista de compras</div><h1 class="big" style="font-size:19pt">Para os 7 jantares, 4 pessoas</h1>
<p class="small" style="margin-bottom:3mm">Soma dos ingredientes de {len(used_here)} receitas da semana, já multiplicadas para 4 pessoas (inclui as bases:
massa fresca, caldo, bechamel). Marque o que já tem em casa antes de sair.</p>
<div class="shop">{groups}</div>'''
    pages.append(page(lst, p_plan + 1, f"Semana {w['n']} — lista de compras"))

# para variar
def var_rows(lst):
    return ''.join(f'<li><b>{E(RECIPE[(b, s)]["title"])}</b><br><span class="small">{ref((b, s), True)}</span><br>{E(t)}</li>' for b, s, t in lst)


var = f'''<div class="kicker" style="margin-top:3mm">Para variar</div><h1 class="big">Outros fins de semana e outras sobremesas</h1>
<p class="lead" style="max-width:158mm">Quando quiser trocar um prato, estas receitas da coleção cabem no mesmo ritmo do cardápio.
Elas não estão nas listas de compras: confira os ingredientes no livro.</p>
<div style="margin:4mm 0">{orn(40)}</div>
<div class="two"><div><div class="sec">Fim de semana</div><ul class="dots">{var_rows(VARIAR_FDS)}</ul></div>
<div><div class="sec">Sobremesas</div><ul class="dots">{var_rows(VARIAR_DOCES)}</ul>
<div class="tip" style="margin-top:4mm"><div class="label">{leaf()} Na semana</div>
<p>Affogato e budino são as sobremesas mais rápidas da coleção. Os cantucci, assados num domingo, acompanham o café da semana inteira.</p></div>
</div></div>'''
pages.append(page(var, P_VAR, "Para variar"))

# índice das receitas usadas
weeks_of = {}
for w in WEEKS:
    for key, _f in week_uses(w):
        weeks_of.setdefault(key, set()).add(w["n"])
weeks_of.setdefault(("P", "fermento"), set()).update({1, 2, 3, 4})
idx_rows = ""
for bk, b in BOOKS.items():
    keys = sorted([k for k in weeks_of if k[0] == bk], key=lambda k: RECIPE[k]["num"])
    for k in keys:
        idx_rows += (f'<tr><td>{E(b["short"])}</td><td class="c">{RECIPE[k]["num"]:02d}</td><td>{E(RECIPE[k]["title"])}</td>'
                     f'<td class="c">{RECIPE[k]["page"]:02d}</td><td class="c">{", ".join(str(x) for x in sorted(weeks_of[k]))}</td></tr>')
idx = f'''<div class="kicker" style="margin-top:3mm">Índice</div><h1 class="big" style="font-size:17pt;margin-bottom:1.5mm">As receitas do cardápio</h1>
<p class="small" style="margin-bottom:2mm">Todas as receitas usadas no mês, com o livro, o número e a página em que estão.</p>
<table class="idx"><tr><th>Livro</th><th class="c">Nº</th><th>Receita</th><th class="c">Pág.</th><th class="c">Semana</th></tr>{idx_rows}</table>'''
pages.append(page(idx, P_IDX, "Índice"))

# encerramento
fim = f'''<div style="height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
{monogram(18, "#9e7e4e")}
<div style="font-family:'DSerif';font-weight:700;font-size:24pt;line-height:1.25;margin-top:10mm;text-transform:uppercase;max-width:150mm">
Um mês de jantares<br>à mesa, em família.</div>
<div style="margin:7mm 0">{orn(46)}</div>
<p class="lead" style="max-width:125mm">Depois das quatro semanas, repita as que a casa mais gostou, troque um prato pelas sugestões
da página {P_VAR:02d} e monte o seu próprio cardápio com os cinco livros.</p>
<p style="font-family:'DSerif';font-style:italic;font-weight:700;color:var(--gold);font-size:12pt;margin-top:8mm">Buon appetito!</p>
<div style="margin-top:22mm;border-top:.6pt solid var(--rule);padding-top:5mm;width:125mm">
<div class="label" style="letter-spacing:.3em">Norqva Editorial</div>
<p style="font-size:8pt;color:var(--gray);margin-top:2mm">Cardápio Italiano de 4 Semanas — bônus da Coleção Trattoria Completa<br>
Coleção Cozinha Italiana em Casa · Edição Digital 2026</p></div>
</div>'''
pages.append(page(fim, P_FIM, "Cardápio Italiano de 4 Semanas"))

doc = (f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cardápio Italiano de 4 Semanas</title>'
       f'<style>{CSS}</style></head><body>{"".join(pages)}</body></html>')
doc = doc.replace(' °C', '&nbsp;°C')
out_html = os.path.join(HERE, "cardapio.html")
open(out_html, "w", encoding="utf-8").write(doc)

from playwright.sync_api import sync_playwright  # noqa: E402
with sync_playwright() as p:
    kw = {"args": ["--allow-file-access-from-files"]}
    linux = glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome")
    if linux:
        kw["executable_path"] = linux[0]
    b = p.chromium.launch(**kw)
    pg = b.new_page()
    pg.goto(uri(out_html))
    pg.wait_for_timeout(1500)
    over = pg.evaluate("""() => [...document.querySelectorAll('.page')].map((p,i)=>{
        const b=p.querySelector('.body'); if(!b) return null;
        let maxB=0, maxR=0; b.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect(); if(r.height>0){maxB=Math.max(maxB,r.bottom); maxR=Math.max(maxR,r.right)}});
        const br=b.getBoundingClientRect();
        return {page:i+1, free_mm: Math.round((br.bottom-maxB)/3.7795), right_mm: Math.round((br.right-maxR)/3.7795)}; }).filter(Boolean)""")
    bad = [o for o in over if o["free_mm"] < 0 or o["right_mm"] < 0]
    for o in over:
        print(o, "  <-- ESTOURA" if o in bad else "")
    fonts = pg.evaluate("() => [...document.fonts].map(f=>f.family+':'+f.status)")
    print(set(fonts))
    pg.pdf(path=OUT_PDF, width="210mm", height="297mm", print_background=True, margin=dict(top="0", bottom="0", left="0", right="0"))
    b.close()
if bad:
    print("ATENÇÃO: há páginas com conteúdo cortado")
    sys.exit(2)
print("ok:", OUT_PDF, f"({len(pages)} páginas)")
