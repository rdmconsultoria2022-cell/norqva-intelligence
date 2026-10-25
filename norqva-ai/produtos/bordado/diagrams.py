# -*- coding: utf-8 -*-
"""Diagramas dos pontos, ícones dos materiais e desenhos de transferência (tudo vetorial, em mm)."""
import math
from geo import (add, sub, mul, lerp, dist, polar, frame, curve, blob, chain, line, circle, ellipse, path, P, f,
                 leaf, daisy_loop, lobed, on, behind, circle_d, ellipse_d, heart)

TERRA = "#B4583A"
ROSE = "#D9A08E"
INK = "#2A2420"
GRAY = "#8A7D74"
FAB = "#F3E8DA"
SAGE = "#7E9A7A"


def svg(w, h, inner, cls="dg"):
    return (f'<svg class="{cls}" xmlns="http://www.w3.org/2000/svg" width="{f(w)}mm" height="{f(h)}mm" viewBox="0 0 {f(w)} {f(h)}">'
            f'{inner}</svg>')


def fabric(w, h, r=3):
    return f'<rect x="0.3" y="0.3" width="{f(w - 0.6)}" height="{f(h - 0.6)}" rx="{r}" fill="{FAB}" stroke="none"/>'


def thread(d, color=TERRA, sw=1.25, dash=None):
    da = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"{da}/>'


def back(d):
    """Caminho da linha pelo avesso (tracejado claro)."""
    return thread(d, GRAY, 0.45, "1.1 1.1")


def hole(p, kind, label=None, off=(0, -3.4)):
    """kind 'up' = agulha sai (ponto cheio terracota); 'down' = agulha entra (ponto vazado)."""
    if kind == "up":
        g = f'<circle cx="{f(p[0])}" cy="{f(p[1])}" r="0.95" fill="{TERRA}" stroke="#fff" stroke-width="0.35"/>'
    else:
        g = f'<circle cx="{f(p[0])}" cy="{f(p[1])}" r="0.95" fill="#fff" stroke="{INK}" stroke-width="0.4"/>'
    if label:
        x, y = p[0] + off[0], p[1] + off[1]
        g += (f'<text x="{f(x)}" y="{f(y)}" text-anchor="middle" dominant-baseline="central" font-family="NSans" font-weight="600" '
              f'font-size="2.9" fill="{INK}">{label}</text>')
    return g


def arrow(d, end, ang, color=INK):
    a1 = polar(end, ang + 155, 1.8)
    a2 = polar(end, ang - 155, 1.8)
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="0.35" stroke-dasharray="0.9 0.8"/>'
            f'<path d="M{P(a1)} L{P(end)} L{P(a2)}" fill="none" stroke="{color}" stroke-width="0.35" stroke-linecap="round" stroke-linejoin="round"/>')


def needle_shape(tip, head, w=1.5):
    ang = math.degrees(math.atan2(head[1] - tip[1], head[0] - tip[0]))
    L = dist(tip, head)
    T = frame(tip, ang)
    hw = w / 2
    d = chain([[T((0, 0)), T((L * 0.25, -hw)), T((L - hw, -hw))], [T((L - hw, -hw)), T((L + hw * 0.5, 0)), T((L - hw, hw))],
               [T((L - hw, hw)), T((L * 0.25, hw)), T((0, 0))]], closed=True)
    eye = ellipse_d(T((L - 2.6, 0)), 1.6, 0.3, ang)
    return (f'<path d="{d}" fill="#ECE6DF" stroke="#5E5650" stroke-width="0.35" stroke-linejoin="round"/>'
            f'<path d="{eye}" fill="{FAB}" stroke="#5E5650" stroke-width="0.25"/>')


def caption(x, y, text, size=2.7, anchor="middle", color=GRAY, italic=True):
    st = "italic" if italic else "normal"
    return (f'<text x="{f(x)}" y="{f(y)}" text-anchor="{anchor}" font-family="NSerif" font-style="{st}" font-size="{size}" '
            f'fill="{color}">{text}</text>')


def chain_link(a, b, w=3.4, open_end=False):
    ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    L = dist(a, b)
    T = frame(a, ang)
    if open_end:
        return curve([T((0.2, -0.5)), T((L * 0.45, -w * 0.62)), T((L * 0.95, -w * 0.55)), T((L * 1.18, 0)), T((L * 0.95, w * 0.55)), T((L * 0.45, w * 0.62)), T((0.2, 0.5))])
    return chain([[T((0, 0)), T((L * 0.35, -w * 0.55)), T((L * 0.8, -w * 0.5)), T((L, 0))], [T((L, 0)), T((L * 0.8, w * 0.5)), T((L * 0.35, w * 0.55)), T((0, 0))]])


def daisy_d(base, ang, L, w):
    T = frame(base, ang)
    return chain([[T((0, 0)), T((L * 0.3, -w * 0.62)), T((L * 0.8, -w * 0.55)), T((L, 0))],
                  [T((L, 0)), T((L * 0.8, w * 0.55)), T((L * 0.3, w * 0.62)), T((0, 0))]])


