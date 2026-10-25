# -*- coding: utf-8 -*-
"""NORQVA-0133: imagens do site do Kit de Bordado (riscos do próprio kit "bordados" num bastidor sobre linho).

Ilustração feita em código a partir dos mesmos riscos do PDF (motifs.py): nada de foto, nada de terceiros.
Uso: python gerar_imagens_site.py   (precisa de Playwright + Chromium)
Saída: frontend/public/images/bordado/bastidor_*.jpg e colecao.jpg (1080x1080).
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from motifs import MOTIFS
from geo import f
OUT = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'frontend', 'public', 'images', 'bordado'))
by = {m['num']: m for m in MOTIFS}

_UID = [0]


def hoop_svg(m, color, size=1080, fabric='#F4EDE2', skeins=None, bg=True, only_bg=False):
    _UID[0] += 1
    u = f'h{_UID[0]}'
    w, h = m['w'], m['h']
    R = 0.36 * size
    cx, cy = size / 2, size / 2 + 20
    scale = (R * 1.5) / max(w, h)
    tx, ty = cx - w * scale / 2, cy - h * scale / 2
    inner = m['draw']()
    backdrop = (f'<rect width="{size}" height="{size}" fill="#E9DED0"/><rect width="{size}" height="{size}" filter="url(#linen{u})"/>'
                f'<rect width="{size}" height="{size}" filter="url(#linen2{u})"/><rect width="{size}" height="{size}" fill="url(#vig{u})"/>') if (bg or only_bg) else ''
    extras = ''
    if skeins:
        for k, (sc, x, y, rot) in enumerate(skeins):
            stripes = ''.join(f'<line x1="{-44 + i * 8}" y1="-17" x2="{-44 + i * 8}" y2="17" stroke="#000" stroke-opacity=".08" stroke-width="2"/>' for i in range(12))
            extras += (f'<g transform="translate({x},{y}) rotate({rot})" filter="url(#shadow{u})"><rect x="-48" y="-18" width="96" height="36" rx="18" fill="{sc}"/>{stripes}'
                       f'<rect x="-12" y="-19" width="24" height="38" rx="3" fill="#F7F1E6"/><rect x="-12" y="-6" width="24" height="3" fill="{sc}" opacity=".7"/></g>')
        extras += ('<g transform="translate(150,900) rotate(-38)"><rect x="-70" y="-2.2" width="140" height="4.4" rx="2.2" fill="#B9B5AE"/>'
                   '<ellipse cx="62" cy="0" rx="5" ry="1.6" fill="#E9DED0"/></g>')
    sw = 0.78
    base = (f'<g fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" '
            f'stroke-dasharray="1.55 0.42" filter="url(#thread{u})">{inner}</g>')
    shine = (f'<g fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="{sw * 0.28}" stroke-linecap="round" '
             f'stroke-dasharray="0.9 1.07" stroke-dashoffset="-0.2" transform="translate(-0.08,-0.1)">{inner}</g>')
    art = f'<g transform="translate({f(tx)},{f(ty)}) scale({f(scale)})">{base}{shine}</g>'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
<defs>
 <filter id="linen{u}" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.9 0.06" numOctaves="2" seed="3" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.3  0 0 0 0.22 0"/>
 </filter>
 <filter id="linen2{u}" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.06 0.9" numOctaves="2" seed="7" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.3  0 0 0 0.18 0"/>
 </filter>
 <filter id="thread{u}"><feDropShadow dx="0.07" dy="0.1" stdDeviation="0.06" flood-color="#2a1a10" flood-opacity="0.45"/></filter>
 <radialGradient id="vig{u}" cx="50%" cy="45%" r="70%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#3a2a1c" stop-opacity="0.18"/></radialGradient>
 <linearGradient id="wood{u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D9B184"/><stop offset=".5" stop-color="#C69665"/><stop offset="1" stop-color="#B07E4E"/></linearGradient>
 <filter id="shadow{u}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#5a3e24" flood-opacity="0.28"/></filter>
 <clipPath id="clip{u}"><circle cx="{cx}" cy="{cy}" r="{R}"/></clipPath>
</defs>
{backdrop}
<g filter="url(#shadow{u})">
 <circle cx="{cx}" cy="{cy}" r="{R + 22}" fill="url(#wood{u})"/>
 <rect x="{cx - 30}" y="{cy - R - 58}" width="60" height="44" rx="8" fill="url(#wood{u})"/>
 <rect x="{cx - 12}" y="{cy - R - 82}" width="24" height="30" rx="6" fill="#A9A39A"/>
</g>
<circle cx="{cx}" cy="{cy}" r="{R + 6}" fill="#C69665" />
<circle cx="{cx}" cy="{cy}" r="{R}" fill="{fabric}"/>
<g clip-path="url(#clip{u})"><rect width="{size}" height="{size}" filter="url(#linen{u})"/><rect width="{size}" height="{size}" filter="url(#linen2{u})"/>{art}</g>
<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="#9E7046" stroke-width="3" opacity=".6"/>
{extras}
</svg>'''
    if only_bg:
        # só o linho de fundo (para a composição com vários bastidores)
        return svg[: svg.index(f'<g filter="url(#shadow{u})">')] + '</svg>'
    return svg



JOBS = [
    (36, '#B4583A', 'bastidor_gato'),
    (39, '#7E9A7A', 'bastidor_borboleta'),
    (26, '#9C83B8', 'bastidor_monograma'),
    (48, '#C99A3E', 'bastidor_frase'),
    (41, '#C46F5E', 'bastidor_raposa'),
]


def collection_html():
    """Três bastidores sobrepostos (gato, borboleta, monograma) para a vitrine da oferta."""
    cards = [(36, '#B4583A', 10, 250, 580, -6), (39, '#7E9A7A', 500, 0, 560, 6), (26, '#9C83B8', 520, 560, 500, -4)]
    out = ''
    for n, c, x, y, s, rot in cards:
        inner = hoop_svg(by[n], c, size=s, bg=False)
        out += f'<div style="position:absolute;left:{x}px;top:{y}px;width:{s}px;height:{s}px;transform:rotate({rot}deg)">{inner}</div>'
    bg = hoop_svg(by[36], '#B4583A', size=1080, only_bg=True)
    return f'<div style="position:relative;width:1080px;height:1080px;overflow:hidden">{bg}<div style="position:absolute;inset:0">{out}</div></div>'


if __name__ == '__main__':
    from playwright.sync_api import sync_playwright
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1080, 'height': 1080})
        for n, c, name in JOBS:
            pg.set_content(f'<html><body style="margin:0">{hoop_svg(by[n], c)}</body></html>')
            pg.screenshot(path=os.path.join(OUT, f'{name}.jpg'), type='jpeg', quality=86)
        pg.set_content(f'<html><body style="margin:0">{collection_html()}</body></html>')
        pg.screenshot(path=os.path.join(OUT, 'colecao.jpg'), type='jpeg', quality=86)
        b.close()
    print('imagens em', OUT)
