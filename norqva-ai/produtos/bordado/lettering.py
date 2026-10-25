# -*- coding: utf-8 -*-
"""Contorno de letras a partir de fontes OFL (Playfair Display), só o traço, sem preenchimento.

As fontes estão em fonts/ com a licença SIL Open Font License 1.1 (arquivos OFL-*.txt).
"""
import os
from functools import lru_cache
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "fonts")
SERIF_BOLD = os.path.join(FONTS, "playfair-display-latin-700-normal.woff")
SERIF_ITALIC = os.path.join(FONTS, "playfair-display-latin-600-italic.woff")
SERIF_REG = os.path.join(FONTS, "playfair-display-latin-400-normal.woff")


@lru_cache(None)
def _font(path):
    t = TTFont(path)
    kern = {}
    if "GPOS" in t:
        for lk in t["GPOS"].table.LookupList.Lookup:
            if lk.LookupType == 9:
                subs = [s.ExtSubTable for s in lk.SubTable]
            elif lk.LookupType == 2:
                subs = lk.SubTable
            else:
                continue
            for st in subs:
                if getattr(st, "LookupType", 2) != 2 and st.__class__.__name__ != "PairPos":
                    continue
                cov = st.Coverage.glyphs
                if st.Format == 1:
                    for g1, ps in zip(cov, st.PairSet):
                        for pr in ps.PairValueRecord:
                            v = getattr(pr.Value1, "XAdvance", 0) if pr.Value1 else 0
                            if v and (g1, pr.SecondGlyph) not in kern:
                                kern[(g1, pr.SecondGlyph)] = v
                elif st.Format == 2:
                    c1 = st.ClassDef1.classDefs
                    c2 = st.ClassDef2.classDefs
                    for g1 in cov:
                        k1 = c1.get(g1, 0)
                        row = st.Class1Record[k1].Class2Record
                        for g2, k2 in list(c2.items()):
                            v = getattr(row[k2].Value1, "XAdvance", 0) if row[k2].Value1 else 0
                            if v and (g1, g2) not in kern:
                                kern[(g1, g2)] = v
    return t, kern


def text_path(text, font=SERIF_BOLD, size=40.0, x=0.0, y=0.0, align="center", tracking=0.0):
    """Devolve (d, largura) do texto em mm. size = corpo da fonte (em) em mm; y = linha de base."""
    t, kern = _font(font)
    upm = t["head"].unitsPerEm
    cmap = t.getBestCmap()
    gs = t.getGlyphSet()
    s = size / upm
    names = [cmap.get(ord(ch), ".notdef") for ch in text]
    adv = []
    for i, g in enumerate(names):
        a = t["hmtx"][g][0] + tracking * upm
        if i + 1 < len(names):
            a += kern.get((g, names[i + 1]), 0)
        adv.append(a)
    width = sum(adv[:-1]) + (t["hmtx"][names[-1]][0] if names else 0)
    if align == "center":
        x0 = x - width * s / 2
    elif align == "right":
        x0 = x - width * s
    else:
        x0 = x
    d = []
    cx = 0.0
    for g, a in zip(names, adv):
        pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
        tp = TransformPen(pen, (s, 0, 0, -s, x0 + cx * s, y))
        gs[g].draw(tp)
        d.append(pen.getCommands())
        cx += a
    return " ".join(d), width * s


def cap_height(font=SERIF_BOLD):
    t, _ = _font(font)
    os2 = t["OS/2"]
    return getattr(os2, "sCapHeight", 0) / t["head"].unitsPerEm or 0.7


def x_height(font=SERIF_BOLD):
    t, _ = _font(font)
    return t["OS/2"].sxHeight / t["head"].unitsPerEm


def glyph_box(ch, font=SERIF_BOLD):
    from fontTools.pens.boundsPen import BoundsPen
    t, _ = _font(font)
    gs = t.getGlyphSet()
    g = t.getBestCmap()[ord(ch)]
    bp = BoundsPen(gs)
    gs[g].draw(bp)
    return bp.bounds, t["head"].unitsPerEm


def letter_d(ch, center, cap_h, font=SERIF_BOLD):
    """Contorno da letra centrado (pela caixa do desenho) em 'center', com altura de maiúscula cap_h mm."""
    (x0, y0, x1, y1), upm = glyph_box(ch, font)
    t, _ = _font(font)
    ch_units = t["OS/2"].sCapHeight or (y1 - y0)
    s = cap_h / ch_units
    cx, cy = center
    ox = cx - (x0 + x1) / 2 * s
    oy = cy + (y0 + y1) / 2 * s
    gs = t.getGlyphSet()
    g = t.getBestCmap()[ord(ch)]
    pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    gs[g].draw(TransformPen(pen, (s, 0, 0, -s, ox, oy)))
    return pen.getCommands(), ((x1 - x0) * s, (y1 - y0) * s)