W, H = 84, 70


def hole(p, kind, label=None, off=(0, -3.8)):
    if kind == "up":
        g = f'<circle cx="{f(p[0])}" cy="{f(p[1])}" r="1.15" fill="{TERRA}" stroke="#fff" stroke-width="0.4"/>'
    else:
        g = f'<circle cx="{f(p[0])}" cy="{f(p[1])}" r="1.15" fill="#fff" stroke="{INK}" stroke-width="0.45"/>'
    if label:
        x, y = p[0] + off[0], p[1] + off[1]
        g += (f'<text x="{f(x)}" y="{f(y)}" text-anchor="middle" dominant-baseline="central" font-family="NSans" font-weight="600" '
              f'font-size="3.4" fill="{INK}">{label}</text>')
    return g


def sep(y):
    return f'<path d="M6,{y} H{W - 6}" stroke="#E3D3C1" stroke-width="0.35"/>'


def tag(x, y, t):
    return (f'<text x="{f(x)}" y="{f(y)}" font-family="NSans" font-weight="600" font-size="2.5" letter-spacing="0.4" fill="{TERRA}">{t}</text>')


TH = 1.55


def d_atras():
    y = 22
    xs = [12, 30, 48, 66]
    g = fabric(W, H) + tag(5, 7, "PASSO A PASSO")
    g += back(f"M{xs[1]},{y + 1.2} C{xs[1] + 8},{y + 9} {xs[3] - 8},{y + 9} {xs[3]},{y + 1.2}")
    g += caption(48, y + 10.8, "pelo avesso", 2.6)
    g += thread(line((xs[0], y), (xs[1], y)), ROSE, TH)
    g += thread(line((xs[1], y), (xs[2], y)), TERRA, TH)
    g += arrow(f"M{xs[3] - 1},{y - 2.2} C{xs[3] - 5},{y - 9} {xs[2] + 5},{y - 9} {xs[2] + 1.2},{y - 2.6}", (xs[2] + 1.2, y - 2.6), 240)
    g += hole((xs[0], y), "down", "2", (0, -4))
    g += hole((xs[1], y), "up", "1 · 4", (0, -4))
    g += hole((xs[2], y), "up", "3 · 6", (-3.4, -4.2))
    g += hole((xs[3], y), "up", "5", (0, -4.4))
    g += sep(44) + tag(5, 50, "RESULTADO")
    for i in range(6):
        g += thread(line((10 + 11 * i + 0.5, 60), (10 + 11 * (i + 1) - 0.5, 60)), TERRA, 1.3)
    return svg(W, H, g)


def d_haste():
    y = 24
    g = fabric(W, H) + tag(5, 7, "PASSO A PASSO")
    up = lambda x: (x, y + 1.3)
    dn = lambda x: (x, y - 1.3)
    segs = [(10, 34, ROSE), (22, 46, ROSE), (34, 58, TERRA)]
    for a, b, c in segs:
        g += thread(line(up(a), dn(b)), c, TH)
    g += thread(curve([up(46), (47.5, y + 6), (46, y + 10)]), TERRA, TH)
    g += caption(58, y + 10, "linha embaixo", 2.6, anchor="start")
    for x, n in ((10, "1"), (22, "3"), (34, "5"), (46, "7")):
        g += hole(up(x), "up", n, (0, 4.2))
    for x, n in ((34, "2"), (46, "4"), (58, "6")):
        g += hole(dn(x), "down", n, (0, -4.2))
    g += sep(44) + tag(5, 50, "RESULTADO")
    for i in range(8):
        a = 9 + 7 * i
        g += thread(line((a, 61.2), (a + 15, 58.8)), TERRA, 1.3)
    return svg(W, H, g)


def d_corrente():
    y = 22
    g = fabric(W, H) + tag(5, 7, "PASSO A PASSO")
    g += thread(chain_link((12, y), (32, y), 4.4), ROSE, TH)
    g += thread(chain_link((32, y), (52, y), 4.6, open_end=True), TERRA, TH)
    g += needle_shape((53.6, y + 0.2), (78, y - 9), 1.6)
    g += hole((12, y), "up", "1 · 2", (0, 5))
    g += hole((32, y), "up", "3 · 4", (0, 5))
    g += hole((52, y), "up", "5", (2.4, 5))
    g += caption(62, y + 9.5, "a alça fica sob", 2.6) + caption(62, y + 12.7, "a ponta da agulha", 2.6)
    g += sep(44) + tag(5, 50, "RESULTADO")
    for i in range(4):
        g += thread(chain_link((9 + 15 * i, 60), (24 + 15 * i, 60), 4.4), TERRA, 1.25)
    g += thread(line((69, 60), (71, 60)), TERRA, 1.25)
    return svg(W, H, g)


