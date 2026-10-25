# -*- coding: utf-8 -*-
"""Os 50 riscos originais do Kit de Bordado NORQVA, desenhados em código (traço vetorial em mm reais)."""
import math
from geo import (add, sub, mul, lerp, dist, polar, rot, frame, curve, blob, chain, line, arc_pts, circle, ellipse, path,
                 dashed, petal, leaf, leaf_d, round_leaf, daisy_loop, flower5, heart, P, f, on, behind, ribbon_bow, lobed, nearest, tapered, simple_bud, circle_d, ellipse_d)

MOTIFS = []


def motif(num, name, cat, w, h, level, stitches, layout="half"):
    def deco(fn):
        MOTIFS.append(dict(num=num, name=name, cat=cat, w=w, h=h, level=level, stitches=stitches, layout=layout, draw=fn))
        return fn
    return deco




# ============================================================== peças reaproveitadas

def daisy(c, r, n=12, r0=None, hw=None, ang0=-90, loops=False):
    r0 = r * 0.27 if r0 is None else r0
    hw = (2 * math.pi * (r0 + (r - r0) * 0.5) / n) * 0.36 if hw is None else hw
    out = [circle(c, r0)]
    for i in range(n):
        a = ang0 + 360 * (i + 0.5) / n
        if loops:
            out.append(daisy_loop(polar(c, a, r0 + 0.7), a, r - r0 - 0.7, hw))
        else:
            out.append(path(petal(c, r0, a, r - r0, hw, bw=min(hw * 0.6, r0 * 0.5))))
    return "".join(out)


def stem_leaves(st, spots, L=10, hw=3, vein=True, curl=0.0, veins=0):
    """Folhas presas na haste: spots = [(u, lado, ângulo_relativo, escala)]."""
    out = []
    for u, side, rel, sc in spots:
        p, a = on(st, u)
        out.append(leaf(p, a + side * rel, L * sc, hw * sc, vein=vein, curl=side * curl, veins=veins))
    return "".join(out)


def loop_leaves(st, spots, L=8, hw=2.4):
    out = []
    for u, side, rel, sc in spots:
        p, a = on(st, u)
        out.append(daisy_loop(p, a + side * rel, L * sc, hw * sc))
    return "".join(out)


def lavender(st, u0=0.55, n=7, size=4.2):
    """Espiga de lavanda no fim da haste st."""
    out = []
    for i in range(n):
        u = u0 + (1 - u0) * i / n
        p, a = on(st, u)
        s = size * (1 - 0.35 * i / n)
        for sd in (-1, 1):
            out.append(daisy_loop(p, a + sd * 30, s, s * 0.3))
    p, a = on(st, 1.0)
    out.append(daisy_loop(p, a, size * 0.62, size * 0.22))
    return "".join(out)


def rosebud(base, ang, L, w):
    """Botão de rosa em gota com sépalas por cima (as sépalas escondem o traço do botão)."""
    T = frame(base, ang)
    body = chain([[T((0, 0)), T((0.22 * L, -0.46 * w)), T((0.58 * L, -0.5 * w)), T((0.88 * L, -0.28 * w)), T((L, 0.04 * w))],
                  [T((L, 0.04 * w)), T((0.84 * L, 0.34 * w)), T((0.52 * L, 0.5 * w)), T((0.2 * L, 0.42 * w)), T((0, 0))]], closed=True)
    wrap = curve([T((0.97 * L, 0.03 * w)), T((0.74 * L, 0.06 * w)), T((0.5 * L, 0.26 * w)), T((0.36 * L, 0.47 * w))])
    seps = [leaf_d(T((0, -0.05 * w)), ang - 30, 0.42 * L, 0.09 * L, curl=0.02 * L),
            leaf_d(T((0, 0.05 * w)), ang + 28, 0.4 * L, 0.09 * L, curl=-0.02 * L)]
    out = behind(path(body) + path(wrap), *seps)
    out += "".join(path(s) for s in seps)
    return out


def bell(top, L=13, w=11, ang=90):
    """Campânula pendurada: cúpula, saia aberta e boca com três pontas."""
    T = frame(top, ang)
    hw = w / 2
    s = chain([[T((1.0, -hw * 0.3)), T((0.4 * L, -hw * 0.5)), T((0.78 * L, -hw * 0.72)), T((L, -hw * 1.02))],
               [T((L, -hw * 1.02)), T((0.9 * L, -hw * 0.52)), T((1.06 * L, 0))],
               [T((1.06 * L, 0)), T((0.9 * L, hw * 0.52)), T((L, hw * 1.02))],
               [T((L, hw * 1.02)), T((0.78 * L, hw * 0.72)), T((0.4 * L, hw * 0.5)), T((1.0, hw * 0.3))],
               [T((1.0, hw * 0.3)), T((-0.6, 0)), T((1.0, -hw * 0.3))]], closed=True)
    out = path(s)
    out += path(curve([T((0.9 * L, -hw * 0.52)), T((0.62 * L, -hw * 0.3)), T((0.38 * L, -hw * 0.2))]))
    out += path(curve([T((0.9 * L, hw * 0.52)), T((0.62 * L, hw * 0.3)), T((0.38 * L, hw * 0.2))]))
    out += path(line(T((1.06 * L, 0)), T((1.2 * L, 0)))) + circle(T((1.2 * L + 0.8, 0)), 0.8)
    return out


def sakura(c, r, ang=-90):
    svg, _ = lobed(c, r, n=5, ang=ang, depth=0.3, notch=True, center=r * 0.16, lines=False)
    for i in range(5):
        a = ang + 72 * i
        p = polar(c, a, r * 0.46)
        svg += path(line(polar(c, a, r * 0.17), polar(c, a, r * 0.46 - 0.75))) + circle(p, 0.75)
    return svg


def rose_head(c, s=1.0):
    """Rosa vista de frente: espiral no meio e pétalas em concha em volta."""
    x, y = c
    out = []
    pts = []
    for i in range(46):
        th = i / 45 * 3.6 * math.pi
        r = (0.8 + 7.2 * i / 45) * s
        pts.append((x + r * math.cos(th + 1.2), y + 0.88 * r * math.sin(th + 1.2)))
    out.append(path(curve(pts)))
    S = lambda dx, dy: (x + dx * s, y + dy * s)
    out.append(path(curve([S(-8.5, -6), S(-13.5, 0), S(-11.5, 8), S(-4, 11.5)])))
    out.append(path(curve([S(8.2, -6.5), S(13.5, -0.5), S(12, 7.5), S(5, 11.5)])))
    out.append(path(curve([S(-12, 6), S(-6, 14.5), S(6, 14.5), S(12.5, 6.5)])))
    out.append(path(curve([S(-9, -7), S(-16.5, -4), S(-18, 6), S(-12, 15), S(-2, 18.5)])))
    out.append(path(curve([S(9, -7.5), S(17, -4), S(18, 6.5), S(12, 15), S(2, 18.5)])))
    out.append(path(curve([S(-8.5, -6.5), S(-3, -11), S(5, -10.8), S(9.5, -7)])))
    return "".join(out)


def tulip_head(B, s=1.0):
    X = lambda dx, dy: (B[0] + dx * s, B[1] + dy * s)
    sil = chain([[X(0, 0), X(-10, -4), X(-15.5, -16), X(-15.5, -28), X(-14, -37)],
                 [X(-14, -37), X(-9.5, -33), X(-6.5, -27)],
                 [X(-6.5, -27), X(-3.5, -34), X(0, -40)],
                 [X(0, -40), X(3.5, -34), X(6.5, -27)],
                 [X(6.5, -27), X(9.5, -33), X(14, -37)],
                 [X(14, -37), X(15.5, -28), X(15.5, -16), X(10, -4), X(0, 0)]], closed=True)
    i1 = curve([X(-6.5, -27), X(-5.5, -16), X(-1.6, -0.6)])
    i2 = curve([X(6.5, -27), X(5.5, -16), X(1.6, -0.6)])
    return "".join(path(d) for d in (sil, i1, i2))


# ============================================================== FLORES (01–15)

@motif(1, "Margarida", "Flores", 70, 100, "Fácil",
       [("Pétalas", "ponto atrás ou haste"), ("Miolo", "nós franceses"), ("Caule", "ponto haste"), ("Folhas", "ponto folha")])
def m01():
    c = (35, 30)
    out = [daisy(c, 23, n=14, r0=6.5, hw=3.1, ang0=-90 + 360 / 28)]
    st = [(35, 51), (34.2, 66), (35.8, 82), (34.5, 98)]
    out.append(path(curve(st)))
    out.append(stem_leaves(st, [(0.5, -1, 58, 1.0), (0.72, 1, 55, 0.9)], L=20, hw=5, curl=1.2))
    return "".join(out)


@motif(2, "Tulipa", "Flores", 62, 104, "Fácil",
       [("Flor", "ponto atrás no contorno ou ponto cheio"), ("Caule", "ponto haste"), ("Folhas", "ponto haste")])
def m02():
    B = (31, 46)
    out = tulip_head(B)
    out += path(curve([B, (31.5, 62), (30.2, 80), (31, 101)]))
    out += leaf((30.8, 100), -112, 44, 6.5, curl=-2.5, tipcurl=-3)
    out += leaf((31.2, 98), -64, 36, 5.5, curl=2.0, tipcurl=3)
    return out


@motif(3, "Rosa simples", "Flores", 80, 92, "Médio",
       [("Pétalas", "ponto haste"), ("Folhas", "ponto folha ou ponto cheio"), ("Caule", "ponto haste")])
def m03():
    out = [rose_head((40, 28))]
    st = [(40, 46.5), (41.5, 60), (40, 75), (41.5, 90)]
    out.append(path(curve(st)))
    out.append(stem_leaves(st, [(0.32, 1, 62, 1.0), (0.6, -1, 58, 0.92)], L=22, hw=7, curl=0.8, veins=3))
    return "".join(out)


@motif(4, "Raminho de lavanda", "Flores", 72, 104, "Fácil",
       [("Botões", "ponto margarida"), ("Hastes", "ponto haste"), ("Laço", "ponto atrás")])
def m04():
    out = []
    stems = [[(34, 98), (30, 70), (23, 40), (16, 8)],
             [(36, 99), (36, 70), (36.5, 38), (36, 4)],
             [(38, 98), (43, 70), (50, 40), (57, 10)]]
    lines = "".join(path(curve(st)) for st in stems)
    heads = "".join(lavender(st, u0=0.6, n=7, size=4.4) for st in stems)
    bsvg, occ = ribbon_bow((36, 76), w=13, h=8.5, tail=12, spread=6)
    return behind(lines, occ) + heads + bsvg


@motif(5, "Girassol", "Flores", 100, 140, "Médio",
       [("Pétalas", "ponto atrás ou ponto cheio"), ("Miolo", "nós franceses nos círculos"), ("Caule", "ponto haste com 4 fios"), ("Folhas", "ponto haste e nervuras em ponto atrás")], layout="full")
