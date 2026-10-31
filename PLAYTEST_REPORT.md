# Player audit and fixes

Reviewed the playable game from arrival through the verdict, including room navigation, questioning, evidence, notebook, saves, galleries, controls and presentation tools. This report contains mystery spoilers.

## Investigation and continuity

| Finding                                                                                                                      | Change                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Choosing certain questions made the correct verdict impossible even after every room was searched.                           | Matching entries in the duty book and study ledger can establish opportunity. All 64 question routes can now recover through exploration before a verdict is committed. |
| A flask alone established poison without examining the drink or its dosage record.                                           | Poison requires the flask, goblet residue and medicine register together.                                                                                               |
| An admission or burned account fragment established financial motive without checking its source.                            | The study ledger must corroborate the account fragment or testimony. Clue descriptions explain what can be compared.                                                    |
| Examining the wound could add Ash’s confession about the will before he was questioned.                                      | The crest is an object observation. The notebook credits Ash only when his answer supplied it; his confession appears only in the chosen statement.                     |
| Several facts from one answer produced duplicate witness statements.                                                         | Statements now show each committed question and response once, with its associated facts.                                                                               |
| Dialogue and clues referred to accounts, a missing draught, or a shawl explanation the player might not yet have discovered. | Wording now stands on its own regardless of search order or question branch.                                                                                            |
| Ending descriptions assumed the player had heard particular confessions or lacked a specific proof category.                 | Verdict prose and recaps describe the actual case requirements without inventing earlier discoveries.                                                                   |

The two-choice investigation, both interrogation orders, six ending types, 127-node investigation tree and 639-node full tree remain intact. Choosing an innocent suspect still produces a wrongful verdict. A final confrontation still ends an incomplete case.

## Navigation, saves and interface

| Finding                                                                                            | Change                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The map marked rooms without explaining their connected route; destination hints could stay stale. | Routes follow the real, bidirectional doorway graph. The next lead is highlighted by default; custom destinations persist in saves and clear on arrival. |
| Floor-plan arrow keys treated the six rooms as a single column.                                    | Up/down navigation follows the actual three-column arrangement.                                                                                          |
| The map route and legend could extend below the notebook reading area at laptop height.            | The map, route and legend share a responsive layout. Notebook content remains scrollable on short phone screens.                                         |
| Continuing during the introduction restarted the arrival conversation.                             | Each arrival line is saved and resumed individually. Pending investigation responses are also preserved.                                                 |
| Updated proof rules could invalidate an otherwise legitimate completed save.                       | Old verdicts are checked against their original requirements. A changed result reopens the investigation with choices and clues preserved.               |
| Ending previews could leave relocated actors, smoke or open gates in the investigation.            | Leaving a preview restores the appropriate cast and scene without changing the saved case.                                                               |
| Keyboard-only play could leave audio unstarted or suspended.                                       | Keyboard interactions start/resume audio; resuming exploration restores the current room ambience.                                                       |
| Holding activation keys could skip several modal screens.                                          | Repeated activation events are blocked while a panel is open.                                                                                            |
| A presentation shortcut was available from the title without an active case.                       | Jumping to the current lead requires an active investigation. Model viewing remains available separately.                                                |
| Gallery storage accepted inherited property names and duplicate IDs.                               | Gallery entries must be owned ending IDs and are deduplicated. Storage read failures are handled.                                                        |
| `npm test` included an obsolete local test requiring an absent authoring pack.                     | The test command names the maintained, self-contained suites. Browser checks and their dependencies are now tracked in the repository.                   |

## Phone support

- A captured thumb joystick controls movement in screen directions, with proportional movement and a central dead zone.
- Menu and nearby-object investigation buttons work with a second finger while moving. Opening any panel stops movement and hides the controls.
- Touch cancellation, lost capture, blur and viewport changes reset the joystick.
- Touch actions suppress the follow-up native click so opening dialogue cannot accidentally choose its first answer.
- Successive taps work across newly rendered screens; the old global double-click filter could block continued dialogue.
- Back and return controls make dialogue, verdicts and the opening letter usable without Escape.
- Landscape is the required phone orientation. Portrait shows a rotate prompt and freezes the existing screen without losing progress. Safe-area padding protects controls near notches and home indicators. The landscape HUD, joystick, two-column menus/dialogue and map/sidebar layout leave more of the world visible.
- Phone rendering uses a lower pixel-ratio cap, defaults shadows off, and omits the second 3D portrait renderer during dialogue. The landscape follow camera keeps characters and room details readable on short screens.

## Customizable input

- Menu / Pause and Settings both link to Controls.
- Keyboard bindings support single-key remapping for movement, run, investigation, notebook, map, pause/back, fullscreen, audio, both choices and the DSA viewer. Duplicate or reserved assignments are rejected. Movement aliases are independent; releasing one does not cancel another held key. Esc remains a recovery key.
- Shortcut labels follow the saved bindings. Draft bindings do not affect play until Save, and Cancel discards edits.
- All six touch controls can be dragged independently and scaled from 70% to 170%, with a minimum touch target and safe-area clamping. A compact editor mode exposes controls beneath the size toolbar.
- The default joystick is now 140 pixels wide and sits farther inward, with at least 32 pixels of bottom clearance at the tested phone sizes.
- Layout and binding preferences are validated and stored in `blackrook-controls`, independently of investigation progress. Reset can restore just keyboard bindings, just the phone layout, or both.
- Touch buttons activate once on release, including after a captured drag or when used with a second finger. The subsequent native click is suppressed so it cannot activate newly opened UI.
- `npm run test:controls` tests actual remapped gameplay, touch drags and sizing, persistence through reload, save/cancel/reset, and unchanged investigation progress. Pure tests cover conflicting keys, damaged preferences, movement aliases and bounds at different phone sizes.

## Verification

- `npm test`: 17 passing logic tests, including 81,920 route/clue/action combinations and recovery of every question route.
- `npm run build`: TypeScript and production bundle build pass.
- `npm run test:browser`: actual WebGL gameplay covers every interaction target, both question orders, all six endings, 18 ending scenes, notebook, saves, gallery, chess viewer, settings and DFS/BFS controls.
- Collision exploration reaches all 20 interaction targets from the starting position. All seven doors are also crossed in both directions using held movement input.
- Save compatibility checks cover 960 earlier cases, their current equivalents, and forged outcomes. Both newly insufficient and newly complete earlier cases retain their progress.
- `npm run test:layout`: 48 rendered screen checks at 1280×720 and 1440×1000 cover screen bounds, horizontal overflow, menus, notebook pages, map legend and tree labels.
- `npm run test:mobile`: Chromium touch emulation at 667×375, 844×390 and 932×430 covers joystick drags, cancellation, two-finger Menu use, touch choices, Back, notebook, map, saves, verdicts, endings and presentation screens. A normal case is completed by touch at 844×390.

`npm run test:display` additionally verifies the portrait gate, native fullscreen on a landscape gesture, freezing and resuming across rotation, respecting an explicit fullscreen exit, and fallback behavior when fullscreen is rejected or unsupported. The controller attempts native landscape locking when available; browser activation rules can require a tap before fullscreen.

Reports and screenshots are written under `test-results/`. Desktop and phone checks use Chromium; physical iOS/Android devices and other browser engines have not been tested. The build retains Vite’s existing size advisory for the Three.js vendor chunk.