def d_cheio():
    c = (36, 24)
    rx, ry = 24, 12.5
    g = fabric(W, H) + tag(5, 7, "PASSO A PASSO")
    g += f'<ellipse cx="{c[0]}" cy="{c[1]}" rx="{rx}" ry="{ry}" fill="none" stroke="{GRAY}" stroke-width="0.4" stroke-dasharray="1.1 1"/>'
    step = 2.2
    xs = [c[0] - rx + 3 + step * i for i in range(12)]
    hh = lambda x: ry * math.sqrt(max(0, 1 - ((x - c[0]) / rx) ** 2)) - 0.3
    for i, x in enumerate(xs):
        g += thread(line((x, c[1] + hh(x)), (x, c[1] - hh(x))), ROSE if i < len(xs) - 1 else TERRA, 1.7)
    x1, x2 = xs[-1], xs[-1] + step
    g += hole((x1, c[1] + hh(x1)), "up", "1", (-2, 3.8))
    g += hole((x1, c[1] - hh(x1)), "down", "2", (-2, -3.8))
    g += hole((x2, c[1] + hh(x2)), "up", "3", (2.2, 3.8))
    g += hole((x2, c[1] - hh(x2)), "down", "4", (2.4, -3.8))
    g += arrow(f"M{x2 + 1},{c[1] + hh(x2) - 2} L{x2 + 1},{c[1] - hh(x2) + 2.4}", (x2 + 1, c[1] - hh(x2) + 2.4), -90)
    g += caption(73, 21, "pontos", 2.6) + caption(73, 24.2, "encostados", 2.6)
    g += sep(44) + tag(5, 50, "RESULTADO")
    hc = (42, 58.5)
    hd = heart(hc, 17, 15)
    lines_ = "".join(f'<path d="M{hc[0] + k * 1.15},{hc[1] - 9} V{hc[1] + 9}" stroke="{TERRA}" stroke-width="1.0"/>' for k in range(-8, 9))
    g += f'<defs><clipPath id="hcl"><path d="{hd}"/></clipPath></defs><g clip-path="url(#hcl)">{lines_}</g>'
    g += f'<path d="{hd}" fill="none" stroke="{TERRA}" stroke-width="0.45"/>'
    return svg(W, H, g)


def coil(x, y, vertical=False):
    if vertical:
        return thread(f"M{x - 1.8},{y + 0.9} C{x - 2.2},{y - 1.2} {x + 2.2},{y - 1.2} {x + 1.8},{y + 0.9}", TERRA, 1.3)
    return thread(f"M{x - 0.9},{y + 1.8} C{x - 1.3},{y - 2.4} {x + 1.3},{y - 2.4} {x + 0.9},{y + 1.8}", TERRA, 1.3)


def d_no():
    g = fabric(W, H)
    y = 30
    # a
    g += tag(5, 7, "A · ENROLE")
    g += needle_shape((6, y - 10), (30, y - 10), 1.5)
    g += thread(curve([(12, y), (13, y - 5), (14.2, y - 8.2)]), TERRA, TH)
    g += coil(15, y - 10) + coil(18, y - 10)
    g += thread(curve([(19.2, y - 11.6), (22, y - 15), (26, y - 17.5)]), TERRA, TH)
    g += hole((12, y), "up", "1", (0, 4.2))
    # b
    x0 = 42
    g += tag(36, 7, "B · ENTRE NO 2")
    g += thread(curve([(x0, y), (x0 + 0.6, y - 2.6), (x0 + 1.2, y - 3.6)]), TERRA, TH)
    g += needle_shape((x0 + 3, y + 0.2), (x0 + 4.4, y - 21), 1.5)
    g += coil(x0 + 3.2, y - 4.6, True) + coil(x0 + 3.3, y - 7.4, True)
    g += thread(curve([(x0 + 5, y - 8), (x0 + 9, y - 11), (x0 + 13, y - 11)]), TERRA, TH)
    g += hole((x0, y), "up", "1", (-3, 3.4))
    g += hole((x0 + 3, y + 0.2), "down", "2", (3, 3.6))
    # c
    g += sep(44) + tag(5, 50, "RESULTADO")
    for (dx, dy) in ((0, 0), (6, 2.5), (12, -1), (18, 1.8), (24, -0.6)):
        c = (22 + dx, 59 + dy)
        g += f'<circle cx="{f(c[0])}" cy="{f(c[1])}" r="1.9" fill="{TERRA}"/>'
        g += f'<path d="M{f(c[0] - 1.1)},{f(c[1] - 0.3)} q1.1,-1.1 2.2,0" fill="none" stroke="#fff" stroke-width="0.35" opacity=".7"/>'
    g += caption(64, 60, "nós bem juntinhos", 2.6)
    return svg(W, H, g)


