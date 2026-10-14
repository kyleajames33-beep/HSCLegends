# Executed verification — 11 October 2026

Base: `0fa54e7655150e0e9ec5dd0e45f8ccc23fdad2c9`.

- **8/8 Node model tests passed.** Invalid/repeated input, resource caps,
  unaffordable actions, combo damage, special costs, shield consumption,
  victory/defeat terminal states, reset and question structure.
- **11 browser checks passed**, using Playwright with a packaged Chromium 153
  executable. Both the ES-module version served locally and the standalone
  `file://` HTML were exercised. The default Playwright browser was unavailable;
  the ordinary browser download returned invalid archive bytes, so an npm-packed
  Chromium binary was used. No repository dependency or configuration changed.
  - Correct answer earns energy, reveals explanation and does not auto-attack.
  - Strike costs one energy and deals 14 damage.
  - Wrong answer costs 20 HP and identifies the correct option.
  - Three earned specials win, clamp boss HP at zero and show victory.
  - Five wrong answers lose and disable further actions.
  - Shield absorbs one wrong answer and is consumed.
  - Restart during animation cancels stale pose callbacks.
  - No horizontal overflow at widths 320, 390, 768 or 1280 pixels.
  - Reduced-motion mode disables character animation.
  - No JavaScript page errors.
  - The repository ES-module version loads and answers successfully.
- Desktop (1280 px) and phone (390 px) screenshots were rendered and visually
  inspected. Both characters, health bars, arena, actions and answer controls are
  visible. Phone content scrolls vertically.
- All eight runtime character PNGs are 640 × 640 RGBA with alpha extrema 0–255.
  Arena is opaque RGB. Alpha is preserved during downscaling.
- Standalone build succeeded: 12,499,424 bytes, with inline scripts, styles and
  image data. No external requests are needed by that file.
- Staged `git diff --check`: passed. All changed paths are confined to
  `prototypes/catalyst-battle/`.

## Limits

This evidence covers only the local sample. It does not establish production
campaign behaviour, auth, multiplayer, reward persistence, backend security,
question-bank coverage or student acceptance. Full application tests/build/lint
were not rerun because no application or configuration files changed. Existing
production blockers documented elsewhere remain open. The image tool does not
expose its underlying model. Reference-based poses are coherent but have small
framing/detail differences; they are not seamless animation frames.
