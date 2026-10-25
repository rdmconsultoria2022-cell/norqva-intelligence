# -*- coding: utf-8 -*-
"""Ferramentas de desenho vetorial para os riscos do Kit de Bordado NORQVA.

Tudo em milímetros (1 unidade = 1 mm no papel), para o risco sair em tamanho real.
Ângulos em graus no sistema do SVG: 0 = direita, 90 = para baixo, -90 = para cima.
"""
import math

SW = 0.48  # espessura do traço do risco (mm), cerca de 1,35 pt
INK = "#1d1a18"


def f(v):
    s = f"{v:.2f}"
    s = s.rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def P(p):
    return f"{f(p[0])},{f(p[1])}"


def add(a, b):
    return (a[0] + b[0], a[1] + b[1])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def mul(a, k):
    return (a[0] * k, a[1] * k)


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def dist(a, b):
    return math.hypot(b[0] - a[0], b[1] - a[1])


def polar(o, ang, r):
    a = math.radians(ang)
    return (o[0] + r * math.cos(a), o[1] + r * math.sin(a))


def rot(p, ang, o=(0, 0)):
    a = math.radians(ang)
    x, y = p[0] - o[0], p[1] - o[1]
    return (o[0] + x * math.cos(a) - y * math.sin(a), o[1] + x * math.sin(a) + y * math.cos(a))


def frame(o, ang, sx=1.0, sy=1.0):
    """Converte coordenadas locais (x ao longo do eixo, y para o lado) em globais."""
    def T(p):
        return add(o, rot((p[0] * sx, p[1] * sy), ang))
    return T


def mirror_x(pts, cx):
    return [(2 * cx - x, y) for x, y in pts]


# ---------------------------------------------------------------- curvas

def _segs(pts, closed=False, t=1.0):
    """Catmull-Rom -> Bézier cúbica. Devolve só os segmentos C (a partir de pts[0])."""
    n = len(pts)
    out = []
    rng = n if closed else n - 1
    for i in range(rng):
        p1, p2 = pts[i], pts[(i + 1) % n]
        if closed:
            p0, p3 = pts[(i - 1) % n], pts[(i + 2) % n]
        else:
            p0 = pts[i - 1] if i > 0 else sub(mul(p1, 2), p2)
            p3 = pts[i + 2] if i + 2 < n else sub(mul(p2, 2), p1)
        c1 = add(p1, mul(sub(p2, p0), t / 6))
        c2 = sub(p2, mul(sub(p3, p1), t / 6))
        out.append(f"C{P(c1)} {P(c2)} {P(p2)}")
    return " ".join(out)


def curve(pts, t=1.0):
    """Curva aberta suave passando pelos pontos."""
    if len(pts) == 2:
        return f"M{P(pts[0])} L{P(pts[1])}"
    return f"M{P(pts[0])} " + _segs(pts, False, t)


def blob(pts, t=1.0):
    """Curva fechada suave passando pelos pontos."""
    return f"M{P(pts[0])} " + _segs(pts, True, t) + " Z"


def chain(chains, closed=False, t=1.0):
    """Várias curvas suaves emendadas com quina entre elas (cada lista começa onde a anterior terminou)."""
    d = f"M{P(chains[0][0])}"
    for c in chains:
        d += " " + (f"L{P(c[1])}" if len(c) == 2 else _segs(c, False, t))
    return d + (" Z" if closed else "")


def line(a, b):
    return f"M{P(a)} L{P(b)}"


