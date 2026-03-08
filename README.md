# 🌙 Moon Patrol — Space Edition

> A retro arcade shooter built in a single hackathon session using vanilla JavaScript and HTML5 Canvas.

---

## 🕹️ What Is It?

Moon Patrol is a side-scrolling arcade game inspired by the classic 1982 Williams Electronics cabinet. You pilot a lunar rover across three increasingly brutal sectors, jumping obstacles, blasting enemies, and surviving boss encounters — all rendered in glowing neon on a pure canvas.

No frameworks. No engines. No build tools. Just one HTML file, one CSS file, and one JS file.

---

## 🚀 How to Play

**Desktop**
| Input | Action |
|---|---|
| `Space` / `↑` | Jump (double jump supported) |
| `Mouse` / `F` / `Ctrl` | Shoot (aim with mouse cursor) |
| `P` / `Esc` | Pause |
| `- / =` | Volume down / up |
| `[ / ]` | Aim sensitivity |

**Mobile**
| Control | Action |
|---|---|
| **JUMP** button (left) | Jump |
| **SHOOT** button (left) | Continuous fire |
| **Analog stick** (right) | Aim direction |
| **⏸** button (right) | Pause |

---

## 🗺️ Sectors

| Sector | Theme | Boss |
|---|---|---|
| 1 — On the Moon | Classic lunar surface, parallax stars | TITAN (mobile, fires boss shots) |
| 2 — Alien Territory | UFO-filled sky, pulsing cyan atmosphere | TITAN (stationary) + MiniRover drops |
| 3 — Cat-astrophe | Digital cat stars, cat silhouette on moon | TITAN + 2 WARDEN midbosses |

Survive each sector's boss to advance. Score gates progress — you need to earn your way through.

---

## ⚙️ Technical Overview

### Stack
- **Language:** Vanilla JavaScript (ES6+)
- **Rendering:** HTML5 Canvas 2D API (800×400 logical resolution)
- **Styling:** Plain CSS with retro CRT glow effects
- **Storage:** `localStorage` for high score and settings
- **Dependencies:** None

### Architecture

The entire game runs in a single `requestAnimationFrame` loop:

```
gameLoop()
  → updateInput()
  → updateGame() / updateOutro()
  → draw()
```

State is managed through a flat `world` object and a `GAME_STATE` enum (`MENU → PLAYING → PAUSED → GAME_OVER / VICTORY → OUTRO`).

### Key Systems

**Terrain** — Layered sine waves generate a scrolling bumpy surface. All obstacles and enemies snap to `terrainYAt(x)` in real time.

**Speed** — Dynamic speed curve based on score and difficulty tier, with a soft cap around 3.1×. Auto mode runs at 65% of manual speed.

**Enemies** — 8 enemy types (asteroid, drone, zigzag, comet, debris, interceptor, shooter) with weighted spawn chances that scale with run progress.

**Boss Arena** — When a boss spawns, the stage clears and no new obstacles or enemies are allowed until the boss is defeated.

**Power-ups** — Drop on enemy kill (34% chance) or spawn ambiguously. Pool shifts toward health/shield when the player is low on HP.

**Backgrounds** — Each sector has a unique parallax background: star layers in Sector 1, bobbing UFOs in Sector 2, drifting digital cat constellations in Sector 3.

**Mobile Controls** — Auto-mode only on mobile. Left side has circular Jump and Shoot buttons; right side has a virtual analog stick for aiming. The analog stick tracks `touchmove` deltas from the touch origin and normalises them into a direction vector fed directly into `player.aimX / player.aimY`.

---

## 🏗️ How It Was Built

This game was built iteratively in a single hackathon-style session using Claude as a coding collaborator. The workflow was conversational: describe a feature, review the output, tweak, repeat.

**Session highlights:**

- Started from a basic canvas loop with a rover sprite and terrain
- Added obstacle types, enemy types, and a scoring system incrementally
- Bosses and sector theming were added as distinct milestones
- Visual polish (parallax stars, UFOs, digital cats, moon silhouettes) came in targeted passes
- Mobile support was added as a final focused sprint — auto-mode only, no refactoring of core logic, analog stick layered on top of the existing aim system
- Every change was scoped narrowly: touch as little working code as possible, add only what's needed

The result is ~2,100 lines of vanilla JS with no dead code from engine overhead.

---

## 📁 File Structure

```
moon-patrol/
├── index.html      # Shell, canvas, mobile button layout
├── style.css       # Layout, CRT glow, touch control styling
└── game.js         # Everything: game loop, physics, enemies, rendering, input
```

---

## 🔧 Tweakable Values

All tuning constants are commented in `game.js` and `style.css`:

| Constant | Location | Effect |
|---|---|---|
| `ANALOG_RADIUS` | `game.js → setupInput()` | Drag distance for full aim deflection |
| `shootCooldown()` | `game.js` | Fire rate |
| `gameSpeed()` | `game.js` | Speed curve per score tier |
| `#analog-stick` width/height | `style.css` | Touch area size on mobile |
| `#analog-knob` width/height | `style.css` | Visual knob size |
| Boss HP | `game.js → spawnBoss()` | How tanky bosses are |

---

## 🏆 Credits

Built with HTML5 Canvas + vanilla JS.  
Developed collaboratively with [Claude](https://claude.ai) (Anthropic) as AI pair programmer.  
Inspired by Moon Patrol (Williams Electronics, 1982).
