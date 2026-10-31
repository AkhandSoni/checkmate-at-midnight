# CHECKMATE AT MIDNIGHT

> “Before dawn, your reign ends.”

Lady Scarlet's letter asked you to reach Blackrook Manor before midnight.

You arrived too late.

The King lies beside an unfinished chessboard. The gates are locked. Somewhere inside the house, five people are deciding how much of the truth they can afford to tell you.

A scrap of cloth. An interrupted account. A detail that sounded harmless the first time you heard it.

You are Detective Knight. Walk the rooms, question the household and decide what the evidence actually proves. You only get one question at each interrogation. Choose carefully.

**[Enter Blackrook Manor →](https://akhandsoni.github.io/checkmate-at-midnight/)**

## Inside the manor

- Six connected, furnished rooms to investigate.
- A cast of dressed chess pieces, led by a horse-headed detective in a fedora.
- Two questions at every committed story decision.
- Physical clues, witness statements and a personal case notebook.
- An overhead mansion map with routes through the connected rooms.
- A phone joystick, nearby-object investigate button and touch menu.
- Multiple verdicts, with a recap of the choices that brought you there.
- Local saves, an ending gallery, music and sound settings.

There is no real-time countdown. Take your time. Read the evidence twice. Every question route can still be solved through careful room searches before you commit a verdict.

## Controls

| Control        | Action                   |
| -------------- | ------------------------ |
| WASD / arrows  | Move                     |
| Shift          | Move faster              |
| E              | Inspect or speak         |
| 1 / 2          | Select a dialogue choice |
| J              | Open the notebook        |
| Esc            | Close a panel or pause   |
| F              | Toggle fullscreen        |
| M              | Mute / restore sound     |
| Arrows + Enter | Navigate menus           |

On a phone, drag the joystick to move, tap the nearby-object button to investigate, and use **Menu** to pause or change settings. **Notebook**, **Map** and dialogue choices support touch. Phones play in **landscape**. Portrait shows a rotate prompt and freezes the current screen without losing progress. Fullscreen is requested when turning sideways or on the next tap; a Fullscreen button remains available if a gesture is required. Browsers without element fullscreen keep their navigation controls visible. Releasing the joystick, opening a panel or rotating the phone clears movement.

A WebGL 2 browser is required. Phones start with soft shadows disabled and a lower rendering resolution; Settings can override shadows. Saves stay in the browser where you play.

## The DSA behind the investigation

This is a DSA assignment built as a playable mystery. Open **Pause → DSA presentation → Open DSA visualizer** to inspect the actual structures used by the game.

| Structure            | What it does                                              | Source                              |
| -------------------- | --------------------------------------------------------- | ----------------------------------- |
| Binary decision tree | Connects each committed question to two possible branches | [narrative.ts](src/narrative.ts)    |
| Path/history stack   | Records your route through the investigation              | [engine.ts](src/engine.ts)          |
| Evidence Set         | Stores unique facts and checks deductions                 | [narrative.ts](src/narrative.ts)    |
| DFS stack            | Executes preorder traversal                               | [traversal.ts](src/traversal.ts)    |
| BFS queue            | Executes level-order traversal using a head index         | [traversal.ts](src/traversal.ts)    |
| Room graph           | Connects six rooms through seven doorways                 | [layout.json](src/data/layout.json) |

The presenter includes play/pause, step, reset, speed and depth controls, plus a live stack/queue, visited nodes and your selected path. Demonstration presets contain spoilers and do not unlock normal gallery achievements.

The investigation tree has **127 nodes**, including **64 contextual review leaves**, and height **6 edges**. Adding verdict branches produces **639 nodes**, **320 terminal contexts** and maximum height **9 edges**. Terminal contexts are distinct from ending types. This is a binary decision tree, not a binary search tree.

DFS and BFS each take O(n) traversal time. DFS uses O(h) pending stack space on this binary tree; BFS uses O(w) active frontier space. The implementation retains its queue prefix and visited history, each using O(n) storage. Evidence membership is average O(1), and parent-link path reconstruction is O(h).

## Run locally

Use Node 24 (`.nvmrc` is included).

```bash
npm ci
npm run dev
```

Open the URL Vite prints, normally http://127.0.0.1:5173.

```bash
npm test
npm run build
npm run preview
```

The logic tests cover 81,920 route/clue/action combinations, recovery of all 64 question routes, tree structure, DFS/BFS, notebook consistency, connected navigation and chess positions.

With the dev server running, run the desktop and phone browser checks in another terminal:

```bash
npm run test:browser
npm run test:mobile
npm run test:display
GAME_URL=http://127.0.0.1:5173 npm run test:layout
```

The browser checks use system Chromium when available. Otherwise run `npx playwright install chromium`; `CHROMIUM_PATH` can select another Chromium installation. JSON reports and screenshots go into `test-results/`. `test:layout` also works against `npm run preview` on its default port 4173. Browser save checks exercise 960 legacy cases, their updated equivalents, and forged outcomes.

The player audit and fixes are documented in [PLAYTEST_REPORT.md](PLAYTEST_REPORT.md) (contains spoilers). The production build goes into `dist/`. GitHub Actions tests and deploys pushes to `main`; `BASE_PATH=/checkmate-at-midnight/` supports the Pages project URL.

Players need no installation, backend, account or Blender. The game uses TypeScript, Three.js, Vite and browser LocalStorage. Asset credits and licences are in [ASSET_CREDITS.md](ASSET_CREDITS.md) and [public/legal/](public/legal).

The story guide and full route catalogue are intentionally kept out of this repository. Discover the night for yourself.

## Deploy to Cloudflare Workers

The game uses Workers static assets; no backend Worker or database is required.

```bash
npx --yes wrangler@4.153.0 login
npm run deploy
```

For Cloudflare Git integration, connect this repository with build command `npm run build` and deploy command `npx wrangler@4.153.0 deploy`. Leave `BASE_PATH` unset: Workers serves this build at the domain root. The `wrangler.jsonc` configuration publishes only `dist/`; the story guide and local authoring files are not uploaded.
