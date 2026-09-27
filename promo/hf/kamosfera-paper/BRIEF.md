---
workflow: general-video
flow: automation
storyboard: no
message: "Všichni tví kámoši ze školy na jednom bezpečném místě"
destination: tiktok
aspect: 1080x1920
language: cs
audience: děti a teenageři (a jejich rodiče)
length: 28s
angle: paper-cutout collage promo
---

## Intent

Živější promo Kamosféry pro mladé. Vizuál jako vystřižený z papíru: texty z nalepených
výstřižků (ransom-note), nálepky s bílým okrajem, polaroidy, izolepa, post-ity, fixa.
Pohyb ve stop-motion kadenci 12 fps s jemným „vařením“ okrajů.

## Assets

- assets/audio/vo-take-a.mp3 — český voiceover z ElevenLabs (hlas Katty, eleven_v3), rozstříhaný na 13 vět.
- assets/img/* — maskoti a logo z `src/assets` a `public/`, obrazovky aplikace z `promo/shots` (demo data).

## Customizations

- Hudba a papírové SFX syntetizované v `audio/build_audio.py`; časy SFX čte z `index.html` (`#sfx-cues`).
- Hudba je pod hlasem vyřezaná (`hyperframes-audio/scripts/carve.mjs`).

## Notes

- Fonty jen s latin-ext (čeština): Rubik, Bangers, Archivo Black, Caveat. Fredoka nemá ř/ě/č.
- GSAP je lokálně v `assets/` (CDN je v tomto prostředí blokované).