def arc_pts(c, r, a0, a1, n=12, ry=None):
    ry = r if ry is None else ry
    return [(c[0] + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             c[1] + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def circle(c, r):
    return f'<circle cx="{f(c[0])}" cy="{f(c[1])}" r="{f(r)}"/>'


def ellipse(c, rx, ry, ang=0):
    tr = f' transform="rotate({f(ang)} {f(c[0])} {f(c[1])})"' if ang else ""
    return f'<ellipse cx="{f(c[0])}" cy="{f(c[1])}" rx="{f(rx)}" ry="{f(ry)}"{tr}/>'


def path(d, extra=""):
    return f'<path d="{d}"{extra}/>'


def dashed(d, dash=1.6, gap=1.4):
    return f'<path d="{d}" stroke-dasharray="{f(dash)} {f(gap)}"/>'


# ---------------------------------------------------------------- peças botânicas

def petal(c, r0, ang, L, hw, tip="round", bw=None, curl=0.0):
    """Pétala aberta na base (encosta no miolo de raio r0)."""
    bw = hw * 0.55 if bw is None else bw
    T = frame(c, ang)
    d = math.degrees(math.asin(min(0.95, bw / max(r0, 0.01)))) if r0 > 0 else 0
    if r0 > 0:
        b1 = rot((r0, 0), -d)
        b2 = rot((r0, 0), d)
    else:
        b1, b2 = (0, -bw), (0, bw)
    x0 = r0
    up = [(x0 + 0.28 * L, -hw * 0.92 + curl * 0.3), (x0 + 0.62 * L, -hw + curl * 0.6)]
    dn = [(x0 + 0.62 * L, hw + curl * 0.6), (x0 + 0.28 * L, hw * 0.92 + curl * 0.3)]
    tp = (x0 + L, curl)
    if tip == "round":
        pts = [b1] + up + [(x0 + 0.9 * L, -hw * 0.62 + curl * 0.85), tp, (x0 + 0.9 * L, hw * 0.62 + curl * 0.85)] + dn + [b2]
        return curve([T(p) for p in pts])
    if tip == "notch":
        n1 = (x0 + 0.93 * L, -hw * 0.5 + curl)
        n2 = (x0 + 0.93 * L, hw * 0.5 + curl)
        mid = (x0 + 0.84 * L, curl)
        a = [b1] + up + [n1]
        b = [n1, mid]
        cc = [mid, n2]
        e = [n2] + dn + [b2]
        return chain([[T(p) for p in a], [T(p) for p in b], [T(p) for p in cc], [T(p) for p in e]])
    a = [b1] + up + [tp]
    b = [tp] + dn + [b2]
    return chain([[T(p) for p in a], [T(p) for p in b]])


def leaf(base, ang, L, hw, vein=True, curl=0.0, veins=0, tipcurl=0.0):
    """Folha fechada pontuda. curl desloca o eixo (folha curvada)."""
    T = frame(base, ang)
    def ax(x):  # eixo curvado
        u = x / L
        return curl * 4 * u * (1 - u) + tipcurl * u * u
    tip = (L, ax(L))
    s1 = [(0, 0), (0.25 * L, -hw * 0.85 + ax(0.25 * L)), (0.55 * L, -hw + ax(0.55 * L)), (0.82 * L, -hw * 0.62 + ax(0.82 * L)), tip]
    s2 = [tip, (0.82 * L, hw * 0.62 + ax(0.82 * L)), (0.55 * L, hw + ax(0.55 * L)), (0.25 * L, hw * 0.85 + ax(0.25 * L)), (0, 0)]
    out = [path(chain([[T(p) for p in s1], [T(p) for p in s2]], closed=True))]
    if vein:
        out.append(path(curve([T((x, ax(x))) for x in (0.0, 0.3 * L, 0.6 * L, 0.84 * L)])))
    for i in range(veins):
        x = L * (0.18 + 0.38 * i / max(1, veins - 1)) if veins > 1 else 0.35 * L
        for s in (-1, 1):
            w = hw * (0.62 - 0.18 * i / max(1, veins - 1))
            out.append(path(curve([T((x, ax(x))), T((x + 0.08 * L, s * w * 0.55 + ax(x + 0.08 * L))), T((x + 0.16 * L, s * w + ax(x + 0.16 * L)))])))
    return "".join(out)


def round_leaf(base, ang, L, hw, vein=True):
    """Folha arredondada (eucalipto)."""
    T = frame(base, ang)
    pts = [(0, 0), (0.12 * L, -hw * 0.75), (0.45 * L, -hw), (0.82 * L, -hw * 0.75), (L, 0), (0.82 * L, hw * 0.75), (0.45 * L, hw), (0.12 * L, hw * 0.75)]
    out = path(blob([T(p) for p in pts]))
    if vein:
        out += path(curve([T((0.05 * L, 0)), T((0.5 * L, 0.02 * hw)), T((0.75 * L, 0))]))
    return out


def daisy_loop(c, ang, L, hw, gap=0.0):
    """Pétala fechada em gota (forma de ponto margarida)."""
    T = frame(c, ang)
    pts = [(gap, 0), (gap + 0.2 * L, -hw * 0.75), (gap + 0.62 * L, -hw), (gap + 0.92 * L, -hw * 0.55), (gap + L, 0),
           (gap + 0.92 * L, hw * 0.55), (gap + 0.62 * L, hw), (gap + 0.2 * L, hw * 0.75)]
    return path(chain([[T(p) for p in pts[:5]], [T(p) for p in pts[4:] + [pts[0]]]], closed=True))


def flower5(c, r, ang=-90, petals=5, inner=0.28, tip="round", hw=None):
    """Flor simples de pétalas abertas em volta de um miolo."""
    r0 = r * inner
    hw = r * 0.36 if hw is None else hw
    out = [circle(c, r0)]
    for i in range(petals):
        out.append(path(petal(c, r0, ang + 360 * i / petals, r - r0, hw, tip=tip, bw=r0 * 0.62)))
    return "".join(out)


def bow(c, w=14, h=9, tails=10):
    """Laço simples: duas alças, nó e duas pontas."""
    x, y = c
    k = h / 2
    out = [
        path(blob([(x - 2, y - 1.6), (x - w * 0.55, y - k * 1.15), (x - w, y - k * 0.4), (x - w * 0.9, y + k * 0.8), (x - w * 0.45, y + k * 0.55), (x - 2, y + 1.6)], 0.9)),
        path(blob([(x + 2, y - 1.6), (x + w * 0.55, y - k * 1.15), (x + w, y - k * 0.4), (x + w * 0.9, y + k * 0.8), (x + w * 0.45, y + k * 0.55), (x + 2, y + 1.6)], 0.9)),
        ellipse((x, y), 2.3, 2.6),
        path(chain([[(x - 1.4, y + 2.3), (x - 3.5, y + tails * 0.55), (x - 6, y + tails)], [(x - 6, y + tails), (x - 3.4, y + tails - 1.2)], [(x - 3.4, y + tails - 1.2), (x - 1.6, y + tails * 0.6), (x + 0.2, y + 2.6)]])),
        path(chain([[(x + 1.4, y + 2.3), (x + 3.5, y + tails * 0.55), (x + 6.5, y + tails * 0.95)], [(x + 6.5, y + tails * 0.95), (x + 3.9, y + tails * 0.95 + 1.0)], [(x + 3.9, y + tails * 0.95 + 1.0), (x + 2.2, y + tails * 0.62), (x + 0.4, y + 2.6)]])),
    ]
    return "".join(out)


def heart(c, w, h):
    x, y = c
    top = y - h * 0.5
    return chain([[(x, top + h * 0.22), (x - w * 0.22, top), (x - w * 0.47, top + h * 0.12), (x - w * 0.45, top + h * 0.46), (x - w * 0.2, top + h * 0.76), (x, top + h)],
                  [(x, top + h), (x + w * 0.2, top + h * 0.76), (x + w * 0.45, top + h * 0.46), (x + w * 0.47, top + h * 0.12), (x + w * 0.22, top), (x, top + h * 0.22)]], closed=True)


def svg_wrap(w, h, inner, sw=SW, color=INK, cls="art", extra_style=""):
    return (f'<svg class="{cls}" xmlns="http://www.w3.org/2000/svg" width="{f(w)}mm" height="{f(h)}mm" viewBox="0 0 {f(w)} {f(h)}" style="{extra_style}">'
            f'<g fill="none" stroke="{color}" stroke-width="{f(sw)}" stroke-linecap="round" stroke-linejoin="round">{inner}</g></svg>')


# ---------------------------------------------------------------- pontos sobre curvas e oclusão

def _ctrl(pts, i, t=1.0):
    n = len(pts)
    p1, p2 = pts[i], pts[i + 1]
    p0 = pts[i - 1] if i > 0 else sub(mul(p1, 2), p2)
    p3 = pts[i + 2] if i + 2 < n else sub(mul(p2, 2), p1)
    return p1, add(p1, mul(sub(p2, p0), t / 6)), sub(p2, mul(sub(p3, p1), t / 6)), p2


def on(pts, u):
    """Ponto e ângulo da tangente sobre curve(pts), u de 0 a 1 (por segmento)."""
    if len(pts) == 2:
        p = lerp(pts[0], pts[1], u)
        return p, math.degrees(math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]))
    k = len(pts) - 1
    s = min(max(u, 0.0), 1.0) * k
    i = min(int(s), k - 1)
    t = s - i
    a, b, c, d = _ctrl(pts, i)
    mt = 1 - t
    p = (mt ** 3 * a[0] + 3 * mt * mt * t * b[0] + 3 * mt * t * t * c[0] + t ** 3 * d[0],
         mt ** 3 * a[1] + 3 * mt * mt * t * b[1] + 3 * mt * t * t * c[1] + t ** 3 * d[1])
    dx = 3 * mt * mt * (b[0] - a[0]) + 6 * mt * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0])
    dy = 3 * mt * mt * (b[1] - a[1]) + 6 * mt * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1])
    return p, math.degrees(math.atan2(dy, dx))