def d_margarida():
    g = fabric(W, H)
    g += tag(5, 7, "A · FAÇA A ALÇA")
    b = (16, 35)
    g += thread(curve([(15.5, 34.6), (10.5, 27), (11.6, 18.5), (16, 14.4), (20.4, 18.5), (21.5, 27), (16.5, 34.6)]), TERRA, TH)
    g += needle_shape((16.2, 14.2), (36, 6.5), 1.5)
    g += hole(b, "up", "1 · 2", (5.2, 0.6))
    g += hole((16, 16), "up", "3", (-4, 0.6))
    g += tag(46, 7, "B · PRENDA A PONTA")
    b2 = (58, 35)
    g += thread(daisy_d(b2, -90, 18, 8.5), TERRA, TH)
    g += thread(line((58, 17.2), (58, 13.6)), TERRA, 1.3)
    g += hole(b2, "up", "1 · 2", (5.2, 0.6))
    g += hole((58, 17.4), "up", "3", (-4, 0.6))
    g += hole((58, 13.4), "down", "4", (4, -0.4))
    g += sep(44) + tag(5, 50, "RESULTADO")
    c = (42, 60)
    for k in range(6):
        a = -90 + 60 * k
        g += thread(daisy_d(polar(c, a, 1.8), a, 7.6, 3.6), TERRA, 1.15)
    g += f'<circle cx="{c[0]}" cy="{c[1]}" r="1.3" fill="{TERRA}"/>'
    return svg(W, H, g)


def d_pena():
    g = fabric(W, H) + tag(5, 7, "PASSO A PASSO")
    w, h = 8, 8.4
    A = (30, 10)
    sp = [A]
    for k in range(1, 4):
        sp.append((A[0] + (w if k % 2 else 0), A[1] + h * k))
    marks = []
    n = 1
    for k in range(3):
        s0, e = sp[k], sp[k + 1]
        o = (s0[0] + 2 * w, s0[1]) if k % 2 == 0 else (s0[0] - 2 * w, s0[1])
        col = ROSE if k < 2 else TERRA
        g += thread(curve([s0, (s0[0] + (e[0] - s0[0]) * 0.75, e[1] - 0.8), e]), col, TH)
        g += thread(curve([e, (o[0] + (e[0] - o[0]) * 0.75, e[1] - 0.8), o]), col, TH)
        marks.append((s0, "up", n))
        marks.append((o, "down", n + 1))
        n += 2
    marks.append((sp[3], "up", n))
    for p, kind, num in marks:
        if p == A or num == 1:
            off = (-4, 0)
        else:
            off = (-4, 0) if p[0] < A[0] + w / 2 else (4, 0)
        if kind == "up" and num > 1:
            off = (0, 4.2)
        g += hole(p, kind, str(num), off)
    g += caption(66, 16, "a linha passa", 2.6) + caption(66, 19.2, "sob a ponta", 2.6) + caption(66, 22.4, "da agulha", 2.6)
    g += sep(44) + tag(5, 50, "RESULTADO")
    T = frame((12, 56), 0)
    w2, h2 = 3.3, 3.6
    q = [(0, 0)]
    for k in range(1, 16):
        q.append((h2 * k, (w2 if k % 2 else 0)))
    for k in range(15):
        s0, e = q[k], q[k + 1]
        o = (s0[0], s0[1] + 2 * w2) if k % 2 == 0 else (s0[0], s0[1] - 2 * w2)
        g += thread(curve([T(s0), T((e[0] - 0.8, s0[1] + (e[1] - s0[1]) * 0.75)), T(e)]), TERRA, 1.2)
        g += thread(curve([T(e), T((e[0] - 0.8, o[1] + (e[1] - o[1]) * 0.75)), T(o)]), TERRA, 1.2)
    g = g.replace('<g clip', '<g clip')
    return svg(W, H, g)


def d_alinhavo():
    y = 22
    g = fabric(W, H) + tag(5, 7, "PASSO A PASSO")
    xs = [(9, 21), (26, 38), (43, 55), (60, 72)]
    for i, (a, b) in enumerate(xs):
        g += thread(line((a, y), (b, y)), ROSE if i < 2 else TERRA, TH)
        if i < 3:
            g += back(f"M{b},{y + 1.2} Q{(b + xs[i + 1][0]) / 2},{y + 6} {xs[i + 1][0]},{y + 1.2}")
    n = 1
    for a, b in xs:
        g += hole((a, y), "up", str(n), (0, -4))
        g += hole((b, y), "down", str(n + 1), (0, -4))
        n += 2
    g += caption(42, y + 11.5, "tracejado fino: o caminho da linha pelo avesso", 2.6)
    g += sep(44) + tag(5, 50, "RESULTADO")
    for i in range(6):
        g += thread(line((9 + 11.4 * i, 60), (17 + 11.4 * i, 60)), TERRA, 1.3)
    return svg(W, H, g)


