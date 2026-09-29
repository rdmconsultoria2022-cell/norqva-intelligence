# Renders the 1080x1920 overlay (background, brand, caption, phone frame) with a transparent screen hole
import asyncio, os, sys
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
STAGE = os.path.abspath('../bb01/stage.html')
PH_L, PH_T, PH_W, PH_H, BORDER = 280, 430, 520, 1042, 13
SCR = (PH_L + BORDER, PH_T + BORDER, PH_L + PH_W - BORDER, PH_T + PH_H - BORDER)  # 494 x 1016
CAPS = {'M1': 'Registrou, e o mês já atualiza.', 'M2': 'Aqui dá pra ver pra onde cada real foi.'}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1080, 'height': 1920})
        await pg.goto('file://' + STAGE)
        for m, cap in CAPS.items():
            await pg.evaluate("""([cap, L, T, W, H, B]) => {
              document.getElementById('stage').innerHTML = brandHTML() +
                `<div class="cap" style="top:250px;font-size:48px"><span>${cap}</span></div>` +
                `<div style="position:absolute;left:${L}px;top:${T}px;width:${W}px;height:${H}px;border-radius:66px;background:#0a0f0e;border:${B}px solid #1b2623;box-shadow:0 60px 120px rgba(0,0,0,.55)"><div style="position:absolute;inset:0;background:#ff00ff;border-radius:53px"></div></div>` +
                `<div class="illus" style="bottom:auto;top:${T + H + 18}px">Valores ilustrativos</div>`;
            }""", [cap, PH_L, PH_T, PH_W, PH_H, BORDER])
            await pg.wait_for_timeout(150)
            await pg.screenshot(path=f'fg_{m}_raw.png')
        await b.close()
    for m in CAPS:
        im = Image.open(f'fg_{m}_raw.png').convert('RGBA')
        mask = Image.new('L', im.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle(SCR, radius=53, fill=255)
        px = im.load(); mk = mask.load()
        for y in range(SCR[1] - 2, SCR[3] + 2):
            for x in range(SCR[0] - 2, SCR[2] + 2):
                if mk[x, y]: px[x, y] = (0, 0, 0, 0)
        im.save(f'fg_{m}.png')
    print('screen', SCR, SCR[2] - SCR[0], SCR[3] - SCR[1])
asyncio.run(main())