def m05():
    c = (50, 44)
    out = [circle(c, 14.5), circle(c, 9.5)]
    n = 18
    for i in range(n):
        a = -90 + 360 * (i + 0.5) / n
        out.append(path(petal(c, 14.5, a, 22 + (1.8 if i % 2 else 0), 4.7, tip="point", bw=2.3, curl=(0.9 if i % 2 else -0.9))))
    ga = math.pi * (3 - math.sqrt(5))
    for k in range(1, 30):
        r = 8.4 * math.sqrt(k / 29)
        th = k * ga
        out.append(circle((c[0] + r * math.cos(th), c[1] + r * math.sin(th)), 0.55))
    st1 = [(51, 80.5), (51.8, 98), (50.4, 118), (51.2, 138)]
    st2 = [(48.6, 81), (49.2, 98), (47.8, 118), (48.6, 138)]
    out.append(path(curve(st1)) + path(curve(st2)))
    for base, ang, L, w in (((48.2, 110), -150, 38, 12), ((51.6, 122), -28, 32, 10)):
        T = frame(base, ang)
        lf = chain([[T((0, 0)), T((0.16 * L, -0.75 * w)), T((0.46 * L, -w)), T((0.78 * L, -0.66 * w)), T((L, 0))],
                    [T((L, 0)), T((0.76 * L, 0.5 * w)), T((0.44 * L, 0.76 * w)), T((0.14 * L, 0.5 * w)), T((0, 0))]], closed=True)
        out.append(path(lf))
        out.append(path(curve([T((0.5, 0)), T((0.5 * L, -0.3)), T((0.88 * L, 0))])))
        for x0, s in ((0.22, -1), (0.22, 1), (0.46, -1), (0.46, 1)):
            k = 0.62 if s < 0 else 0.5
            out.append(path(curve([T((x0 * L, 0)), T(((x0 + 0.08) * L, s * w * k * 0.55)), T(((x0 + 0.16) * L, s * w * k))])))
    return "".join(out)


@motif(6, "Flor do campo", "Flores", 76, 104, "Fácil",
       [("Flores", "ponto atrás"), ("Miolos", "nó francês"), ("Botões", "ponto cheio"), ("Hastes e folhas", "ponto haste e margarida")])
def m06():
    out = []
    fsvg, vs = lobed((38, 23), 16, n=5, ang=-90, depth=0.42)
    out.append(fsvg)
    main = [nearest(vs, (38, 60)), (37.5, 55), (38.8, 78), (37.6, 101)]
    out.append(path(curve(main)))
    p, _ = on(main, 0.42)
    left = [p, (30, 54), (21, 48), (15, 40)]
    out.append(path(curve(left)))
    q, a = on(left, 1.0)
    out.append(simple_bud(q, a, 13, 8))
    p2, _ = on(main, 0.58)
    s2, vs2 = lobed((61, 44), 8.5, n=5, ang=-60, depth=0.42)
    right = [p2, (48, 64), (55, 56), nearest(vs2, (52, 60))]
    out.append(path(curve(right)) + s2)
    out.append(loop_leaves(main, [(0.72, -1, 48, 1.1), (0.84, 1, 48, 1.0)], L=10, hw=2.8))
    out.append(loop_leaves(left, [(0.45, 1, 50, 0.9)], L=9, hw=2.6))
    out.append(loop_leaves(right, [(0.3, -1, 55, 0.85)], L=9, hw=2.6))
    return "".join(out)


@motif(7, "Buquê do campo", "Flores", 112, 156, "Médio",
       [("Flores", "ponto atrás e margarida"), ("Miolos", "nós franceses"), ("Lavanda", "ponto margarida"), ("Papel", "ponto haste"), ("Laço", "ponto atrás")], layout="full")
def m07():
    heads, stems = [], []
    heads.append(daisy((30, 36), 13, n=12, r0=4, hw=2.0))
    stems.append([polar((30, 36), 90, 11.5), (38, 64), (50, 84), (54, 100)])
    fs, vs = lobed((56, 22), 12.5, n=5, ang=-90, depth=0.42)
    heads.append(fs)
    stems.append([nearest(vs, (56, 60)), (56.4, 60), (56, 100)])
    heads.append(rose_head((85, 38), s=0.64))
    stems.append([(84.5, 49.5), (76, 66), (64, 86), (58, 100)])
    l1 = [(52, 100), (40, 84), (28, 72), (14, 62)]
    l2 = [(61, 100), (72, 86), (84, 78), (99, 70)]
    stems += [l1, l2]
    heads.append(lavender(l1, u0=0.5, n=6, size=3.9) + lavender(l2, u0=0.5, n=6, size=3.9))
    heads.append(stem_leaves(stems[0], [(0.2, -1, 55, 0.85)], L=14, hw=4.2))
    heads.append(stem_leaves(stems[1], [(0.66, 1, 50, 0.95)], L=13, hw=4))
    heads.append(stem_leaves(stems[2], [(0.22, -1, 55, 0.95)], L=14, hw=4.2))
    # cone de papel
    Lc, Rc, tip = (30, 92), (84, 89), (57, 150)
    front = chain([[Lc, (44, 99.5), (60, 101), (74, 97.5), Rc], [Rc, tip], [tip, Lc]], closed=True)
    back = curve([Lc, (46, 86.5), (68, 85), Rc])
    fold = curve([(60, 101), (59, 125), (57, 150)])
    flap = curve([(44, 99.5), (50, 118), (57, 150)])
    bsvg, bocc = ribbon_bow((57.5, 122), w=10.5, h=8, tail=11, spread=5)
    stem_svg = "".join(path(curve(s)) for s in stems)
    out = behind(stem_svg, front) + "".join(heads)
    out += behind(path(front) + path(fold) + path(flap), bocc) + bsvg + path(back)
    return out


@motif(8, "Trio de margaridinhas", "Flores", 82, 96, "Fácil",
       [("Pétalas", "ponto margarida"), ("Miolos", "nó francês"), ("Hastes", "ponto haste"), ("Folhas e grama", "ponto margarida e ponto reto")])
def m08():
    out = []
    heads = [((22, 30), 10.5, 9), ((44, 16), 12, 10), ((63, 36), 9.5, 9)]
    for (c, r, n) in heads:
        out.append(daisy(c, r, n=n, r0=2.6, hw=r * 0.2, loops=True))
    sts = [[(22, 32.6), (27, 62), (38, 92)], [(44, 18.6), (42, 60), (40.5, 93)], [(63, 38.6), (55, 66), (43, 92)]]
    lines = "".join(path(curve(s)) for s in sts)
    occ = " ".join(f"M{c[0] + 2.6},{c[1]} A2.6,2.6 0 1 0 {c[0] - 2.6},{c[1]} A2.6,2.6 0 1 0 {c[0] + 2.6},{c[1]} Z" for c, _, _ in heads)
    rings = " ".join(f"M{c[0] + r},{c[1]} A{r},{r} 0 1 0 {c[0] - r},{c[1]} A{r},{r} 0 1 0 {c[0] + r},{c[1]} Z" for c, r, _ in heads)
    out.append(behind(lines, rings))
    out.append(loop_leaves(sts[0], [(0.5, 1, 55, 1.0)], L=9, hw=2.6))
    out.append(loop_leaves(sts[1], [(0.66, -1, 45, 0.95)], L=9, hw=2.6))
    out.append(loop_leaves(sts[2], [(0.42, -1, 55, 0.95)], L=9, hw=2.6))
    for x0, h, dx in ((26, 9, -3), (30, 12, -1.5), (35, 8, 1), (47, 10, 2.5), (52, 7, 3.5), (57, 9, 4)):
        out.append(path(curve([(x0, 94), (x0 + dx * 0.4, 94 - h * 0.6), (x0 + dx, 94 - h)])))
    return "".join(out)


@motif(9, "Ramo de miosótis", "Flores", 80, 88, "Fácil",
       [("Pétalas", "ponto cheio ou ponto atrás"), ("Miolos", "nó francês"), ("Ramo", "ponto haste"), ("Folhas", "ponto folha")])
def m09():
    out = []
    spots = [((24, 24), 7, -84), ((40, 13), 7.5, -96), ((56, 23), 7, -78), ((32, 37), 6.5, -100), ((49, 38), 6.5, -86),
             ((64, 41), 5.5, -92), ((16, 40), 5.5, -88)]
    root = (40, 62)
    for c, r, a in spots:
        s, vs = lobed(c, r, n=5, ang=a, depth=0.4, center=r * 0.24)
        out.append(s)
        v = nearest(vs, root)
        mid = lerp(v, root, 0.5)
        mid = (mid[0] + (c[0] - root[0]) * 0.08, mid[1])
        out.append(path(curve([v, mid, root])))
    st = [root, (40.6, 72), (39.6, 86)]
    out.append(path(curve(st)))
    out.append(stem_leaves(st, [(0.35, -1, 60, 1.0), (0.55, 1, 60, 1.0), (0.78, -1, 62, 0.85)], L=13, hw=3.6))
    return "".join(out)


@motif(10, "Copo-de-leite", "Flores", 66, 110, "Médio",
       [("Flor", "ponto haste"), ("Miolo", "ponto cheio ou nós franceses"), ("Caule", "ponto haste"), ("Folha", "ponto haste e ponto atrás")])
def m10():
    out = []
    L, T, throat = (10, 21), (57, 2), (30.5, 66)
    back = [L, (17, 12.5), (29, 7.5), (43, 4.5), T]
    right = [T, (51.5, 9.5), (46, 20), (41, 36), (35, 52), (32, 66)]
    left = [(29, 66), (25.5, 56), (19, 44), (13.5, 31), L]
    front = [L, (16.5, 25), (26, 27.6), (36, 24.6), (45, 17), (50.5, 10.2)]
    out.append(path(chain([left, back, right])))
    out.append(path(curve(front)))
    out.append(path(curve([(36, 24.6), (36, 40), (33.5, 54), (31.6, 64)])))
    out.append(path(curve([(23.4, 27.2), (22.6, 20), (24.2, 13.6), (26.8, 11.4), (29, 13.8), (29.8, 20), (29.6, 27.5)])))
    st = [(30.5, 66), (31.2, 86), (30.2, 108)]
    out.append(path(curve(st)))
    pet = [(30.4, 104), (37, 92), (44, 82)]
    out.append(path(curve(pet)))
    out.append(leaf((44, 82), -62, 25, 8.5, veins=3, curl=1.5))
    return "".join(out)


@motif(11, "Botões de rosa", "Flores", 72, 106, "Médio",
       [("Botões", "ponto cheio ou haste"), ("Sépalas", "ponto atrás"), ("Caule e espinhos", "ponto haste"), ("Folhas", "ponto folha")])