def d_cruz():
    g = fabric(W, H) + tag(5, 7, "UMA CRUZ")
    s = 14
    x0, y0 = 10, 9
    for i in range(3):
        for j in range(3):
            g += f'<circle cx="{f(x0 + s * i)}" cy="{f(y0 + s * j)}" r="0.55" fill="{GRAY}" opacity=".6"/>'
    a, b, c, d = (x0 + s, y0 + 2 * s), (x0 + 2 * s, y0 + s), (x0 + 2 * s, y0 + 2 * s), (x0 + s, y0 + s)
    g += thread(line(a, b), ROSE, 1.7)
    g += thread(line(c, d), TERRA, 1.7)
    g += hole(a, "up", "1", (-3, 3))
    g += hole(b, "down", "2", (3, -3))
    g += hole(c, "up", "3", (3, 3))
    g += hole(d, "down", "4", (-3, -3))
    g += tag(50, 7, "EM FILEIRA")
    xr, q = 52, 6.5
    for i in range(4):
        g += thread(line((xr + q * i, 20 + q), (xr + q * (i + 1), 20)), TERRA, 1.25)
    g += caption(65, 32, "ida: meias cruzes", 2.6)
    g += sep(44) + tag(5, 50, "VOLTA: FECHE CADA CRUZ")
    for i in range(4):
        g += thread(line((xr + q * i - 30, 54 + q), (xr + q * (i + 1) - 30, 54)), ROSE, 1.25)
        g += thread(line((xr + q * (i + 1) - 30, 54 + q), (xr + q * i - 30, 54)), TERRA, 1.25)
    g += caption(64, 59, "perna de cima", 2.6) + caption(64, 62.2, "sempre igual", 2.6)
    return svg(W, H, g)


def d_folha():
    g = fabric(W, H) + tag(5, 7, "PRIMEIROS PONTOS")
    def leaf_shape(cx, top, L, hw):
        T = frame((cx, top), 90)
        return chain([[T((0, 0)), T((L * 0.3, -hw * 0.95)), T((L * 0.65, -hw)), T((L, 0))],
                      [T((L, 0)), T((L * 0.65, hw)), T((L * 0.3, hw * 0.95)), T((0, 0))]], closed=True)
    cx, top, L, hw = 26, 15, 50, 14
    g += f'<path d="{leaf_shape(cx, top, L, hw)}" fill="none" stroke="{GRAY}" stroke-width="0.4" stroke-dasharray="1.1 1"/>'
    g += f'<path d="M{cx},{top} V{top + L}" stroke="{GRAY}" stroke-width="0.35" stroke-dasharray="0.4 1"/>'
    p1, p2 = (cx, top), (cx, top + 8)
    p3, p4 = (cx - 5.2, top + 6.5), (cx + 1.4, top + 13.5)
    p5, p6 = (cx + 5.2, top + 6.5), (cx - 1.4, top + 17)
    g += thread(line(p1, p2), ROSE, TH)
    g += thread(line(p3, p4), ROSE, TH)
    g += thread(line(p5, p6), TERRA, TH)
    g += hole(p1, "up", "1", (0, -3.6))
    g += hole(p2, "down", "2", (-3.2, 2.0))
    g += hole(p3, "up", "3", (-3.8, -0.4))
    g += hole(p4, "down", "4", (3.8, 0.6))
    g += hole(p5, "up", "5", (3.8, -0.4))
    g += hole(p6, "down", "6", (-3.8, 1.4))

    # resultado
    g += tag(50, 7, "RESULTADO")
    cx2, top2, L2, hw2 = 64, 11, 52, 13
    g += f'<defs><clipPath id="lfc"><path d="{leaf_shape(cx2, top2, L2, hw2)}"/></clipPath></defs>'
    sts = ""
    for k in range(26):
        y = top2 + 2 + 1.9 * k
        for sd in (-1, 1):
            sts += f'<path d="M{cx2 + sd * 16},{y - 4} L{cx2 - sd * 1.2},{y + 2.6}" stroke="{TERRA if sd < 0 else "#C46A4C"}" stroke-width="1.5" stroke-linecap="round"/>'
    g += f'<g clip-path="url(#lfc)">{sts}</g>'
    g += f'<path d="{leaf_shape(cx2, top2, L2, hw2)}" fill="none" stroke="{TERRA}" stroke-width="0.4"/>'
    return svg(W, H, g)