_CLIP = [0]


def behind(content, *occluders):
    """Desenha 'content' por trás das formas fechadas 'occluders' (o traço some onde elas cobrem)."""
    _CLIP[0] += 1
    cid = f"oc{_CLIP[0]}"
    d = "M-500,-500 H1500 V1500 H-500 Z " + " ".join(occluders)
    return (f'<defs><clipPath id="{cid}"><path clip-rule="evenodd" d="{d}"/></clipPath></defs>'
            f'<g clip-path="url(#{cid})">{content}</g>')


def ribbon_bow(c, w=14, h=9, tail=11, spread=5):
    """Laço: duas alças, nó e duas fitas com ponta em V. Devolve (svg, contorno para oclusão)."""
    x, y = c
    k = h / 2
    L = blob([(x - 1.6, y - 1.5), (x - w * 0.5, y - k * 1.2), (x - w, y - k * 0.6), (x - w * 0.95, y + k * 0.7), (x - w * 0.5, y + k * 0.75), (x - 1.6, y + 1.5)], 0.9)
    R = blob([(x + 1.6, y - 1.5), (x + w * 0.5, y - k * 1.2), (x + w, y - k * 0.6), (x + w * 0.95, y + k * 0.7), (x + w * 0.5, y + k * 0.75), (x + 1.6, y + 1.5)], 0.9)
    knot = f"M{P((x - 2.4, y - 2.3))} C{P((x - 2.9, y))} {P((x - 2.9, y))} {P((x - 2.4, y + 2.4))} L{P((x + 2.4, y + 2.4))} C{P((x + 2.9, y))} {P((x + 2.9, y))} {P((x + 2.4, y - 2.3))} Z"
    tails = []
    for s in (-1, 1):
        e = (x + s * spread, y + tail)
        a0 = (x + s * 0.8, y + 2.4)
        a1 = (x + s * 2.4, y + 2.4)
        tails.append(chain([[a0, (x + s * (spread * 0.45 - 0.6), y + tail * 0.55), (e[0] - s * 1.4, e[1] + 0.2)],
                            [(e[0] - s * 1.4, e[1] + 0.2), (e[0] + s * 0.2, e[1] - 1.6)],
                            [(e[0] + s * 0.2, e[1] - 1.6), (e[0] + s * 1.6, e[1] + 0.6)],
                            [(e[0] + s * 1.6, e[1] + 0.6), (x + s * (spread * 0.55 + 1.6), y + tail * 0.5), a1]]))
    svg = behind("".join(f'<path d="{d}"/>' for d in (L, R) + tuple(tails)), knot) + f'<path d="{knot}"/>'
    occ = " ".join([L, R, knot] + [t + " Z" for t in tails])
    return svg, occ


