import asyncio, os, shutil, subprocess
from playwright.async_api import async_playwright
FPS=30
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); pg=await b.new_page(viewport={'width':1080,'height':1920})
        await pg.goto('file://'+os.path.abspath('h01_v3.html'))
        shutil.rmtree('fr',ignore_errors=True); os.makedirs('fr')
        for i in range(20*FPS):
            await pg.evaluate(f"renderVideo({i/FPS})")
            await pg.screenshot(path=f'fr/f{i:05d}.jpg',type='jpeg',quality=92)
        await b.close()
    subprocess.run(['ffmpeg','-loglevel','error','-y','-framerate',str(FPS),'-i','fr/f%05d.jpg','-c:v','libx264','-pix_fmt','yuv420p','-crf','19','silent_v3.mp4'],check=True)
    shutil.rmtree('fr')
asyncio.run(main())
