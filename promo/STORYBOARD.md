# Storyboard — Kamosféra promo v2

Theme: 076 Mascot guide (vlastný) · Format: 1080×1920 (render 2160×3840) · Length: 30 s · Sound: hudba 120 BPM + teplé SFX

Postup a pravidlá podľa [saas-motion-kit](https://github.com/tugrawork-creator/saas-motion-kit) (creative/, playbook/). Audit:
`python tools/variety_audit.py promo/STORYBOARD.md` (nástroj je v tom repozitári).

## Message & tone
- **Sentence:** I want to say "všetci tvoji kamoši zo školy na jednom bezpečnom mieste" in a playful tone, so the viewer feels, že tam chce byť tiež.
- **Tone arc:** bold → playful → warm → celebratory → trustworthy → celebratory
- accent: pink
- **Motif:** maskot Kamoš je sprievodca: je na scéne celý film, scény sa menia okolo neho a na konci vletí do loga. Veta „TVOJI KAMOŠI.“ z úvodu sa vráti nad logom.

## Ledger

| # | start | dur | beat | tone | entrance | transition_out | ease | direction | palette | camera | components | new_component | sfx | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0:00 | 3.4 | hook | bold | type-slam | match-cut-shape | expo.out | center | blue+navy | locked | kinetic-type | | kick-thump | bodka z „SVET.“ narastie do svätožiary maskota |
| 2 | 0:03.4 | 3.1 | reveal | playful | letters-from-blur | parallax-slide | back.out | radial | purple+blue | push-in | mascot-orbit | mascot-guide | pop-reveal | |
| 3 | 0:06.5 | 5.5 | proof | playful | mask-wipe | push-through | power3.inOut | left | blue+white | orbit | phone-feed+reaction-chips | | pops | maskot fandí pri telefóne |
| 4 | 0:12 | 3.6 | proof | celebratory | drop-bounce | paper-fold-flip | back.out | top | purple+pink | dolly-in | story-view | | reveal-sparkle | surprise: maskot vyskočí zo stories von + konfety |
| 5 | 0:15.6 | 4.4 | proof | warm | typewriter | whip-pan | sine.inOut | right | blue+white | slow-turn | html-chat | live-chat-bubbles | bubble-pops | |
| 6 | 0:20 | 4 | proof | playful | spin-in | product-shape-mask | power2.out | bottom | purple+blue | orbit | game-carousel | | ticks | |
| 7 | 0:24 | 3 | proof | trustworthy | tracking-in | object-carry | expo.inOut | center | pink+navy | locked | shield-cards | | confirm-pops | surprise: štít sa otvorí cez celý obraz, farba zaleje scénu |
| 8 | 0:27 | 3 | cta | celebratory | mask-rise | motif:end | back.out | bottom | pink+purple | pull-back | logo-lockup | | impact | callback „TVOJI KAMOŠI.“ |

## Frames

### 1 · Hook
- key visual: TVOJI KAMOŠI. / TVOJ SVET. dopadá na doby
- beat hook: každé slovo na kopák

### 2 · Reveal
- key visual: Kamoš máva, okolo krúžia planéty
- on-screen words: Vitaj v Kamosfére

### 3–6 · Proof
- skutočné obrazovky appky (demo dáta), chat prestavaný v HTML
- on-screen words: jedna krátka veta na scénu

### 7 · Bezpečne
- štít maskota ako maska prechodu, tri sklenené karty

### 8 · CTA
- logo + Kamosféra + Pridaj sa!; Kamoš vletí do loga