def m11():
    out = []
    main = [(36, 103), (36.8, 80), (34, 56), (27, 38), (22, 31)]
    out.append(path(curve(main)))
    p, a = on(main, 1.0)
    out.append(rosebud(p, a, 22, 14))
    p2, _ = on(main, 0.5)
    br = [p2, (44, 50), (50, 40), (53, 33)]
    out.append(path(curve(br)))
    q, a2 = on(br, 1.0)
    out.append(rosebud(q, a2, 19, 12))
    for st, u, s in ((main, 0.36, -1), (main, 0.66, 1), (br, 0.45, -1)):
        p, a = on(st, u)
        b1, _ = on(st, u - 0.025)
        b2, _ = on(st, u + 0.02)
        tipp = polar(p, a + s * 62, 2.4)
        out.append(path(chain([[b1, lerp(b1, tipp, 0.55), tipp], [tipp, b2]])))
    out.append(stem_leaves(main, [(0.12, 1, 55, 1.0), (0.27, -1, 55, 0.95)], L=17, hw=5.6, veins=2, curl=0.8))
    out.append(stem_leaves(br, [(0.55, 1, 55, 1.0)], L=12, hw=4, veins=0))
    return "".join(out)


@motif(12, "Campânulas", "Flores", 92, 76, "Fácil",
       [("Flores", "ponto atrás"), ("Hastes", "ponto haste"), ("Folhas", "ponto folha")])
def m12():
    out = []
    arch = [(16, 74), (15, 50), (22, 26), (38, 12), (56, 9), (70, 13), (78, 22)]
    out.append(path(curve(arch)))
    for u, L, w, dl in ((0.44, 15, 14, 6), (0.6, 16, 15, 6), (0.76, 15, 14, 5), (1.0, 13, 12, 0)):
        p, a = on(arch, u)
        q = (p[0] + dl * 0.1, p[1] + dl)
        if dl:
            out.append(path(curve([p, lerp(p, q, 0.5), q])))
        out.append(bell(q, L, w, ang=90 if dl else 75))
    st2 = [(16.4, 70), (28, 62), (42, 55), (54, 52)]
    out.append(path(curve(st2)))
    out.append(bell((54, 52), 11, 10, ang=95))
    out.append(stem_leaves(st2, [(0.45, -1, 50, 0.7)], L=14, hw=4))
    out.append(stem_leaves(arch, [(0.06, -1, 52, 1.05), (0.12, 1, 50, 1.0), (0.22, -1, 48, 0.85), (0.3, 1, 45, 0.7)], L=16, hw=4.4, curl=1))
    return "".join(out)


def dandelion_leaf(base, ang, L, flip=False, w=7.0):
    """Folha de dente-de-leão: três dentes de cada lado, pontas voltadas para a base."""
    sg = -1 if flip else 1
    T = frame(base, ang, sy=sg)
    def side(sgn, wk):
        teeth = [(0.16, 0.30), (0.42, 0.56), (0.66, 0.78)]  # (ponta, vale seguinte) em fração de L
        ch = []
        cur = (0, 0)
        for k, (tx, vx) in enumerate(teeth):
            ww = w * (1 - 0.18 * k) * wk
            tip = (tx * L, sgn * ww)
            val = (vx * L, sgn * ww * 0.34)
            ch.append([cur, lerp(cur, tip, 0.55), tip] if k == 0 else [cur, (cur[0] + 0.02 * L, sgn * ww * 0.6), tip])
            ch.append([tip, (lerp(tip, val, 0.5)[0], sgn * ww * 0.82), val])
            cur = val
        ch.append([cur, (0.9 * L, sgn * w * 0.26 * wk), (L, 0)])
        return ch
    top = side(-1, 1.0)
    bot = side(1, 0.85)
    bot_rev = [list(reversed(c)) for c in reversed(bot)]
    d = chain([[T(p) for p in c] for c in top + bot_rev], closed=True)
    return path(d) + path(curve([T((1, 0)), T((0.5 * L, 0)), T((0.88 * L, 0))]))


def dandelion_seed(p0, a, L=7):
    p1 = polar(p0, a, L)
    out = path(line(polar(p0, a, 1.2), p1)) + ellipse(lerp(p0, polar(p0, a, 1.2), 0.5), 0.9, 0.5, a)
    for d in (-38, 0, 38):
        out += path(line(p1, polar(p1, a + d, 3.0)))
    return out


@motif(13, "Dente-de-leão", "Flores", 84, 112, "Fácil",
       [("Sementes", "ponto reto"), ("Miolo", "nós franceses"), ("Haste", "ponto haste"), ("Folhas", "ponto atrás")])
def m13():
    out = []
    c = (36, 32)
    out.append(circle(c, 3))
    n = 18
    for i in range(n):
        a = 360 * i / n + 5
        r = 16 + (2 if i % 2 else 0)
        p1 = polar(c, a, r)
        out.append(path(line(polar(c, a, 3), p1)))
        for d in (-38, 0, 38):
            out.append(path(line(p1, polar(p1, a + d, 3.0))))
    out.append(dandelion_seed((60, 26), -40))
    out.append(dandelion_seed((70, 42), -15))
    out.append(dandelion_seed((63, 56), -60))
    st = [(36, 35), (36.8, 60), (39.5, 86), (40, 108)]
    out.append(path(curve(st)))
    out.append(dandelion_leaf((39.2, 108), -134, 34))
    out.append(dandelion_leaf((40.6, 108), -48, 30, flip=True, w=6.4))
    return "".join(out)


@motif(14, "Vasinho de flores", "Flores", 84, 104, "Fácil",
       [("Flores", "ponto margarida e ponto atrás"), ("Miolos", "nós franceses"), ("Hastes e folhas", "ponto haste"), ("Vaso", "ponto atrás ou corrente")])
def m14():
    out = []
    out.append(daisy((24, 24), 11, n=8, r0=2.8, hw=2.4, loops=True))
    fs, vs = lobed((44, 14), 10, n=5, ang=-90, depth=0.42)
    out.append(fs)
    out.append(tulip_head((63.5, 34), s=0.5))
    sts = [[(25.5, 26.6), (34, 50), (40, 66)], [nearest(vs, (44, 40)), (43.4, 40), (42, 66)], [(63.5, 34), (54, 50), (45, 66)]]
    lines = "".join(path(curve(s)) for s in sts)
    out.append(behind(lines, f"M{26.8},24 A2.8,2.8 0 1 0 {21.2},24 A2.8,2.8 0 1 0 26.8,24 Z"))
    out.append(stem_leaves(sts[0], [(0.6, -1, 52, 1.0)], L=10, hw=3))
    out.append(stem_leaves(sts[1], [(0.55, -1, 50, 0.95)], L=10, hw=3))
    out.append(stem_leaves(sts[2], [(0.42, -1, 52, 1.0)], L=10, hw=3))
    pot = chain([[(23, 66), (61, 66)], [(61, 66), (61, 73.5)], [(61, 73.5), (23, 73.5)], [(23, 73.5), (23, 66)]], closed=True)
    out.append(path(pot))
    out.append(path(chain([[(26.5, 73.5), (31, 100)], [(31, 100), (53, 100)], [(53, 100), (57.5, 73.5)]])))
    out.append(path(heart((42, 87), 9, 8)))
    return "".join(out)


@motif(15, "Galho de cerejeira", "Flores", 124, 88, "Médio",
       [("Pétalas", "ponto atrás ou haste"), ("Estames", "ponto reto e nós franceses"), ("Galho", "ponto haste"), ("Botões", "ponto cheio")], layout="full")
def m15():
    out = []
    center = [(5, 82), (32, 68), (60, 52), (88, 35), (116, 14)]
    branch = tapered(center, 5.2, 1.4)
    tw1 = [on(center, 0.36)[0], (47, 44), (44, 32)]
    tw2 = [on(center, 0.62)[0], (88, 45), (100, 47)]
    tw3 = [on(center, 0.8)[0], (101, 16), (99, 8)]
    tw4 = [on(center, 0.14)[0], (19, 66), (20, 58)]
    flowers = [((44, 21), 13, -80), ((74, 22), 11, -100), ((106, 56), 10.5, -70), ((20, 48), 9, -95)]
    fl = "".join(sakura(c, r, a) for c, r, a in flowers)
    occ = [f"M{c[0] + r * 0.9},{c[1]} A{r * 0.9},{r * 0.9} 0 1 0 {c[0] - r * 0.9},{c[1]} A{r * 0.9},{r * 0.9} 0 1 0 {c[0] + r * 0.9},{c[1]} Z" for c, r, a in flowers]
    twigs = "".join(path(curve(t)) for t in (tw1, tw2, tw3, tw4))
    out.append(path(branch) + behind(twigs, branch, *occ) + fl)
    for p, a in (((99, 8), -95), ((116.5, 13.5), -36)):
        out.append(simple_bud(p, a, 8, 5.5))
    for u, s in ((0.5, 1), (0.7, 1)):
        p, a = on(center, u)
        out.append(leaf(polar(p, a + 90, 2.0), a + 70, 10, 3.4))
    return "".join(out)




# ============================================================== FOLHAGENS E RAMOS (16–25)

def euca_leaf(p, a, L, hw):
    """Folha redonda de eucalipto presa por um cabinho curto."""
    q = polar(p, a, 1.6)
    return path(line(p, q)) + round_leaf(q, a, L, hw)


def along(center, n, fn, u0=0.0, u1=1.0):
    out = []
    for i in range(n):
        u = u0 + (u1 - u0) * i / max(1, n - 1)
        p, a = on(center, u)
        out.append(fn(i, u, p, a))
    return "".join(out)


def berry_cluster(p, a, n=3, r=1.9, stem=5):
    out = []
    spread = [(-28, 1.0), (0, 1.25), (28, 0.95), (-55, 0.8)][:n]
    for d, k in spread:
        e = polar(p, a + d, stem * k)
        out.append(path(curve([p, polar(p, a + d * 0.6, stem * k * 0.5), polar(e, a + d + 180, r)])))
        out.append(circle(e, r))
    return "".join(out)


@motif(16, "Ramo de folhas", "Folhagens e ramos", 74, 104, "Fácil",
       [("Folhas", "ponto folha ou ponto haste no contorno"), ("Nervuras", "ponto atrás"), ("Ramo", "ponto haste")])
def m16():
    st = [(30, 102), (34, 80), (30, 56), (37, 34), (43, 15)]
    out = [path(curve(st))]
    spots = [(0.16, 1, 50, 1.0), (0.3, -1, 52, 0.95), (0.44, 1, 50, 0.88), (0.58, -1, 50, 0.8), (0.72, 1, 48, 0.7), (0.85, -1, 46, 0.6)]
    out.append(stem_leaves(st, spots, L=24, hw=7, veins=3, curl=1.4))
    p, a = on(st, 1.0)
    out.append(leaf(p, a, 11, 3.4))
    return "".join(out)


@motif(17, "Folha de samambaia", "Folhagens e ramos", 92, 120, "Médio",
       [("Haste central", "ponto haste"), ("Folíolos", "ponto folha ou ponto margarida alongado")], layout="full")