def leaf_d(base, ang, L, hw, curl=0.0, tipcurl=0.0):
    """Só o contorno fechado de uma folha (para usar como oclusão)."""
    T = frame(base, ang)
    def ax(x):
        u = x / L
        return curl * 4 * u * (1 - u) + tipcurl * u * u
    tip = (L, ax(L))
    s1 = [(0, 0), (0.25 * L, -hw * 0.85 + ax(0.25 * L)), (0.55 * L, -hw + ax(0.55 * L)), (0.82 * L, -hw * 0.62 + ax(0.82 * L)), tip]
    s2 = [tip, (0.82 * L, hw * 0.62 + ax(0.82 * L)), (0.55 * L, hw + ax(0.55 * L)), (0.25 * L, hw * 0.85 + ax(0.25 * L)), (0, 0)]
    return chain([[T(p) for p in s1], [T(p) for p in s2]], closed=True)


def lobed(c, r, n=5, ang=-90, depth=0.42, notch=False, center=None, lines=True, wob=0.0):
    """Flor de contorno único: n pétalas arredondadas (ou com recorte), miolo e linhas até os vales.
    Devolve (svg, vales) — os vales servem para encaixar a haste."""
    step = 360 / n
    rv = r * depth
    valleys = [polar(c, ang - step / 2 + step * i, rv) for i in range(n)]
    chains = []
    for i in range(n):
        a = ang + step * i
        v0 = valleys[i]
        v1 = valleys[(i + 1) % n]
        rr = r * (1 + (wob if i % 2 else -wob))
        if notch:
            pts = [v0, polar(c, a - step * 0.36, rr * 0.86), polar(c, a - step * 0.14, rr * 0.99), polar(c, a, rr * 0.86)]
            pts2 = [polar(c, a, rr * 0.86), polar(c, a + step * 0.14, rr * 0.99), polar(c, a + step * 0.36, rr * 0.86), v1]
            chains += [pts, pts2]
        else:
            chains.append([v0, polar(c, a - step * 0.4, rr * 0.8), polar(c, a - step * 0.2, rr * 0.98), polar(c, a, rr), polar(c, a + step * 0.2, rr * 0.98), polar(c, a + step * 0.4, rr * 0.8), v1])
    out = f'<path d="{chain(chains, closed=True)}"/>'
    rc = r * 0.22 if center is None else center
    if rc:
        out += circle(c, rc)
        if lines:
            for v in valleys:
                a = math.degrees(math.atan2(v[1] - c[1], v[0] - c[0]))
                out += f'<path d="{line(polar(c, a, rc), v)}"/>'
    return out, valleys


