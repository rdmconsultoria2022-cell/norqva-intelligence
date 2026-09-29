import asyncio, os
from playwright.async_api import async_playwright
SIZES = [(1080,1080,'1x1'),(1080,1350,'4x5'),(1080,1920,'9x16')]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for m in ['M1','M2']:
            for w,h,tag in SIZES:
                pg = await b.new_page(viewport={'width':w,'height':h})
                await pg.goto('file://' + os.path.abspath('stage.html'))
                await pg.evaluate(f"setupStatic('{m}','C2',{w},{h})")
                await pg.wait_for_timeout(200)
                await pg.screenshot(path=f'BB-B01-H05-{m}-C2_{tag}.png')
                await pg.close()
        await b.close()
asyncio.run(main())
