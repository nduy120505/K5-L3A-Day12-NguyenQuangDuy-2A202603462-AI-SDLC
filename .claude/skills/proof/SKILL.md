---
name: proof
description: Regenerate and check verification evidence for a phase (tests, bot playthroughs per night, determinism, error codes, speed). Use before tagging a phase.
---
1. `npm test` must be green. If a test fails, fix the code, or fix the test **with a written reason** in `docs/notes/ai-log.md`. Never weaken an assertion just to pass.
2. `npm run proof -- phase-N` writes `docs/proof/phase-N/` from the real CLI. Never hand-edit those files.
3. Read `docs/proof/phase-N/README.md`: determinism must be `true`; error cases exit 2/1; speed ≪ 30 s.
4. Report bot losses honestly (bot quality ≠ game correctness).
5. UI-only requirements (HUD, audio, menus, FPS ≥ 30 at 1280×720) need manual play + screenshot in `docs/proof/phase-N/`.