STITCHES = [
    ("Ponto atrás", d_atras,
     "Contornos, caules finos, letras e qualquer linha que precise ficar contínua e firme. É o ponto mais útil para começar.",
     ["Suba a agulha no 1, um ponto à frente do começo da linha.",
      "Volte e desça no 2, bem no começo da linha.",
      "Suba no 3, à mesma distância à frente do 1.",
      "Desça de novo no furo do 1 (agora ele é o 4): cada ponto novo volta e encosta no anterior.",
      "Repita, com pontos do mesmo tamanho (3 a 4 mm). Nas curvas, faça pontos mais curtos."]),
    ("Ponto haste", d_haste,
     "Caules, hastes, contornos curvos e letras cursivas. Forma uma linha torcida, como uma cordinha.",
     ["Suba no 1, no começo da linha, e desça no 2, um ponto à frente.",
      "Suba no 3, no meio do ponto que acabou de fazer, com a linha embaixo da agulha.",
      "Desça no 4, meio ponto depois do 2, e suba no 5, no mesmo furo do 2.",
      "Continue assim: cada ponto novo começa no meio do anterior.",
      "Deixe a linha sempre do mesmo lado (embaixo). Nas curvas, encurte os pontos."]),
    ("Ponto corrente", d_corrente,
     "Linhas mais grossas e decorativas, contornos de vasos e molduras, e fileiras lado a lado para preencher.",
     ["Suba no 1 e desça no 2, no mesmo furo, sem puxar até o fim: deixe uma alcinha.",
      "Suba no 3, um ponto à frente, por dentro da alcinha.",
      "Puxe com calma até a alcinha deitar no tecido: o primeiro elo está pronto.",
      "Desça no 4, no mesmo furo do 3, por dentro do elo; deixe outra alcinha e suba no 5.",
      "No fim, faça um pontinho reto por cima do último elo para prendê-lo."]),
    ("Ponto cheio", d_cheio,
     "Preencher formas pequenas: pétalas, folhinhas, corações, olhos e narizes. Fica liso e brilhante.",
     ["Se quiser bordas mais retinhas, contorne a forma antes com ponto atrás bem pequeno.",
      "Suba no 1, numa borda, e desça no 2, na borda oposta, bem em frente.",
      "Suba no 3, colado ao 1, do mesmo lado; desça no 4, colado ao 2.",
      "Siga com pontos paralelos e encostados, sem deixar o tecido aparecer.",
      "Evite pontos com mais de 1 cm: ficam frouxos. Em formas maiores, use o ponto folha."]),
    ("Nó francês", d_no,
     "Miolos de flores, olhos, bolinhas, frutinhas e texturas de pontinhos.",
     ["Suba a agulha no 1.",
      "Segure a linha esticada com a outra mão e enrole-a 2 vezes na agulha.",
      "Sem soltar a linha, encoste a ponta da agulha no 2, bem ao lado do 1 (não no mesmo furo).",
      "Empurre a agulha para o avesso e puxe devagar, deixando as voltas deslizarem até o tecido.",
      "Para um nó maior, use mais fios da meada em vez de mais voltas."]),
    ("Ponto margarida", d_margarida,
     "Pétalas soltas, folhinhas e botões de lavanda. Cada ponto é uma gotinha presa na ponta.",
     ["Suba no 1, na base da pétala.",
      "Desça no 2, no mesmo furo do 1, deixando uma alcinha.",
      "Suba no 3, na ponta da pétala, por dentro da alcinha.",
      "Puxe até a alça ficar do tamanho da pétala e desça no 4, logo depois da alça, prendendo-a.",
      "Para fazer uma flor, borde as pétalas em volta do miolo, como os ponteiros de um relógio."]),
    ("Ponto pena", d_pena,
     "Ramagens leves, galhinhos, algas e bordas decorativas.",
     ["Suba no 1, no alto da linha a bordar.",
      "Desça no 2, ao lado do 1, na mesma altura.",
      "Suba no 3, mais abaixo, entre o 1 e o 2, com a linha por baixo da ponta da agulha. Puxe: forma um V.",
      "Agora para o outro lado: desça no 4, na altura do 3, e suba no 5, mais abaixo, de novo com a linha sob a agulha.",
      "Alterne um V para cada lado. No fim, prenda o último V com um pontinho."]),
    ("Ponto alinhavo", d_alinhavo,
     "Linhas tracejadas, o voo da abelhinha, bordas simples. É o ponto mais rápido de todos.",
     ["Suba no 1 e desça no 2, fazendo um ponto de 3 a 4 mm.",
      "Deixe um espaço um pouco menor que o ponto e suba no 3.",
      "Desça no 4 e siga assim, no mesmo ritmo.",
      "Em tecido macio, dá para carregar 2 ou 3 pontos na agulha antes de puxar.",
      "Capriche na regularidade: pontos iguais deixam o tracejado bonito."]),
    ("Ponto cruz simples", d_cruz,
     "Bordado em etamine (o tecido de quadradinhos), letras e desenhos montados em quadrados.",
     ["Suba no 1, no canto de baixo à esquerda do quadradinho.",
      "Desça no 2, no canto de cima à direita: meia cruz.",
      "Suba no 3, no canto de baixo à direita.",
      "Desça no 4, no canto de cima à esquerda: a cruz fecha.",
      "Em fileira, faça todas as meias cruzes da ida e feche na volta. A perna de cima fica sempre virada para o mesmo lado."]),
    ("Ponto folha", d_folha,
     "Preencher folhas e pétalas maiores, com uma nervura no meio que dá um efeito bem natural.",
     ["Marque a linha do meio da folha com a caneta.",
      "Suba no 1, na ponta da folha, e desça no 2, sobre a linha do meio, uns 4 mm abaixo.",
      "Suba no 3, na borda esquerda, perto da ponta; desça no 4, um pouquinho depois da linha do meio, logo abaixo do 2.",
      "Suba no 5, na borda direita; desça no 6, um pouquinho antes da linha do meio, abaixo do 4.",
      "Continue alternando os lados, sempre encostando nos pontos anteriores, até a base."]),
]


# ---------------------------------------------------------------- ícones dos materiais (traço terracota)

def icon(inner, w=30, h=30):
    return (f'<svg class="ic" xmlns="http://www.w3.org/2000/svg" width="{w}mm" height="{h}mm" viewBox="0 0 {w} {h}">'
            f'<g fill="none" stroke="{TERRA}" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round">{inner}</g></svg>')


