# Engine options (2026-11-04)

The design phase is good enough to start the engine. The user asked for a real look at the options before picking one, rather than a quick call. They also asked whether "TS + WebGL" meant writing a whole engine or reusing an existing JS one. Three research passes ran in parallel: web-tech engines, native engines, and netcode with the reference games' precedent. Versions were checked against npm, GitHub and release notes on 2026-11-04. The rateable version of this is the **Engine Choice** page (see the artifacts memory).

Already decided: co-op is **online-ready, local first**. The sim is deterministic and driven by inputs from day one.

## The finding that shapes everything: the sim is ours in every option

No engine's physics, navigation, timers or networking is deterministic enough for lockstep or rollback. That covers Godot, Unity, Phaser and Bevy's float maths without extra work. So under every option we write the simulation ourselves:
- fixed step
- seeded RNG
- our own trig (lookup tables or polynomials, never `Math.sin`)
- our own collision and flow fields
- plain data that can be hashed and snapshotted

The engine only provides rendering, VFX, audio, asset loading, packaging and (optionally) an editor.

That changes the question. "Which engine" splits into two choices:
1. **The sim language.** This one is hard to reverse: TypeScript, GDScript, Rust or C#. Only TypeScript reuses what we have (`rules-c.js`, the skeleton's sim, its tests, the Atlas audits) without porting it.
2. **The renderer and platform.** This is swappable if the sim stays pure. In TS, PixiJS, Phaser and raw WebGL are interchangeable behind a `Renderer` interface.

**Answer to the user's question:** "TS + WebGL" doesn't have to mean a custom engine. Realistically, "reuse" means a renderer library, such as PixiJS v8 or Phaser 4 used as a renderer, plus utilities: atlases, particles, filters, text and audio. It doesn't mean adopting a JS engine's game architecture. Full JS engines (Phaser, Excalibur, KAPLAY, LittleJS) own the loop and objects, and that fights a deterministic sim. Our skeleton already is the "engine" part (loop, World, spells, statuses, director, flow fields, gamepad), so a renderer library fills the gap.

## Netcode: lockstep first, rollback later

*(Superseded: the game went to rollback with a 2-tick input delay the same day. See "Netcode is rollback (recorded after the fact)" in `../decisions/README.md`.)*

Precedent:
- **Magicka** was host-based. Its patch notes list desyncs for items, statuses and animations, plus heavy uplink bandwidth and problems above about 400 ms ping. That points to state replication without a firm authority model.
- **Nuclear Throne Together**, the closest analogue (a fast top-down shooter with lots of bullets, a GameMaker mod), uses deterministic lockstep. It sends only inputs, plays well at about 100 ms of input delay, and runs camera and aim locally with no delay.
- **Risk of Rain 2, Ravenswatch and Helldivers** use host-authoritative P2P. RoR2 needed community mods for client-predicted projectiles.
- Most indie co-op action games (Vampire Survivors, Brotato, Enter the Gungeon, Wizard of Legend) ship **local only plus Steam Remote Play Together**.

The models compared:
- **Lockstep** sends a few bytes of input per tick, whatever the entity count. Once the sim is deterministic, **each new spell costs nothing to network**, which matters most when an AI writes dozens of them. The cost is input delay, plus everyone waiting for the slowest peer.
- **Rollback** removes the delay. It needs save, restore and re-simulation of up to about 8 ticks within one frame, so the state must be cheap to snapshot. It is often overkill for PvE.
- **State sync with prediction** degrades gracefully with a bad peer. But every spell, status and surface needs its own replication rules, which makes it the worst fit here.
- **Remote Play Together** is free on Steam, but the video compression is bad for dense pixel art, and it doesn't help browser playtests.

**Recommendation:**
- Start with lockstep and a small input delay, with aim, camera and cast-start VFX predicted locally.
- Keep the sim snapshot-able (hot state in typed arrays) so rollback can be added later; the input pipeline is the same.
- The transport sits behind a thin interface: WebRTC data channels for browser links, Steam Networking Messages for the Steam release, and loopback for local play and tests.
- Remote Play Together comes free on Steam as the fallback.

## Options

These scores are my judgment from the research, on a 1–5 scale for this project.

