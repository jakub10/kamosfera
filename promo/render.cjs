// Renders promo/teaser.html frame by frame into an MP4.
// Usage: node promo/render.cjs [out.mp4]            -> full video
//        node promo/render.cjs --stills 1.5 6 13.9   -> PNG stills for a quick check
// Needs playwright-core + a Chromium, and an ffmpeg binary (FFMPEG env or on PATH).
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');

const FPS = 30, DURATION = 15, W = 1080, H = 1920;
const args = process.argv.slice(2);
const stills = args[0] === '--stills' ? args.slice(1).map(Number) : null;
const out = (!stills && args[0]) || path.join(__dirname, 'kamosfera-teaser.mp4');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto('file://' + path.join(__dirname, 'teaser.html') + '?render');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  if (stills) {
    for (const t of stills) {
      await page.evaluate(t => render(t), t);
      await page.screenshot({ path: path.join(__dirname, `still-${t}.png`) });
    }
    return browser.close();
  }

  const ff = spawn(process.env.FFMPEG || 'ffmpeg', [
    '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '20',
    '-c:a', 'aac', '-shortest', '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const total = FPS * DURATION;
  for (let i = 0; i < total; i++) {
    await page.evaluate(t => render(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log('Hotovo:', out);
})();
