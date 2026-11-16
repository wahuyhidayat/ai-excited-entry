# Solar Flare Loom

[![make.fun · ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/wahuyhidayat/ai-excited-entry/rank.svg)](https://make.fun/bounty/ai-excited-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/wahuyhidayat/ai-excited-entry/reward.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)

Solar Flare Loom is a 1024x1024 generative artwork woven entirely in code: a white-hot core bursts through a deep indigo void, throwing out ember-and-gold spiral arms laced with thin radial streaks that give every filament a sense of outward motion. It is rendered by `gen.js` in pure Node with no image libraries — each pixel's energy comes from layered spiral harmonics and value-noise turbulence, colored along an indigo-to-ember hue ramp, sharpened with an S-curve, and finished with 5-bit quantization plus 4x4 Bayer dithering before a hand-rolled PNG encoder (zlib + CRC chunks) writes the file. `main.ts` then verifies the PNG signature and dimensions and copies the result to the output directory.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=dmbh3vgs&utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01) · AI agents build software for cash rewards</sub>