def nearest(points, target):
    return min(points, key=lambda p: dist(p, target))


def tapered(center, w0, w1, n=14, cap_round=True):
    """Galho/haste grossa: contorno fechado que afina de w0 para w1 ao longo da curva central."""
    left, right = [], []
    for i in range(n + 1):
        u = i / n
        p, a = on(center, u)
        w = (w0 + (w1 - w0) * u) / 2
        left.append(polar(p, a - 90, w))
        right.append(polar(p, a + 90, w))
    p_end, a_end = on(center, 1.0)
    tip = polar(p_end, a_end, w1 * 0.6)
    chains = [left, [left[-1], tip, right[-1]], right[::-1], [right[0], left[0]]]
    return chain(chains, closed=True)


def simple_bud(base, ang, L, w):
    """Botão fechado em gota com cálice em taça."""
    T = frame(base, ang)
    body = chain([[T((0.18 * L, -0.42 * w)), T((0.55 * L, -0.5 * w)), T((0.88 * L, -0.25 * w)), T((L, 0))],
                  [T((L, 0)), T((0.88 * L, 0.25 * w)), T((0.55 * L, 0.5 * w)), T((0.18 * L, 0.42 * w))]])
    cup = chain([[T((0.18 * L, -0.42 * w)), T((0.42 * L, -0.56 * w)), T((0.36 * L, -0.2 * w))],
                 [T((0.36 * L, -0.2 * w)), T((0.46 * L, 0)), T((0.36 * L, 0.2 * w))],
                 [T((0.36 * L, 0.2 * w)), T((0.42 * L, 0.56 * w)), T((0.18 * L, 0.42 * w))],
                 [T((0.18 * L, 0.42 * w)), T((0.02 * L, 0.16 * w)), T((0, 0)), T((0.02 * L, -0.16 * w)), T((0.18 * L, -0.42 * w))]])
    return f'<path d="{body}"/><path d="{cup}"/>'


def circle_d(c, r):
    return f"M{f(c[0] + r)},{f(c[1])} A{f(r)},{f(r)} 0 1 0 {f(c[0] - r)},{f(c[1])} A{f(r)},{f(r)} 0 1 0 {f(c[0] + r)},{f(c[1])} Z"


def ellipse_d(c, rx, ry, ang=0):
    a = polar(c, ang, rx)
    b = polar(c, ang + 180, rx)
    return f"M{P(a)} A{f(rx)},{f(ry)} {f(ang)} 1 0 {P(b)} A{f(rx)},{f(ry)} {f(ang)} 1 0 {P(a)} Z"