| Option | Reuse | Link builds | Claude can verify | Netcode help | Pixel VFX tools | Editor | Iteration | Steam |
|---|---|---|---|---|---|---|---|---|
| **PixiJS v8 + own TS sim** | 5 | 5 | 5 | 3 | 3 | 1 | 5 | 3 |
| Phaser 4 as renderer + own sim | 4 | 5 | 4 | 3 | 4 | 2 | 5 | 3 |
| Godot 4.7, typed GDScript, own fixed-point sim | 2 | 4 | 3 | 2 | 5 | 5 | 4 | 5 |
| Bevy 0.20 + ggrs + matchbox | 1 | 3 | 3 | 5 | 2 | 1 | 2 | 3 |
| Unity 6 + Photon Quantum | 1 | 3 | 2 | 5 | 5 | 5 | 2 | 5 |
| MonoGame / FNA | 1 | 1 | 4 | 3 | 1 | 1 | 4 | 5 |
| Defold | 2 | 5 | 3 | 2 | 3 | 4 | 4 | 4 |
| Excalibur.js | 4 | 5 | 4 | 3 | 2 | 1 | 5 | 2 |

### PixiJS v8 + our TS sim (Claude's pick)

PixiJS v8.22 (Oct 2026) is MIT, about monthly releases, and draws with WebGL2 or WebGPU through one API. It has no loop or physics of its own: turn off its ticker and call `render()` from our loop.

Pixel art:
- `scaleMode: 'nearest'` and `roundPixels` are built in.
- The integer-scale camera is about 30 lines, and we already have it.

VFX:
- `ParticleContainer` handles tens of thousands of particles.
- pixi-filters adds glow, bloom, shockwave and displacement.
- Beams and fire sheets become meshes and small shaders.

Reuse:
- `rules-c.js` and the skeleton's sim reuse as they are.
- The Canvas2D actor, wall and rune art becomes atlas generators (drawn once to an OffscreenCanvas, then uploaded as textures).
- Per-frame procedural VFX have to be ported to GPU meshes, shaders or particles. That is the main cost.

Verification: it renders in headless Chrome as the tools do now, the sim runs in node under vitest, and replays can be checked against state hashes.

Desktop: Electron (it pins one Chromium and V8, which also helps float determinism) plus the active Steam bindings `@pipelab/steamworks.js` or `steamworks-ffi-node`.

Risks:
- **Vampire Survivors** left Phaser + Electron for Unity over slowdowns at huge enemy counts and Electron launch failures on some PCs. We have dozens of enemies, not thousands, but plan to profile early and keep hot state in typed arrays.
- Electron's size (about 100 MB+) and the Steam overlay hack.
- No editor: arenas are authored in data or with a small tool of our own.
- No realistic console path. Keeping the sim pure keeps a later native port possible.

### Phaser 4 as renderer

v4.0 shipped in April 2026 with a rebuilt WebGL renderer and a unified filter system; 4.2.1 came out in July, and the repo has been quieter since August. Phaser brings more built in than Pixi: cameras, tilemaps, particles, audio, a loader, and Phaser Editor v5 (beta). But it owns the rAF loop and the scenes. Our accumulator would run inside `update()`, and Phaser's tweens, timers and particles must stay cosmetic. It sits behind the same `Renderer` interface as Pixi, so the two can be swapped.

### Godot 4.7 (the strongest native option)

4.7.2 (Aug 2026) is MIT, with a real editor, mature 2D and pixel tools, particles, shaders and 2D lights.

Web export:
- Single-threaded, about 5–10 MB, and it needs no special headers.
- **C# can't export to web**, so the language would be typed GDScript.

Determinism: the engine isn't deterministic, so the sim would be plain GDScript classes with ints or fixed-point maths and no engine physics.

Netcode: netfox (active) or our own GGPO-style layer; GodotSteam for Steam.

Claude's side:
- Text scenes, CLI export and GUT or gdUnit4 tests in headless mode are good for driving it.
- But `--headless` renders no pixels, so screenshots need a real window (`--write-movie`).
- LLM knowledge of Godot is mixed up with Godot 3 syntax.

Cost:
- Everything is ported: rules, sim and renderers.
- GDScript is slow when hundreds of entities are re-simulated under rollback; hot paths may need C++ GDExtension.

Choose it if a level editor and engine-grade VFX tooling matter more than reuse and link-first iteration.

### Bevy 0.20 + ggrs + matchbox

This is the best ready-made rollback stack: bevy_ggrs, cheap ECS snapshots, matchbox P2P that works browser to browser and native, built-in desync checks, and WASM builds. But:
- Every release breaks the API, and LLMs generate stale Bevy code.
- bevy_ggrs and matchbox trail Bevy by one or two versions.
- Rust compile times slow the build, test and look loop.
- There is no editor, and the pixel camera and particles are DIY.
- It is a full rewrite.

### Also considered