def m17():
    rach = [(30, 118), (34, 92), (42, 64), (56, 36), (76, 10)]
    out = [path(curve(rach))]
    n = 12
    for i in range(n):
        u = 0.13 + 0.82 * i / (n - 1)
        p, a = on(rach, u)
        k = i / (n - 1)
        L = (17 + 6 * math.sin(math.pi * min(1, k * 1.6))) * (1 - 0.72 * k) + 2.5
        for sd in (-1, 1):
            out.append(leaf(p, a + sd * 56, L, L * 0.16, vein=False, curl=-sd * L * 0.05))
    p, a = on(rach, 1.0)
    out.append(leaf(p, a, 5, 1.4, vein=False))
    return "".join(out)


@motif(18, "Ramo de eucalipto", "Folhagens e ramos", 72, 110, "Fácil",
       [("Folhas", "ponto haste no contorno ou ponto cheio"), ("Ramo", "ponto haste")])
def m18():
    st = [(36, 108), (38, 84), (34, 58), (37, 34), (35, 14)]
    out = [path(curve(st))]
    n = 6
    for i in range(n):
        u = 0.14 + 0.78 * i / (n - 1)
        p, a = on(st, u)
        L = 15 * (1 - 0.45 * i / (n - 1))
        for sd in (-1, 1):
            out.append(euca_leaf(p, a + sd * (78 - 4 * i) + (6 if i % 2 else -6), L, L * 0.48))
    p, a = on(st, 1.0)
    out.append(euca_leaf(p, a, 6, 3))
    return "".join(out)


@motif(19, "Guirlanda de folhas", "Folhagens e ramos", 112, 112, "Médio",
       [("Aro", "ponto haste"), ("Folhas", "ponto margarida ou ponto folha"), ("Frutinhas", "nós franceses ou ponto cheio")], layout="full")
def m19():
    c = (56, 56)
    R = 40
    ring = [polar(c, 90 + 360 * i / 48, R) for i in range(49)]
    out = [path(curve(ring))]
    n = 26
    for i in range(n):
        ang = 90 + 360 * i / n
        p = polar(c, ang, R)
        tang = ang + 90
        side = 1 if i % 2 else -1
        out.append(leaf(p, tang + side * 38, 11.5, 3.6, curl=side * 0.6))
    berries, occ = [], []
    for ang in (35, 155, 275):
        for k, d in enumerate((-4.2, 0, 4.2)):
            q = polar(c, ang + d, R + (4.2 if k == 1 else 1.2))
            berries.append(circle(q, 2.1))
            occ.append(f"M{q[0] + 2.1},{q[1]} A2.1,2.1 0 1 0 {q[0] - 2.1},{q[1]} A2.1,2.1 0 1 0 {q[0] + 2.1},{q[1]} Z")
    return behind("".join(out), *occ) + "".join(berries)


@motif(20, "Coroa aberta com laço", "Folhagens e ramos", 112, 104, "Médio",
       [("Ramos", "ponto haste"), ("Folhas", "ponto folha"), ("Laço", "ponto atrás ou corrente")], layout="full")
def m20():
    c = (56, 50)
    R = 42
    out = []
    branches = []
    for sd in (-1, 1):
        pts = [polar(c, 90 + sd * (8 + 135 * i / 8), R) for i in range(9)]
        branches.append(pts)
        n = 9
        for i in range(n):
            u = 0.06 + 0.9 * i / (n - 1)
            p, a = on(pts, u)
            L = 14 * (1 - 0.35 * i / (n - 1))
            for side in (-1, 1):
                out.append(leaf(p, a + side * 42, L, L * 0.3, curl=side * 0.5))
        p, a = on(pts, 1.0)
        out.append(leaf(p, a, 9, 2.8))
    bsvg, occ = ribbon_bow((56, 92), w=13, h=9, tail=10, spread=6)
    stems = "".join(path(curve(b)) for b in branches)
    return behind(stems + "".join(out), occ) + bsvg


def monstera(base, ang, L, W):
    """Folha de costela-de-adão: coração largo com recortes que seguem as nervuras e furinhos alongados."""
    T = frame(base, ang)
    half = [(0, 0), (-0.07 * L, -0.14 * W), (-0.08 * L, -0.36 * W), (0.0, -0.62 * W), (0.16 * L, -0.84 * W),
            (0.38 * L, -0.9 * W), (0.6 * L, -0.76 * W), (0.8 * L, -0.46 * W), (0.93 * L, -0.18 * W), (L, 0)]
    slits = [0.3, 0.42, 0.54, 0.66, 0.78]
    out = []
    pieces = []
    for sg in (-1, 1):
        hp = [(x, -y * sg * -1) if sg > 0 else (x, y) for x, y in half]
        if sg > 0:
            hp = [(x, -y) for x, y in half]
        segs = []
        prev_u = 0.0
        prev_pt = hp[0]
        for k, u in enumerate(slits):
            du = 0.022
            a_pt, _ = on(hp, u - du)
            b_pt, _ = on(hp, u + du)
            mpt, _ = on(hp, u)
            root = (max(0.04 * L, mpt[0] - 0.42 * abs(mpt[1])), 0)
            inner = lerp(mpt, root, 0.58)
            seg = [on(hp, prev_u + (u - du - prev_u) * t / 6)[0] for t in range(7)]
            segs.append(seg)
            ia = lerp(a_pt, root, 0.58)
            nrm = (inner[1] - mpt[1], -(inner[0] - mpt[0]))
            ln = math.hypot(*nrm) or 1
            bend = (nrm[0] / ln * 0.9, nrm[1] / ln * 0.9)
            segs.append([a_pt, add(lerp(a_pt, inner, 0.5), bend), inner])
            segs.append([inner, add(lerp(b_pt, inner, 0.5), bend), b_pt])
            prev_u = u + du
        segs.append([on(hp, prev_u + (1 - prev_u) * t / 6)[0] for t in range(7)])
        pieces.append(segs)
    top = pieces[0]
    bot = [list(reversed(c)) for c in reversed(pieces[1])]
    d = chain([[T(p) for p in c] for c in top + bot], closed=True)
    out.insert(0, path(d))
    out.append(path(curve([T((0, 0)), T((0.45 * L, -0.01 * W)), T((0.9 * L, 0))])))
    for x, y, d in ((0.3, -0.24, -38), (0.47, -0.22, -40), (0.33, 0.24, 38), (0.5, 0.21, 40)):
        out.append(ellipse(T((x * L, y * W)), 0.06 * L, 0.017 * L, ang + d))
    return "".join(out)


@motif(21, "Costela-de-adão", "Folhagens e ramos", 92, 112, "Médio",
       [("Contorno", "ponto haste"), ("Nervura e furinhos", "ponto atrás"), ("Cabo", "ponto haste")])
def m21():
    out = []
    st = [(50, 110), (50, 96), (47, 82)]
    out.append(path(curve(st)))
    out.append(monstera((47, 82), -100, 74, 44))
    return "".join(out)


@motif(22, "Ramo de oliveira", "Folhagens e ramos", 112, 80, "Fácil",
       [("Folhas", "ponto folha ou ponto atrás"), ("Azeitonas", "ponto cheio"), ("Ramo", "ponto haste")])
def m22():
    st = [(6, 66), (32, 53), (56, 43), (78, 34), (95, 24)]
    out = [path(curve(st))]
    olives, occ = [], []
    for u, sd in ((0.27, 1), (0.5, 1), (0.73, 1)):
        p, a = on(st, u)
        e = polar(p, a + sd * 80, 6.5)
        out.append(path(curve([p, polar(p, a + sd * 65, 3.4), e])))
        oc = polar(e, a + sd * 92, 4.2)
        olives.append(ellipse(oc, 4.2, 3.0, a + sd * 92))
        occ.append(ellipse_d(oc, 4.2, 3.0, a + sd * 92))
    n = 9
    for i in range(n):
        u = 0.08 + 0.84 * i / (n - 1)
        p, a = on(st, u)
        sd = 1 if i % 2 else -1
        out.append(leaf(p, a + sd * 32, 21 - i * 1.0, 2.9, curl=sd * 0.9))
    p, a = on(st, 1.0)
    out.append(leaf(p, a, 11, 2.6))
    return behind("".join(out), *occ) + "".join(olives)


@motif(23, "Trio de folhas", "Folhagens e ramos", 92, 96, "Fácil",
       [("Folhas", "ponto haste no contorno"), ("Nervuras", "ponto atrás"), ("Cabos", "ponto haste")])
def m23():
    out = []
    root = (46, 92)
    out.append(path(curve([root, (40, 78), (30, 64)])))
    out.append(leaf((30, 64), -130, 36, 11, veins=4, curl=-2))
    out.append(path(curve([root, (47, 72), (46, 52)])))
    T = frame((46, 52), -90)
    hl = chain([[T((0, 0)), T((-1.5, -8)), T((6, -15)), T((22, -13)), T((34, -5)), T((42, 0))],
                [T((42, 0)), T((34, 5)), T((22, 13)), T((6, 15)), T((-1.5, 8)), T((0, 0))]], closed=True)
    out.append(path(hl))
    out.append(path(curve([T((0, 0)), T((20, 0)), T((38, 0))])))
    for x, w in ((8, 9), (17, 10), (26, 7.5)):
        for sg in (-1, 1):
            out.append(path(curve([T((x, 0)), T((x + 3, sg * w * 0.55)), T((x + 6, sg * w))])))
    out.append(path(curve([root, (52, 78), (62, 64)])))
    out.append(round_leaf((62, 64), -48, 30, 13))
    T2 = frame((62, 64), -48)
    for x in (8, 15, 22):
        for sg in (-1, 1):
            out.append(path(curve([T2((x, 0)), T2((x + 2.5, sg * 4)), T2((x + 4.5, sg * 7.5))])))
    return "".join(out)


@motif(24, "Ramo de frutinhas", "Folhagens e ramos", 76, 106, "Fácil",
       [("Frutinhas", "ponto cheio ou nós franceses"), ("Folhas", "ponto folha"), ("Ramo", "ponto haste")])
def m24():
    st = [(38, 104), (36, 80), (40, 56), (36, 32), (39, 16)]
    out = [path(curve(st))]
    out.append(stem_leaves(st, [(0.12, -1, 55, 1.0), (0.3, 1, 55, 0.95), (0.52, -1, 52, 0.85), (0.72, 1, 50, 0.75)], L=20, hw=6, veins=2, curl=1))
    for u, sd in ((0.2, 1), (0.42, -1), (0.62, 1), (0.84, -1)):
        p, a = on(st, u)
        out.append(berry_cluster(p, a + sd * 70, n=3, r=2.2, stem=7))
    p, a = on(st, 1.0)
    out.append(leaf(p, a, 10, 3.2))
    return "".join(out)


@motif(25, "Meia-lua de folhagens", "Folhagens e ramos", 112, 112, "Médio",
       [("Ramos", "ponto haste"), ("Folhas redondas", "ponto cheio ou contorno em haste"), ("Folhas finas", "ponto margarida"), ("Frutinhas", "nós franceses")], layout="full")