def ic_bastidor():
    c = (15, 16.5)
    g = circle(c, 11.5) + circle(c, 10.2)
    g += f'<path d="M12.6,5.4 L12.6,2.6 L17.4,2.6 L17.4,5.4"/><path d="M11,2.6 H19"/><circle cx="15" cy="1.6" r="0.9"/>'
    g += f'<path d="M8,20 q3,-6 7,-3 q4,3 7,-3" stroke="{ROSE}"/>'
    return icon(g)


def ic_tecido():
    g = '<path d="M5,9 L23,6 L26,22 L8,25 Z"/><path d="M8,25 L6.5,27"/><path d="M5,9 Q3.5,17 6.5,27 L24.5,24.5 L26,22"/>'
    g += f'<path d="M9,11 L22,9" stroke="{ROSE}" stroke-dasharray="1 1"/><path d="M10,14 L23,12" stroke="{ROSE}" stroke-dasharray="1 1"/>'
    return icon(g)


def ic_meada():
    g = '<path d="M4,15 C4,9 26,9 26,15 C26,21 4,21 4,15 Z"/><path d="M6,15 C6,11.5 24,11.5 24,15"/><path d="M6,15 C6,18.5 24,18.5 24,15"/>'
    g += '<rect x="9" y="10.4" width="3.6" height="9.2" rx="0.6"/><rect x="18" y="10.4" width="3.6" height="9.2" rx="0.6"/>'
    g += '<path d="M26,15 C28,16 28,20 25,22"/>'
    return icon(g)


def ic_fios():
    g = '<path d="M15,27 L15,17"/>'
    for i, dx in enumerate((-9, -5.5, -2, 2, 5.5, 9)):
        col = TERRA if i < 3 else ROSE
        g += f'<path d="M15,17 C15,12 {15 + dx * 0.6},8 {15 + dx},3" stroke="{col}"/>'
    return icon(g)


def ic_agulha():
    g = '<path d="M4,26 L23.4,6.6 Q25.8,4.2 26.6,5 Q27.4,5.8 25,8.2 Z"/><path d="M22.4,8.6 L24.6,6.4" stroke-width="0.45"/>'
    g += f'<path d="M25.6,6.2 C29,3 28,12 20,14 C12,16 10,22 14,27" stroke="{ROSE}"/>'
    return icon(g)


def ic_tesoura():
    g = '<circle cx="9" cy="22" r="4"/><circle cx="18" cy="24" r="4"/><path d="M11.5,19 L22,4"/><path d="M15.5,21 L18.6,4.6 L22,4"/>'
    g += '<circle cx="15.4" cy="15.4" r="0.7"/>'
    return icon(g)


def ic_caneta():
    g = '<path d="M7,25 L21,6 L25,9 L11,28 Z"/><path d="M7,25 L5.6,29.4 L11,28"/><path d="M19,8.8 L23,11.6"/><path d="M21,6 L22.6,3.8 L26.6,6.8 L25,9"/>'
    g += f'<path d="M3,29.5 q2,-1 4,0 t4,0" stroke="{ROSE}"/>'
    return icon(g)


def ic_carbono():
    g = '<path d="M5,8 L22,5 L25,22 L8,25 Z"/><path d="M8,11 L24,8.4 L26.6,24 L10.6,27"/>'
    g += f'<path d="M9.5,13 L17,11.7 M10,16.5 L21,14.6 M10.6,20 L19,18.6" stroke="{ROSE}"/>'
    return icon(g)


# ---------------------------------------------------------------- desenhos de transferência

def small_flower(c, r=6):
    s, _ = lobed(c, r, n=5, ang=-90, depth=0.42)
    return s


def t_janela():
    w, h = 74, 52
    g = f'<rect x="2" y="2" width="70" height="48" rx="2" fill="#EAF1F2" stroke="{GRAY}" stroke-width="0.5"/>'
    g += f'<path d="M37,2 V50 M2,26 H72" stroke="{GRAY}" stroke-width="0.5"/>'
    g += f'<circle cx="9" cy="9" r="3" fill="#F6D58A" stroke="#E2B04F" stroke-width="0.4"/>'
    for k in range(8):
        a = 45 * k
        g += f'<path d="M{P(polar((9, 9), a, 4.2))} L{P(polar((9, 9), a, 5.8))}" stroke="#E2B04F" stroke-width="0.45" stroke-linecap="round"/>'
    g += f'<rect x="16" y="9" width="40" height="36" fill="#fff" stroke="{INK}" stroke-width="0.4"/>'
    g += f'<rect x="20" y="12" width="40" height="36" fill="{FAB}" fill-opacity=".82" stroke="{TERRA}" stroke-width="0.5" stroke-dasharray="1.6 0.8"/>'
    g += f'<g fill="none" stroke="{INK}" stroke-width="0.45" opacity=".55">{small_flower((38, 27), 8)}<path d="M38,35 Q37,40 38,44"/></g>'
    for x, y in ((18, 10), (58, 10), (18, 46), (58, 46)):
        g += f'<rect x="{x - 3}" y="{y - 1.3}" width="6" height="2.6" fill="#F6E7B8" stroke="#D8C489" stroke-width="0.25" transform="rotate(-30 {x} {y})"/>'
    g += f'<path d="M56,24 L63,15 L65.5,17 L58.4,26 Z" fill="#fff" stroke="{TERRA}" stroke-width="0.45"/><path d="M56,24 L55.2,27 L58.4,26" fill="none" stroke="{TERRA}" stroke-width="0.45"/>'
    return svg(w, h, g)