- **Unity 6 + Photon Quantum:** the only turnkey deterministic rollback (Q48.16 fixed-point, proven in co-op horde games). It is ruled out by vendor lock-in and fees, GUID-laden YAML scenes that agents corrupt, slow domain reloads, and weak browser links.
- **MonoGame / FNA:** Magicka's own XNA lineage, very well known to LLMs, and pure code. But the web path is community-grade (KNI, an FNA wasm port), and the particles, UI and netcode are all DIY.
- **Defold:** the best link builds (about 1 MB), text scene files and Lua. It has no rollback libraries, a small community, thin VFX tooling, and LuaJIT vs plain Lua is a determinism risk.
- **Excalibur.js:** TS-native and determinism-aware (`fixedUpdateFps`, `physics: false`). But it is pre-1.0 and its own ECS would duplicate our World; Pixi is the cleaner base.
- **GameMaker:** pixel-native, with built-in rollback, and its new runtime becomes free on 2027-01-01. But it is driven through the IDE and its project files are hard for an agent to drive.
- **KAPLAY, Cocos, PlayCanvas, Babylon/Three, Construct, GDevelop, LÖVE, raylib/SDL3, Heaps, Macroquad, Fyrox:** each is a poorer fit on reuse, AI-drivability, maturity or 2D focus. Three or Babylon are worth a look only if we later want real 2.5D lighting.

## Architecture that holds for any choice

- `step(state, inputs) -> state` with no renderer, DOM, time or async inside it. Inputs are compact per tick: buttons, element presses, and a quantised aim.
- Hot state lives in struct-of-arrays (typed arrays), so a snapshot is a few memcpys and a state hash is one pass. At a few hundred entities that is about 100 KB, cheap to copy 8 times per frame.
- Cosmetic VFX live in a view layer that reads sim state and an event stream keyed by (tick, entity, kind). It uses its own RNG and may use `Math.sin`. Puddles and burning grass are sim; their shimmer is view.
- **Pitfalls to avoid:**
  - Map, Set or object iteration whose insertion order differs between peers.
  - Inconsistent sort comparators.
  - `Date.now`, `performance.now`, `setTimeout` or promises in logic.
  - Variable dt.
  - NaN.
  - Reading devices mid-tick instead of from the input record.
- **Verification:**
  - Golden replays (seed and inputs) that assert a final state hash.
  - The same replay run on V8 (node) and SpiderMonkey (headless Firefox) to catch divergence between engines.
  - Per-tick hashes exchanged in multiplayer, as Factorio does.
  - Screenshot filmstrips from fixed replay frames.
  - Fuzzing with random inputs for 10k ticks, then asserting no NaN and bounded entity counts.

## Open for the user

- The engine and stack. Claude recommends **PixiJS v8 + our own TS sim + Electron later**.
- Lockstep first, upgradeable to rollback (Claude recommends it).
  *(Decided, then superseded by rollback: see the decisions log.)*
- Whether a visual level editor matters. It is the main reason to pick Godot.
- When to decide the desktop wrapper (Claude: Electron, decided at the first Steam build).

## Key sources

- Godot 4.7 release notes: https://godotengine.org/releases/4.7/
- Godot C# web export: https://forum.godotengine.org/t/is-there-an-update-on-exporting-c-projects-to-web/128821
- Bevy 0.20: https://bevy.org/news/bevy-0-20/
- matchbox: https://github.com/johanhelsing/matchbox
- PixiJS blog: https://pixijs.com/blog
- Phaser v4: https://github.com/phaserjs/phaser/releases/tag/v4.0.0
- Vampire Survivors engine move: https://www.pcgamer.com/vampire-survivors-was-such-a-big-hit-its-getting-a-whole-new-engine
- Nuclear Throne Together: https://yal.cc/introducing-nuclear-throne-together/
- Magicka patch notes: https://co-optimus.com/article/5416/latest-magicka-patch-brings-network-stability-mostly.html
- Gaffer on Games, deterministic lockstep: https://gafferongames.com/post/deterministic_lockstep/
- Gaffer on Games, floating-point determinism: https://new.gafferongames.com/post/floating_point_determinism/
- Factorio Friday Facts on desyncs: https://factorio.com/blog/post/fff-188
- Photon Quantum: https://doc.photonengine.com/quantum/current/concepts-and-patterns/mispredictions-and-entity-views
- Rapier determinism: https://www.rapier.rs/docs/user_guides/bevy_plugin/determinism
- Steam Networking: https://partner.steamgames.com/doc/api/ISteamNetworking
- steamworks.js: https://github.com/ceifa/steamworks.js
- GameMaker runtime licence change: https://www.gamingonlinux.com/2026/10/gamemaker-announce-their-next-gen-runtime-gmrt-will-be-free-for-commercial-use/