def m25():
    c = (56, 56)
    R = 42
    c = (56, 52)
    arc1 = [polar(c, 102 + 130 * i / 6, R) for i in range(7)]
    arc2 = [polar(c, 98 - 95 * i / 6, R) for i in range(7)]
    out = [path(curve(arc1)), path(curve(arc2))]
    for i in range(7):
        u = 0.08 + 0.85 * i / 6
        p, a = on(arc1, u)
        L = 11 * (1 - 0.35 * i / 6)
        for sd in (-1, 1):
            out.append(euca_leaf(p, a + sd * 55, L, L * 0.48))
    p, a = on(arc1, 1.0)
    out.append(euca_leaf(p, a, 6.5, 3.2))
    for i in range(8):
        u = 0.08 + 0.85 * i / 7
        p, a = on(arc2, u)
        L = 9 * (1 - 0.3 * i / 7)
        for sd in (-1, 1):
            out.append(daisy_loop(p, a + sd * 40, L, L * 0.28))
    p, a = on(arc2, 1.0)
    out.append(daisy_loop(p, a, 6, 1.8))
    p = polar(c, 100, R)
    out.append(berry_cluster(p, 90, n=3, r=2.0, stem=7))
    return "".join(out)


# ============================================================== LETRAS: MOLDURAS DE MONOGRAMA (26–35)
from lettering import letter_d, text_path, SERIF_BOLD, SERIF_ITALIC, SERIF_REG

LETTER_ST = ("Letra", "ponto haste no contorno; para preencher, ponto cheio")


def letter(ch, c, h=34):
    d, _ = letter_d(ch, c, h)
    return path(d)


@motif(26, "Monograma com ramos (A)", "Letras", 92, 92, "Médio",
       [LETTER_ST, ("Ramos", "ponto haste"), ("Folhas", "ponto margarida ou ponto folha")])
def m26():
    c = (46, 46)
    R = 38
    out = [letter("A", (46, 45))]
    for sd in (-1, 1):
        pts = [polar(c, 90 - sd * (-14 + 150 * i / 7), R) for i in range(8)]
        out.append(path(curve(pts)))
        for i in range(10):
            u = 0.08 + 0.86 * i / 9
            p, a = on(pts, u)
            side = 1 if i % 2 else -1
            out.append(leaf(p, a + side * 40, 9 - 2.5 * u, 2.8 - 0.6 * u))
        p, a = on(pts, 1.0)
        out.append(leaf(p, a, 6.5, 2.1))
    return "".join(out)


@motif(27, "Monograma oval com laço (B)", "Letras", 80, 100, "Fácil",
       [LETTER_ST, ("Oval", "ponto corrente ou haste"), ("Laço", "ponto atrás"), ("Folhinhas", "ponto margarida")])
def m27():
    c = (40, 54)
    out = [letter("B", (40, 55))]
    oval = ellipse_d(c, 40, 30, 90)
    bsvg, occ = ribbon_bow((40, 14), w=12, h=8, tail=10, spread=5.5)
    leaves = ""
    for sd in (-1, 1):
        for k, t in enumerate((-90 + sd * 32, -90 + sd * 50)):
            q = (c[0] + 30 * math.cos(math.radians(t)), c[1] + 40 * math.sin(math.radians(t)))
            tang = math.degrees(math.atan2(40 * math.cos(math.radians(t)), -30 * math.sin(math.radians(t))))
            tang += 0 if sd < 0 else 180
            leaves += leaf(q, tang + 180 + (sd * 35 if k == 0 else -sd * 35), 9, 2.8)
    out.append(behind(path(oval) + leaves, occ) + bsvg)
    return "".join(out)


@motif(28, "Monograma com meia coroa de flores (C)", "Letras", 96, 90, "Médio",
       [LETTER_ST, ("Florzinhas", "ponto atrás e nó francês no miolo"), ("Folhas", "ponto margarida"), ("Ramo", "ponto haste")])
def m28():
    c = (48, 40)
    R = 36
    out = [letter("C", (48, 38))]
    arc = [polar(c, 18 + 144 * i / 10, R) for i in range(11)]
    out.append(path(curve(arc)))
    fl, occ = [], []
    for u, r in ((0.5, 6.5), (0.25, 5.2), (0.75, 5.2), (0.0, 4.2), (1.0, 4.2)):
        p, a = on(arc, u)
        s, _ = lobed(p, r, n=5, ang=a - 90, depth=0.42)
        fl.append(s)
        occ.append(circle_d(p, r * 0.9))
    leaves = ""
    for u, sd in ((0.13, 1), (0.37, -1), (0.63, 1), (0.87, -1)):
        p, a = on(arc, u)
        leaves += daisy_loop(p, a + sd * 50, 7.5, 2.2) + daisy_loop(p, a + 180 - sd * 50, 7.5, 2.2)
    out[-1] = behind(out[-1] + leaves, *occ)
    out += fl
    return "".join(out)


def heart_vine(c, w, h):
    x, y = c
    top = y - h * 0.5
    L = [(x, top + h * 0.2), (x - w * 0.22, top), (x - w * 0.46, top + h * 0.1), (x - w * 0.47, top + h * 0.45), (x - w * 0.22, top + h * 0.76), (x, top + h)]
    R = [(2 * x - px, py) for px, py in L]
    return L, R


@motif(29, "Monograma em coração de folhas (D)", "Letras", 96, 92, "Médio",
       [LETTER_ST, ("Coração", "ponto haste"), ("Folhas", "ponto folha ou margarida")])
def m29():
    out = [letter("D", (48, 46), 32)]
    L, R = heart_vine((48, 47), 76, 76)
    for pts in (L, R):
        out.append(path(curve(pts)))
        for i in range(11):
            u = 0.06 + 0.86 * i / 10
            p, a = on(pts, u)
            side = 1 if i % 2 else -1
            out.append(leaf(p, a + side * 42, 8, 2.6))
    return "".join(out)


@motif(30, "Monograma com margaridas (E)", "Letras", 92, 92, "Fácil",
       [LETTER_ST, ("Aro", "ponto alinhavo ou atrás"), ("Margaridas", "ponto margarida e nó francês")])
def m30():
    c = (46, 46)
    R = 36
    out = [letter("E", (46, 46), 32)]
    heads, occ = [], []
    for k in range(6):
        p = polar(c, -90 + 60 * k, R)
        heads.append(daisy(p, 7, n=8, r0=1.8, hw=1.5, loops=True))
        occ.append(circle_d(p, 7.2))
    ring = f'<circle cx="46" cy="46" r="{R}" stroke-dasharray="2.2 1.6"/>'
    out.append(behind(ring, *occ) + "".join(heads))
    return "".join(out)


@motif(31, "Monograma em losango (F)", "Letras", 90, 96, "Fácil",
       [LETTER_ST, ("Losango", "ponto atrás"), ("Raminhos", "ponto haste e ponto margarida")])
def m31():
    out = [letter("F", (45, 48), 30)]
    c = (45, 48)
    r = 36
    pts = [polar(c, -90 + 90 * k, r) for k in range(4)]
    rr = 4
    chains = []
    for k in range(4):
        a, b = pts[k], pts[(k + 1) % 4]
        chains.append([lerp(a, b, rr / dist(a, b)), lerp(a, b, 1 - rr / dist(a, b))])
        nb = pts[(k + 2) % 4]
        chains.append([lerp(a, b, 1 - rr / dist(a, b)), b, lerp(b, nb, rr / dist(b, nb))][::1])
    d = "M" + P(chains[0][0])
    for ch in chains:
        if len(ch) == 2:
            d += " L" + P(ch[1])
        else:
            d += f" Q{P(ch[1])} {P(ch[2])}"
    d += " Z"
    fl, occ, lv = "", [], ""
    for k in (0, 2):
        p = pts[k]
        s_, _ = lobed(p, 7, n=5, ang=-90 if k == 0 else 90, depth=0.42)
        fl += s_
        occ.append(circle_d(p, 6.6))
        for sd in (-1, 1):
            nb = pts[(k + sd) % 4]
            a = math.degrees(math.atan2(nb[1] - p[1], nb[0] - p[0]))
            q = polar(p, a, 6)
            lv += leaf(q, a + sd * (28 if k == 0 else -28), 10, 3.2)
    out.append(behind(path(d), *occ) + fl + lv)
    return "".join(out)


@motif(32, "Monograma entre raminhos (G)", "Letras", 90, 86, "Fácil",
       [LETTER_ST, ("Raminhos", "ponto haste"), ("Folhas", "ponto folha")])
def m32():
    out = [letter("G", (45, 43), 34)]
    for sd in (-1, 1):
        x0 = 45 + sd * 33
        pts = [(45 + sd * 14, 80), (x0, 64), (x0 + sd * 3, 43), (x0, 22), (45 + sd * 16, 6)]
        out.append(path(curve(pts)))
        for i in range(8):
            u = 0.1 + 0.8 * i / 7
            p, a = on(pts, u)
            side = 1 if i % 2 else -1
            out.append(leaf(p, a + side * 42, 9.5 - 2 * abs(u - 0.5), 3))
        p, a = on(pts, 1.0)
        out.append(leaf(p, a, 6.5, 2.2))
    return "".join(out)


@motif(33, "Monograma com cantos floridos (H)", "Letras", 88, 88, "Médio",
       [LETTER_ST, ("Moldura", "ponto atrás"), ("Flores dos cantos", "ponto atrás e nó francês"), ("Folhas", "ponto margarida")])
def m33():
    out = [letter("H", (44, 44), 30)]
    x0, y0, x1, y1 = 10, 10, 78, 78
    frame_d = f"M{x0 + 6},{y0} H{x1 - 6} Q{x1},{y0} {x1},{y0 + 6} V{y1 - 6} Q{x1},{y1} {x1 - 6},{y1} H{x0 + 6} Q{x0},{y1} {x0},{y1 - 6} V{y0 + 6} Q{x0},{y0} {x0 + 6},{y0} Z"
    fl, occ, lv = [], [], ""
    for (cx, cy), a in (((x0 + 2, y0 + 2), 45), ((x1 - 2, y0 + 2), 135), ((x1 - 2, y1 - 2), 225), ((x0 + 2, y1 - 2), 315)):
        s, _ = lobed((cx, cy), 7.5, n=5, ang=a - 90 + 18, depth=0.42)
        fl.append(s)
        occ.append(circle_d((cx, cy), 7.2))
        for d in (-1, 1):
            q = polar((cx, cy), a + 180 + d * 48 - 180 + 180, 7.2)
        ang_in = a
        for d in (-1, 1):
            sa = ang_in + 90 * d
            base = polar((cx, cy), sa, 5.5)
            lv += daisy_loop(base, sa - d * 10, 8, 2.3)
    out.append(behind(path(frame_d) + lv, *occ) + "".join(fl))
    return "".join(out)


