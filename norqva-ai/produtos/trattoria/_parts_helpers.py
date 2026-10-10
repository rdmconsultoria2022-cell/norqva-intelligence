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
            f'<text x="20" y="25.2" text-anchor="middle" font-family="DSerif" font-style="italic" font-size="15" fill="{color}">T</text></svg>')

def leaf(color="#9e7e4e"):
    return (f'<svg width="3.4mm" height="3.4mm" viewBox="0 0 10 10"><path d="M5 0 L10 5 L5 10 L0 5 Z" fill="none" stroke="{color}" stroke-width="1.1"/>'
            f'<path d="M5 3 L7 5 L5 7 L3 5 Z" fill="{color}"/></svg>')

def page(body, n, hdr):
    global FOOT
    return (f'<section class="page"><div class="hdr"><span class="l">{hdr}</span><span class="r">NORQVA EDITORIAL</span></div>'
            f'<div class="body">{body}</div>'
            f'<div class="ftr"><span class="l">{FOOT}</span><span class="r">{n:02d}</span></div></section>')