def t_carbono():
    w, h = 74, 52
    def sheet(y, fill, stroke, dash=""):
        da = f' stroke-dasharray="{dash}"' if dash else ""
        return f'<path d="M14,{y} L58,{y} L68,{y + 12} L24,{y + 12} Z" fill="{fill}" stroke="{stroke}" stroke-width="0.45"{da}/>'
    g = sheet(36, FAB, TERRA)
    g += f'<text x="70" y="44" font-family="NSans" font-size="2.6" fill="{INK}">tecido</text>'
    g += sheet(22, "#C9D3E4", "#6B7FA6")
    g += f'<text x="70" y="30" font-family="NSans" font-size="2.6" fill="{INK}">carbono</text>'
    g += f'<text x="70" y="33.4" font-family="NSans" font-size="2.2" fill="{GRAY}">tinta para baixo</text>'
    g += sheet(8, "#fff", INK)
    g += f'<text x="70" y="16" font-family="NSans" font-size="2.6" fill="{INK}">risco</text>'
    g += f'<g fill="none" stroke="{INK}" stroke-width="0.4"><ellipse cx="40" cy="14" rx="7" ry="2.6"/><path d="M40,11.4 V16.6"/></g>'
    for y0 in (20, 34):
        g += f'<path d="M30,{y0} V{y0 + 2.4} M50,{y0} V{y0 + 2.4}" stroke="{GRAY}" stroke-width="0.35" stroke-dasharray="0.6 0.6"/>'
    g += f'<path d="M44,13 L52,2 L54.6,3.8 L46.6,14.8 Z" fill="#fff" stroke="{TERRA}" stroke-width="0.45"/>'
    return svg(w + 22, h, g)


def t_termo():
    w, h = 84, 52
    g = f'<rect x="3" y="6" width="50" height="40" rx="2" fill="{FAB}" stroke="none"/>'
    g += f'<g fill="none" stroke="#5C7DB8" stroke-width="0.55">{small_flower((16, 22), 7.5)}<path d="M16,29.5 Q15,35 16,40"/></g>'
    g += f'<g fill="none" stroke="#5C7DB8" stroke-width="0.5" stroke-dasharray="1 1.6" opacity=".45">{small_flower((38, 22), 7.5)}<path d="M38,29.5 Q37,35 38,40"/></g>'
    g += f'<text x="16" y="50" text-anchor="middle" font-family="NSans" font-size="2.6" fill="{INK}">antes</text>'
    g += f'<text x="40" y="50" text-anchor="middle" font-family="NSans" font-size="2.6" fill="{INK}">com calor: some</text>'
    # ferro de passar
    iron = "M46,36 L80,36 Q81,36 80.6,34.6 C79,26 72,22 62,22 L54,22 Q47,22 46,30 Z"
    g += f'<path d="{iron}" fill="#fff" stroke="{INK}" stroke-width="0.55" stroke-linejoin="round"/>'
    g += f'<path d="M47,32.6 L80.2,32.6" stroke="{INK}" stroke-width="0.4"/>'
    g += f'<path d="M57,22 Q56,14 62,14 L74,14 Q78,14 77,18 L75.6,22" fill="none" stroke="{INK}" stroke-width="0.55"/>'
    g += f'<circle cx="64" cy="27" r="1.4" fill="none" stroke="{TERRA}" stroke-width="0.45"/>'
    for x in (52, 58, 64, 70, 76):
        g += f'<path d="M{x},39 q-1.2,1.8 0,3.6 t0,3.6" fill="none" stroke="{TERRA}" stroke-width="0.5" stroke-linecap="round"/>'
    return svg(w, h, g)


TIPS = {'Ponto atrás': 'Nas curvas, encurte os pontos para 2 mm: a linha fica redondinha.', 'Ponto haste': 'Com 4 a 6 fios, a haste vira um caule bem marcado.', 'Ponto corrente': 'Não puxe demais: o elo deve ficar redondinho, não esticado.', 'Ponto cheio': 'Use 2 ou 3 fios. Com fios demais o ponto fica alto e irregular.', 'Nó francês': 'Treine num retalho: depois de uns dez nós o movimento fica automático.', 'Ponto margarida': 'O pontinho da ponta deve ser curto, senão a pétala fica pontuda.', 'Ponto pena': 'Risque duas linhas-guia paralelas: os V ficam do mesmo tamanho.', 'Ponto alinhavo': 'Duas fileiras de alinhavo intercaladas formam um preenchimento leve.', 'Ponto cruz simples': 'Conte os quadradinhos antes e borde do centro para as bordas.', 'Ponto folha': 'Mantenha todos os pontos com a mesma inclinação e bem encostados.'}