@motif(34, "Monograma com lavandas (M)", "Letras", 96, 92, "Médio",
       [LETTER_ST, ("Lavandas", "ponto margarida"), ("Hastes", "ponto haste"), ("Laço", "ponto atrás")])
def m34():
    out = [letter("M", (48, 40), 30)]
    stems = []
    for sd in (-1, 1):
        st = [(48 + sd * 3, 84), (48 + sd * 26, 76), (48 + sd * 38, 54), (48 + sd * 40, 26), (48 + sd * 32, 6)]
        stems.append(st)
    lines = "".join(path(curve(s)) for s in stems)
    heads = "".join(lavender(s, u0=0.45, n=10, size=4.2) for s in stems)
    bsvg, occ = ribbon_bow((48, 82), w=11, h=7.5, tail=8, spread=5)
    out.append(behind(lines, occ) + heads + bsvg)
    return "".join(out)


@motif(35, "Monograma em renda (R)", "Letras", 90, 90, "Fácil",
       [LETTER_ST, ("Bordinha de renda", "ponto haste"), ("Bolinhas", "nós franceses")])
def m35():
    c = (45, 45)
    out = [letter("R", (46, 45), 32)]
    n = 22
    R = 36
    chains = []
    for i in range(n):
        a0 = 360 * i / n
        a1 = 360 * (i + 1) / n
        p0 = polar(c, a0, R)
        p1 = polar(c, a1, R)
        mid = polar(c, (a0 + a1) / 2, R + 4.2)
        chains.append([p0, polar(c, a0 + 2.2, R + 3.2), mid, polar(c, a1 - 2.2, R + 3.2), p1])
    out.append(path(chain(chains, closed=True)))
    out.append(circle(c, R - 3))
    for i in range(n):
        out.append(circle(polar(c, 360 * (i + 0.5) / n, R + 0.9), 0.75))
    return "".join(out)


# ============================================================== BICHINHOS (36–45)

def closed(*chains_):
    return chain(list(chains_), closed=True)


@motif(36, "Gatinho", "Bichinhos", 76, 88, "Fácil",
       [("Contorno", "ponto haste"), ("Olhos, boca e bigodes", "ponto atrás"), ("Nariz", "ponto cheio"), ("Rabo", "ponto haste")])
def m36():
    head = closed([(38, 42), (26, 39.5), (19.5, 31), (19.6, 19), (19, 6)],
                  [(19, 6), (24, 9.5), (29.5, 14)],
                  [(29.5, 14), (38, 12.4), (46.5, 14)],
                  [(46.5, 14), (52, 9.5), (57, 6)],
                  [(57, 6), (56.4, 19), (56.5, 31), (50, 39.5), (38, 42)])
    body_pts = [(27, 39.8), (21, 52), (18, 66), (20, 78), (27, 83), (38, 84), (49, 83), (56, 78), (58, 66), (55, 52), (49, 39.8)]
    body = curve(body_pts)
    body_closed = body + " Z"
    tail = tapered([(52, 80), (62, 78), (68.5, 68), (67, 57), (61.5, 52)], 5.2, 3.8)
    out = [behind(path(tail), body_closed, head)]
    out.append(behind(path(body), head))
    out.append(path(head))
    out.append(path(curve([(22.5, 17), (22, 11), (27, 14.5)])))
    out.append(path(curve([(53.5, 17), (54, 11), (49, 14.5)])))
    out.append(path(curve([(27, 27), (30, 29.6), (33, 27)])))
    out.append(path(curve([(43, 27), (46, 29.6), (49, 27)])))
    out.append(path(closed([(36.2, 31.4), (39.8, 31.4)], [(39.8, 31.4), (38.9, 32.7), (38, 33.4)], [(38, 33.4), (37.1, 32.7), (36.2, 31.4)])))
    out.append(path(line((38, 33.4), (38, 34.6))))
    out.append(path(curve([(38, 34.6), (36.2, 36.2), (34.2, 35.2)])))
    out.append(path(curve([(38, 34.6), (39.8, 36.2), (41.8, 35.2)])))
    for y0, y1 in ((32.5, 30.5), (35.2, 36.4)):
        out.append(path(curve([(19.4, y0), (14.5, (y0 + y1) / 2 - 0.3), (9.5, y1)])))
        out.append(path(curve([(56.6, y0), (61.5, (y0 + y1) / 2 - 0.3), (66.5, y1)])))
    out.append(path(curve([(31, 60), (30.6, 72), (30.4, 83.2)])))
    out.append(path(curve([(38, 64), (38, 74), (38, 84)])))
    out.append(path(curve([(45, 60), (45.4, 72), (45.6, 83.2)])))
    for x in (32.7, 35.4, 40.6, 43.3):
        out.append(path(line((x, 84), (x, 81.6))))
    return "".join(out)


@motif(37, "Passarinho no galho", "Bichinhos", 88, 72, "Fácil",
       [("Corpo", "ponto haste"), ("Asa e cauda", "ponto atrás ou ponto cheio"), ("Olho", "nó francês"), ("Galho e pés", "ponto haste")])
def m37():
    body = closed([(20.5, 24), (25, 16.5), (35, 14.5), (46, 19), (55, 27), (64, 34)],
                  [(64, 34), (63, 39), (62, 42)],
                  [(62, 42), (50, 49.5), (36, 49), (25, 42), (20, 29)])
    beak = closed([(20.5, 24), (11, 26.8)], [(11, 26.8), (20, 29)])
    wing = closed([(33, 30), (42, 26.5), (53, 30), (61, 37)], [(61, 37), (50, 41.5), (38, 39.5), (33, 30)])
    feathers = curve([(45, 33), (51, 35.5), (56.5, 38)]) + " " + curve([(41, 36), (48, 38.6), (54, 39.6)])
    tail = [leaf_d((61, 37), -22, 22, 3.8), leaf_d((61, 39.5), -6, 20, 3.6)]
    out = []
    branch = [(4, 62), (30, 58), (56, 57), (84, 52)]
    out.append(path(curve(branch)))
    out.append(leaf((70, 55), -60, 11, 3.4))
    out.append(leaf((76, 53.5), 30, 10, 3.2))
    for x in (40, 47):
        top = (x, 49.2 if x == 40 else 48.4)
        foot = (x - 0.6, 57.6)
        out.append(path(line(top, foot)))
        out.append(path(curve([(x - 3.4, 56.8), (x - 1.6, 57.8), foot])) + path(curve([foot, (x + 1.4, 57.7), (x + 2.8, 56.4)])))
    out.append(behind("".join(path(t) for t in tail), body))
    out.append(path(body) + path(beak) + path(wing) + path(feathers))
    out.append(circle((27, 23.5), 1.6))
    return "".join(out)


@motif(38, "Abelhinha", "Bichinhos", 86, 70, "Fácil",
       [("Corpo e cabeça", "ponto haste"), ("Listras", "ponto cheio ou haste"), ("Asas", "ponto atrás"), ("Voo", "ponto alinhavo")])
def m38():
    head = circle_d((24, 40), 9)
    body = blob([(28, 31), (40, 28.5), (54, 31), (62, 38), (63, 42), (55, 50), (40, 52), (28, 49)])
    stinger = closed([(62.6, 37.8), (68.5, 40.2)], [(68.5, 40.2), (62.6, 42.6)])
    wings = path(ellipse_d((41, 21), 10.5, 6.2, -62)) + path(ellipse_d((52, 22.5), 9.5, 5.6, -112))
    out = [behind(wings, body, head)]
    stripes = path(curve([(39, 29.2), (36.4, 40.5), (39, 51.8)])) + path(curve([(48, 29.6), (45.8, 40.5), (48, 51.5)])) + path(curve([(56, 33), (54.6, 40.5), (56.6, 48.6)]))
    out.append(behind(path(body) + stripes + path(stinger), head))
    out.append(path(head))
    out.append(circle((21, 38.5), 1.3) + circle((27.5, 38.5), 1.3))
    out.append(path(curve([(21.5, 43.5), (24.2, 45.6), (27, 43.5)])))
    for x0, x1 in ((20, 14), (27, 31)):
        e = (x1, 22)
        out.append(path(curve([(x0, 31.4), ((x0 + x1) / 2, 26), e])) + circle((x1 + (-1 if x1 < 20 else 1) * 0.3, 20.6), 1.5))
    trail = curve([(70, 44), (76, 52), (82, 47), (77, 40), (72, 48), (74, 58), (80, 64)])
    out.append(dashed(trail, 1.8, 1.6))
    return "".join(out)


@motif(39, "Borboleta", "Bichinhos", 92, 80, "Médio",
       [("Asas", "ponto haste"), ("Detalhes das asas", "ponto atrás e nós franceses"), ("Corpo", "ponto cheio"), ("Antenas", "ponto atrás")])
def m39():
    cx = 46
    def mx(pts):
        return [(2 * cx - x, y) for x, y in pts]
    up = [(44, 31), (36, 17), (22, 8.5), (10, 11), (7, 24), (14, 36), (30, 41), (44, 40)]
    lo = [(44, 43), (30, 46), (17, 55), (15, 68), (24, 74), (36, 68), (44, 54)]
    upi = [(42, 33), (33, 22), (22, 15.5), (14, 17.5), (13, 25), (18, 32), (31, 36.5), (42, 37.5)]
    out = []
    for f in (lambda p: p, mx):
        out.append(path(curve(f(up))))
        out.append(path(curve(f(lo))))
        out.append(path(curve(f(upi))))
        out.append(path(curve(f([(43, 47), (31, 52), (23, 61), (25, 67), (34, 63), (42, 52)]))))
        c1 = f([(22, 25)])[0]
        out.append(circle(c1, 3.6))
        out.append(circle(f([(30, 30)])[0], 1.6))
        out.append(circle(f([(31, 58)])[0], 1.8))
    out.append(path(blob([(cx, 23.5), (cx + 2.3, 28), (cx + 2.2, 45), (cx + 1.4, 60), (cx, 63), (cx - 1.4, 60), (cx - 2.2, 45), (cx - 2.3, 28)])))
    out.append(circle((cx, 20.6), 3))
    for s in (-1, 1):
        a = [(cx + s * 1.2, 18), (cx + s * 4, 10), (cx + s * 9, 4)]
        out.append(path(curve(a)) + circle((cx + s * 10.2, 3.2), 1.4))
    return "".join(out)


@motif(40, "Coelhinho", "Bichinhos", 80, 92, "Médio",
       [("Contorno", "ponto haste"), ("Orelhas por dentro", "ponto atrás"), ("Olho e nariz", "ponto cheio"), ("Rabinho", "nós franceses ou ponto atrás")])
