// Renders a promo HTML page frame by frame into an MP4.
// Usage: node promo/render.cjs                                  -> 15s teaser.html
//        node promo/render.cjs --v30                            -> 30s teaser30.html + music.wav
//        node promo/render.cjs [--v30] --stills 1.5 6 13.9      -> PNG stills for a quick check
// Needs playwright-core + a Chromium (CHROMIUM env), and ffmpeg (FFMPEG env or on PATH).
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');

let args = process.argv.slice(2);
const v30 = args[0] === '--v30';
if (v30) args = args.slice(1);
const cfg = v30
  ? { html: 'teaser30.html', dur: 30, audio: 'music.wav', out: 'kamosfera-promo-30s.mp4' }
  : { html: 'teaser.html', dur: 15, audio: null, out: 'kamosfera-teaser.mp4' };
const FPS = 30, W = 1080, H = 1920;
const stills = args[0] === '--stills' ? args.slice(1).map(Number) : null;
const out = (!stills && args[0]) || path.join(__dirname, cfg.out);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto('file://' + path.join(__dirname, cfg.html) + '?render');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
  await page.waitForTimeout(500);

  if (stills) {
    for (const t of stills) {
      await page.evaluate(t => render(t), t);
      await page.screenshot({ path: path.join(__dirname, `still-${t}.png`) });
    }
    return browser.close();
  }

  const audio = cfg.audio
    ? ['-i', path.join(__dirname, cfg.audio)]
    : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
  const ff = spawn(process.env.FFMPEG || 'ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    ...audio,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '19',
    '-af', 'loudnorm=I=-14:TP=-1.5', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-shortest', '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const total = FPS * cfg.dur;
  for (let i = 0; i < total; i++) {
    await page.evaluate(([t, f]) => render(t, f), [i / FPS, i]);
    const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log('Hotovo:', out);
})();
