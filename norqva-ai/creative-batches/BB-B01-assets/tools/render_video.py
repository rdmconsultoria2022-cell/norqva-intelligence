import asyncio, os, shutil, subprocess, sys
from playwright.async_api import async_playwright
FPS = 30
# jobs as KEY:M:C, e.g. H01:M2:C1
JOBS = [tuple(a.split(':')) for a in sys.argv[1:]]
async def render(b, sem, key, m, c):
    async with sem:
        name = {'ENDCARD': f'BB-B01-encerramento-{c}'}.get(key, f'BB-B01-{key}-{m}-{c}')
        d = f'frames_{name}'
        shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
        pg = await b.new_page(viewport={'width': 1080, 'height': 1920})
        await pg.goto('file://' + os.path.abspath('stage.html'))
        dur = await pg.evaluate(f"setupVideo('{key}','{m}','{c}')")
        n = int(dur * FPS)
        for i in range(n):
            await pg.evaluate(f"renderVideo({i / FPS})")
            await pg.screenshot(path=f'{d}/f{i:05d}.jpg', type='jpeg', quality=92)
        await pg.close()
        out = f'silent_{name}.mp4'
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-framerate', str(FPS), '-i', f'{d}/f%05d.jpg',
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-crf', '20', '-movflags', '+faststart', out], check=True)
        shutil.rmtree(d)
        print(out, n, flush=True)
async def main():
    sem = asyncio.Semaphore(3)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await asyncio.gather(*[render(b, sem, *j) for j in JOBS])
        await b.close()
asyncio.run(main())