def m40():
    head = blob([(17.5, 39.5), (19.5, 32), (25.5, 27.5), (33.5, 27), (40, 30), (42.5, 37), (39, 45), (31, 48), (22.5, 46)])
    ear1 = blob([(27.5, 29), (27, 18), (29.5, 8), (33.5, 3.5), (37, 6), (37.4, 16), (35.5, 27.5)])
    ear2 = blob([(35.5, 28.5), (39, 19), (45, 10.5), (50.5, 7.5), (52.5, 11), (48, 20), (42, 31)])
    body = blob([(40, 40), (52, 44.5), (62, 54), (66, 67), (63, 78), (55, 85), (40, 86.5), (29, 85.5), (25.5, 78), (25.4, 66), (26, 55), (29, 46.5)])
    tail_c = (65.5, 76)
    tail = closed(*[[polar(tail_c, a, 5.2), polar(tail_c, a + 22.5, 6.6), polar(tail_c, a + 45, 5.2)] for a in range(0, 360, 45)])
    paw = blob([(23, 84), (26, 81.2), (31, 81.4), (32.5, 84), (29, 86.4), (24.5, 86.2)])
    foot = blob([(41, 85.5), (46, 82), (58, 82.4), (63, 85), (58, 87.6), (45, 87.8)])
    out = [behind(path(tail), body)]
    out.append(behind(path(ear2), ear1, head))
    out.append(behind(path(ear1), head))
    out.append(behind(path(body) + path(curve([(61, 58), (52, 62), (47, 72), (50, 81)])), head, paw, foot))
    out.append(path(head) + path(paw) + path(foot))
    out.append(path(curve([(30.5, 26.5), (30.6, 15), (33.4, 7.5)])))
    out.append(path(curve([(39.5, 27), (43, 18), (49, 11)])))
    out.append(ellipse((26.5, 35), 1.4, 1.8))
    out.append(path(closed([(17.6, 37.4), (20, 37)], [(20, 37), (19.4, 38.8), (18.4, 39.4)], [(18.4, 39.4), (17.6, 37.4)])))
    out.append(path(curve([(19, 39.4), (19.6, 42), (22, 42.6)])))
    for y in (38, 40.5):
        out.append(path(line((15.8, y), (9, y - 1 + (y - 38) * 0.8))))
    return "".join(out)


@motif(41, "Raposinha", "Bichinhos", 80, 92, "Médio",
       [("Contorno", "ponto haste"), ("Máscara e peito", "ponto atrás"), ("Olhos e nariz", "ponto cheio"), ("Rabo", "ponto haste")])
def m41():
    head = closed([(40, 50), (30, 46.5), (12, 38)],
                  [(12, 38), (15, 31), (17.5, 22)],
                  [(17.5, 22), (17, 13), (18, 4)],
                  [(18, 4), (24, 9), (29, 14)],
                  [(29, 14), (40, 12.5), (51, 14)],
                  [(51, 14), (56, 9), (62, 4)],
                  [(62, 4), (63, 13), (62.5, 22)],
                  [(62.5, 22), (65, 31), (68, 38)],
                  [(68, 38), (50, 46.5), (40, 50)])
    body = curve([(28, 46), (22, 60), (19.5, 74), (23, 85), (40, 87), (57, 85), (60.5, 74), (58, 60), (52, 46)])
    tc = [(54, 84), (65, 83), (71.5, 74), (72.5, 62), (68, 52)]
    tail = tapered(tc, 10, 8)
    out = [behind(path(tail), body + " Z", head)]
    tp, ta = on(tc, 0.84)
    out.append(behind(path(curve([polar(tp, ta - 90, 4.1), polar(tp, ta - 10, 1.6), polar(tp, ta + 90, 4.1)])), body + " Z"))
    out.append(behind(path(body), head))
    out.append(path(head))
    out.append(path(curve([(21, 18), (21, 10), (26.5, 13.5)])) + path(curve([(59, 18), (59, 10), (53.5, 13.5)])))
    out.append(path(curve([(14.5, 37), (24, 35.6), (32, 37.5), (38, 44.6)])))
    out.append(path(curve([(65.5, 37), (56, 35.6), (48, 37.5), (42, 44.6)])))
    out.append(ellipse((30, 29), 1.5, 2.1) + ellipse((50, 29), 1.5, 2.1))
    out.append(path(closed([(37.6, 44.4), (42.4, 44.4)], [(42.4, 44.4), (41.2, 46.4), (40, 47)], [(40, 47), (38.8, 46.4), (37.6, 44.4)])))
    out.append(path(curve([(31, 49.5), (35, 58), (40, 63), (45, 58), (49, 49.5)])))
    out.append(path(curve([(33, 66), (32.6, 76), (32.4, 86.2)])) + path(curve([(47, 66), (47.4, 76), (47.6, 86.2)])))
    for x in (35.5, 44.5):
        out.append(path(line((x, 86.6), (x, 84.4))))
    return "".join(out)


@motif(42, "Joaninha", "Bichinhos", 72, 82, "Fácil",
       [("Carapaça", "ponto haste"), ("Pintas", "ponto cheio"), ("Cabeça", "ponto cheio ou haste"), ("Patinhas e antenas", "ponto atrás")])
def m42():
    shell = blob([(36, 21), (50, 25), (58, 38), (58, 54), (50, 67), (36, 72), (22, 67), (14, 54), (14, 38), (22, 25)])
    head = ellipse_d((36, 21), 11, 8.5)
    legs = ""
    for s in (-1, 1):
        for y, dy in ((36, -4), (48, 0), (60, 4)):
            x0 = 36 + s * 18
            legs += path(curve([(x0, y), (36 + s * 26, y + dy * 0.3), (36 + s * 29, y + dy + 2)]))
    ant = path(curve([(32, 15), (28, 8), (24, 5)])) + circle((22.8, 4.2), 1.4) + path(curve([(40, 15), (44, 8), (48, 5)])) + circle((49.2, 4.2), 1.4)
    out = [behind(legs + ant, shell, head), behind(path(head), shell), path(shell)]
    out.append(circle((31.5, 17.2), 1.6) + circle((40.5, 17.2), 1.6))
    out.append(path(line((36, 21.2), (36, 71.8))))
    for c, r in (((26, 34), 3.6), ((46, 34), 3.6), ((23, 49), 3.2), ((49, 49), 3.2), ((29, 61), 3), ((43, 61), 3)):
        out.append(circle(c, r))
    out.append(path(curve([(25, 26.5), (30, 23.4), (34, 23)])))
    return "".join(out)


@motif(43, "Peixinho", "Bichinhos", 92, 64, "Fácil",
       [("Corpo e barbatanas", "ponto haste"), ("Escamas", "ponto atrás"), ("Olho", "ponto cheio"), ("Bolhas", "ponto atrás")])
def m43():
    body = closed([(12, 33), (18, 22), (32, 14.5), (50, 16), (63, 25), (70, 30)],
                  [(70, 30), (63, 38), (50, 47), (32, 49.5), (18, 44), (12, 33)])
    tailf = closed([(66, 29.5), (76, 21), (86, 14)], [(86, 14), (82, 24), (80, 32)], [(80, 32), (82, 40), (86, 50)], [(86, 50), (76, 43), (66, 34.5)])
    dorsal = closed([(33, 15), (38, 7), (47, 5.5), (55, 10), (58, 20)], [(58, 20), (46, 15.4), (33, 15)])
    pelv = closed([(40, 48.8), (45, 55.5), (52, 57), (53, 46)], [(53, 46), (46, 48.2), (40, 48.8)])
    fin = closed([(36, 34), (44, 30), (51, 32), (52, 35)], [(52, 35), (44, 38.5), (36, 34)])
    out = [behind(path(tailf) + path(dorsal) + path(pelv), body)]
    out.append(path(body))
    out.append(behind(path(curve([(41, 13.5), (43, 9)])) + path(curve([(48, 14.2), (50, 9)])) + path(curve([(74, 27), (82, 20)])) + path(curve([(74, 37), (82, 44)])), body))
    out.append(path(curve([(29.5, 20.5), (26.5, 32), (29.5, 44)])))
    scales = ""
    for col, x in enumerate((36, 43, 50, 57)):
        ys = (24, 31, 38) if col % 2 == 0 else (20.5, 27.5, 34.5, 41.5)
        for y in ys:
            scales += path(curve([(x, y - 2.8), (x + 1.9, y - 1.7), (x + 2.5, y), (x + 1.9, y + 1.7), (x, y + 2.8)]))
    out.append(behind(scales, fin, "M0,0 H200 V200 H0 Z " + body))
    out.append(path(fin) + path(curve([(39, 34), (45, 33), (50, 34)])))
    out.append(circle((20.5, 29), 3) + circle((21.2, 29.4), 1.1))
    out.append(path(curve([(12.6, 35.5), (15, 36.6), (17, 35.2)])))
    out.append(circle((7, 23), 2.2) + circle((9.5, 14.5), 1.6) + circle((5, 7.5), 1.2))
    return "".join(out)


@motif(44, "Ursinho", "Bichinhos", 80, 90, "Médio",
       [("Contorno", "ponto haste"), ("Focinho e barriga", "ponto atrás"), ("Olhos e nariz", "ponto cheio"), ("Patinhas", "ponto atrás")])
def m44():
    head = ellipse_d((40, 28), 18, 16)
    ears = path(circle_d((25, 14.5), 7.2)) + path(circle_d((55, 14.5), 7.2))
    inner_ears = path(circle_d((25.6, 15.2), 3.8)) + path(circle_d((54.4, 15.2), 3.8))
    body = blob([(27, 40), (21.5, 55), (23, 70), (40, 78), (57, 70), (58.5, 55), (53, 40)])
    arm_l = tapered([(27, 46), (20, 54), (15.5, 61)], 9.5, 8.5)
    arm_r = tapered([(53, 46), (60, 54), (64.5, 61)], 9.5, 8.5)
    foot_l = ellipse_d((27, 79), 10, 8.5, -10)
    foot_r = ellipse_d((53, 79), 10, 8.5, 10)
    out = [behind(ears + inner_ears, head)]
    out.append(behind(path(body) + path(ellipse_d((40, 61), 9.5, 10.5)), head, arm_l, arm_r, foot_l, foot_r))
    out.append(behind(path(arm_l) + path(arm_r), head))
    out.append(path(head) + path(foot_l) + path(foot_r))
    out.append(path(ellipse_d((27.4, 80), 5, 4.2, -10)) + path(ellipse_d((52.6, 80), 5, 4.2, 10)))
    for c, a in (((27, 79), -10), ((53, 79), 10)):
        for d in (-48, -18, 12):
            q = polar(c, -90 + d + a * 0.0 + (0 if c[0] < 40 else 6), 6.6)
            out.append(circle(q, 1.1))
    out.append(path(ellipse_d((40, 35), 8.2, 6.2)))
    out.append(path(ellipse_d((40, 32.2), 2.8, 1.9)))
    out.append(path(line((40, 34.1), (40, 36.4))) + path(curve([(40, 36.4), (38, 38), (36, 37.2)])) + path(curve([(40, 36.4), (42, 38), (44, 37.2)])))
    out.append(circle((32.5, 25), 1.7) + circle((47.5, 25), 1.7))
    return "".join(out)


@motif(45, "Caracol", "Bichinhos", 92, 66, "Fácil",
       [("Concha", "ponto haste ou corrente na espiral"), ("Corpo", "ponto haste"), ("Antenas", "ponto atrás e nó francês"), ("Folhinha", "ponto folha")])
def m45():
    c = (50, 32)
    shell = circle_d(c, 21)
    spiral = []
    for i in range(60):
        th = i / 59 * 2.6 * 2 * math.pi
        r = 1.5 + 17.5 * i / 59
        spiral.append((c[0] + r * math.cos(th + 2.4), c[1] + r * math.sin(th + 2.4)))
    body = chain([[(64, 46), (71, 50), (76, 53)], [(76, 53), (80, 56.5), (78, 58.6)], [(78, 58.6), (50, 59), (22, 58.4), (12.5, 54.5), (11, 46), (12, 36), (15, 30.5), (20.5, 30), (23.5, 35), (25, 44), (31, 50)]])
    out = [behind(path(body), shell)]
    out.append(path(shell) + path(curve(spiral)))
    out.append(path(curve([(14.5, 31), (11, 22), (8, 14)])) + circle((7.4, 12.6), 1.5))
    out.append(path(curve([(19, 30.4), (20, 21), (21.5, 13)])) + circle((21.8, 11.6), 1.5))
    out.append(circle((16.5, 38), 1.3))
    out.append(path(curve([(13, 44), (15.5, 46), (18.5, 44.6)])))
    out.append(path(curve([(2, 61), (40, 61.6), (88, 61)])))
    out.append(leaf((84, 61), -120, 14, 4.4))
    return "".join(out)


# ============================================================== FRASES EM MOLDURAS (46–50)

TEXT_ST = ("Letras", "ponto haste ou ponto atrás curtinho no contorno")


def words(text, c, size, font=SERIF_ITALIC, tracking=0.0, maxw=None):
    d, w = text_path(text, font=font, size=size, x=c[0], y=c[1], align="center", tracking=tracking)
    if maxw and w > maxw:
        d, w = text_path(text, font=font, size=size * maxw / w, x=c[0], y=c[1], align="center", tracking=tracking)
    return path(d), w


@motif(46, "Lar doce lar", "Frases", 128, 112, "Médio",
       [TEXT_ST, ("Casinha", "ponto haste"), ("Coração e florzinhas", "ponto atrás e nó francês"), ("Raminhos", "ponto margarida")], layout="full")
def m46():
    out = []
    peak = (64, 6)
    house = closed([(14, 50), peak], [peak, (114, 50)])
    out.append(path(house))
    out.append(path(chain([[(22, 50), (22, 104)], [(22, 104), (106, 104)], [(106, 104), (106, 50)]])))
    out.append(path(chain([[(88, 27.1), (88, 14)], [(88, 14), (97, 14)], [(97, 14), (97, 35)]])))
    t, _ = words("Lar doce lar", (64, 79), 21, maxw=76)
    out.append(t)
    out.append(path(heart((64, 34), 13, 12)))
    for sd in (-1, 1):
        st = [(64 + sd * 6, 95), (64 + sd * 18, 92), (64 + sd * 30, 95)]
        out.append(path(curve(st)))
        for u in (0.3, 0.6, 0.9):
            p, a = on(st, u)
            out.append(daisy_loop(p, a - sd * 0 + (-40 if sd > 0 else 40) + (180 if sd < 0 else 0), 6, 1.8))
        fs, _ = lobed((64 + sd * 34.5, 94.5), 4.6, n=5, ang=-90, depth=0.42)
        out.append(fs)
    fs, _ = lobed((64, 95), 3.8, n=5, ang=-90, depth=0.42)
    out.append(fs)
    return "".join(out)


@motif(47, "Gratidão", "Frases", 120, 120, "Médio",
       [TEXT_ST, ("Guirlanda", "ponto haste"), ("Folhas", "ponto folha"), ("Florzinhas", "ponto margarida e nó francês")], layout="full")
def m47():
    c = (60, 60)
    R = 50
    out = []
    t, _ = words("Gratidão", (60, 68), 25, maxw=74)
    out.append(t)
    for sd in (-1, 1):
        pts = [polar(c, 90 - sd * (10 + 150 * i / 8), R) for i in range(9)]
        out.append(path(curve(pts)))
        for i in range(12):
            u = 0.05 + 0.9 * i / 11
            p, a = on(pts, u)
            side = 1 if i % 2 else -1
            out.append(leaf(p, a + side * 40, 10.5 - 3 * u, 3.2 - 0.7 * u))
        p, a = on(pts, 1.0)
        out.append(leaf(p, a, 7, 2.2))
    fl, occ = "", []
    for ang in (90, 30, 150):
        q = polar(c, ang, R)
        fl += daisy(q, 6.5, n=8, r0=1.8, hw=1.4, loops=True)
        occ.append(circle_d(q, 6.6))
    return behind("".join(out[1:]), *occ) + out[0] + fl


def needle(a, b, w=2.2):
    """Agulha de bordado de a (ponta) até b (cabeça), com buraco."""
    ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    L = dist(a, b)
    T = frame(a, ang)
    hw = w / 2
    body = closed([T((0, 0)), T((L * 0.3, -hw)), T((L - hw, -hw))], [T((L - hw, -hw)), T((L + hw * 0.4, 0)), T((L - hw, hw))], [T((L - hw, hw)), T((L * 0.3, hw)), T((0, 0))])
    eye = ellipse_d(T((L - 3.6, 0)), 2.2, 0.45, ang)
    return path(body) + path(eye), T((L - 3.6, 0))


@motif(48, "Feito à mão", "Frases", 128, 100, "Médio",
       [TEXT_ST, ("Moldura", "ponto atrás"), ("Agulha", "ponto atrás"), ("Linha", "ponto haste ou alinhavo")], layout="full")
def m48():
    out = []
    x0, y0, x1, y1 = 8, 8, 120, 92
    r = 9
    fr = (f"M{x0 + r},{y0} H{x1 - r} A{r},{r} 0 0 0 {x1},{y0 + r} V{y1 - r} A{r},{r} 0 0 0 {x1 - r},{y1} "
          f"H{x0 + r} A{r},{r} 0 0 0 {x0},{y1 - r} V{y0 + r} A{r},{r} 0 0 0 {x0 + r},{y0} Z")
    out.append(path(fr))
    t, _ = words("Feito à mão", (64, 54), 22, maxw=92)
    out.append(t)
    nsvg, eye = needle((86, 78), (108, 64))
    thread = curve([eye, (112, 60), (108, 70), (90, 80), (66, 76), (44, 80), (26, 74)])
    nocc = needle((86, 78), (108, 64))[0]
    out.append(nsvg)
    import re
    body_d = re.search(r'd="([^"]+)"', nsvg).group(1)
    out.append(behind(dashed(thread, 2.0, 1.6), body_d))
    for (cx, cy) in ((x0 + 2.6, y0 + 2.8), (x1 - 2.6, y0 + 2.8), (x0 + 2.6, y1 - 2.4), (x1 - 2.6, y1 - 2.4)):
        out.append(path(heart((cx, cy), 4.4, 4.0)))
    return "".join(out)


@motif(49, "Bom dia", "Frases", 120, 96, "Fácil",
       [TEXT_ST, ("Sol", "ponto haste"), ("Raios", "ponto reto"), ("Nuvens", "ponto atrás")], layout="full")
def m49():
    out = []
    c = (60, 52)
    R = 22
    sun = f"M{c[0] - R},{c[1]} A{R},{R} 0 0 1 {c[0] + R},{c[1]}"
    out.append(path(sun + f" L{c[0] - R},{c[1]} Z"))
    for k in range(9):
        a = 180 + 22.5 * k
        out.append(path(line(polar(c, a, R + 4), polar(c, a, R + (12 if k % 2 == 0 else 9)))))
    def cloud(cx, cy, s):
        pts = [(cx - 12 * s, cy + 3 * s), (cx - 13 * s, cy - 1 * s), (cx - 8 * s, cy - 5 * s), (cx - 2 * s, cy - 8 * s), (cx + 5 * s, cy - 6 * s),
               (cx + 9 * s, cy - 2 * s), (cx + 13 * s, cy), (cx + 12 * s, cy + 4 * s)]
        chs = [[pts[i], lerp(pts[i], pts[i + 1], 0.5), pts[i + 1]] for i in range(len(pts) - 1)]
        bumps = []
        for a_, b_ in zip(pts, pts[1:]):
            m = lerp(a_, b_, 0.5)
            dx, dy = b_[0] - a_[0], b_[1] - a_[1]
            m = (m[0] + dy * 0.45, m[1] - dx * 0.45)
            bumps.append([a_, m, b_])
        bumps.append([pts[-1], (cx, cy + 4.6 * s), pts[0]])
        return chain(bumps, closed=True)
    out.append(path(cloud(22, 34, 1.0)) + path(cloud(98, 26, 0.85)))
    out.append(path(line((24, 52), (96, 52))))
    t, _ = words("Bom dia", (60, 82), 24, maxw=80)
    out.append(t)
    return "".join(out)


@motif(50, "Café & bordado", "Frases", 120, 120, "Médio",
       [TEXT_ST, ("Xícara e pires", "ponto haste"), ("Vapor", "ponto atrás"), ("Coração", "ponto cheio")], layout="full")
def m50():
    out = []
    cup = chain([[(36, 38), (84, 38)], [(84, 38), (82, 54), (74, 66), (60, 69), (46, 66), (38, 54), (36, 38)]], closed=True)
    out.append(path(cup))
    out.append(path(ellipse_d((60, 38), 24, 3.4)))
    handle = curve([(83.4, 43), (92, 42), (94, 49), (89, 56), (79, 60)])
    handle_in = curve([(82.6, 47), (88.5, 46.6), (89, 50.5), (85.5, 54.5), (80.6, 56.4)])
    out.append(path(handle) + path(handle_in))
    out.append(path(ellipse_d((60, 70), 32, 4.6)))
    out.append(path(heart((60, 52), 9, 8)))
    for x in (51, 60, 69):
        out.append(path(curve([(x, 33), (x - 3, 27), (x + 1.5, 21), (x - 1.5, 14), (x + 1, 8)])))
    t1, _ = words("Café &", (60, 92), 18)
    t2, _ = words("bordado", (60, 113), 18)
    out.append(t1 + t2)
    return "".join(out)


# ============================================================== ordem final (pares de meia página em sequência)
_ORDER = {7: 8, 8: 7, 17: 18, 18: 17, 19: 21, 21: 19, 22: 20, 20: 24, 23: 22, 24: 23}
for _m in MOTIFS:
    _m["num"] = _ORDER.get(_m["num"], _m["num"])
MOTIFS.sort(key=lambda m: m["num"])
assert [m["num"] for m in MOTIFS] == list(range(1, 51)), [m["num"] for m in MOTIFS]
assert len({m["name"] for m in MOTIFS}) == 50
