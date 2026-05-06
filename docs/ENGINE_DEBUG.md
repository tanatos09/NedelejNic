# ENGINE DEBUG – Validator + DEV Mode

Tento dokument popisuje debug rozšíření pro `client/src/engine/newEngine/`:

- **Level validator** (load-time, runtime-safe)
- **DEV/ADMIN debug tools** (restart/skip + inspekce scheduleru/state)

Požadavky:
- kompatibilní s `docs/ENGINE_DESIGN.md` a `docs/ENGINE_HARDENING.MD`
- žádné runtime requesty během `playing`
- debug nesmí měnit determinismus

---

## 1) Level validator

### 1.1 Kdy běží

Validator běží v `LevelRunner.load(...)` **před startem enginu**.

- výsledkem je seznam **errors** a **warnings**
- **neblokuje** běh enginu (jen reportuje do event logu)

Soubor:
- `client/src/engine/newEngine/LevelValidator.ts`

Integrace:
- `client/src/engine/newEngine/LevelRunner.ts` (v `load()`)

### 1.2 Co validuje

- **Struktura levelu**
  - `id`, `type`
  - `assets` (doporučeno; pokud chybí → warning)
  - `rules` (pokud existuje, musí mít validní hodnoty)
  - `timeline` pro `type:"action"`
- **Timeline kroky**
  - `label` (string, varuje při duplicitě)
  - `at` (string, parsovatelné na ms)
  - `when` (povolená schémata z designu)
  - `do` (musí být jedna z podporovaných akcí)
- **Action parametry**
  - např. `audio.play` musí mít `kind` + `file`
  - `ui.layer` musí mít `op/id/type`
  - `flow.random` musí mít `choices[]`
  - `level.end` musí mít `result`

### 1.3 Asset validace (bez networku)

Validator kontroluje `assets.voices/music/sounds` takto:

- Pokud je k dispozici build-time manifest, ověří existenci filename v manifestu.
- Pokud manifest není naplněný (aktuálně je prázdný), validator loguje **warning**:
  - `asset existence not verifiable (manifest empty)`

Manifest:
- `client/src/engine/newEngine/assetManifest.ts`

Důležité:
- validator **nikdy necrashne** engine kvůli missing assetům
- missing assety jsou **warning** (ne error)

---

## 2) Debug / Developer mode (DEV/ADMIN)

### 2.1 Level controls

V pauza panelu (DEV/ADMIN) jsou přidané akce:

- **RESTART (ENGINE)**: plný reset přes `LevelRunner.restart()`
  - znovu `load()` → validator report → `preload()` → `start()`
  - nemění determinismus (pouze resetuje běh)
- **SKIP (SUCCESS)**: okamžité ukončení přes `LevelRunner.skipSuccess()`
  - stop scheduler
  - stop audio/effects
  - zavolá `onSuccess()`

### 2.2 Timeline inspector

Engine poskytuje snapshot scheduleru:

- `pc` (program counter)
- `jumpCount`
- `waiting` (none / at / when)
- `steps.length`

API:
- `TimelineScheduler.getDebugState()`
- `LevelRunner.getDebugSnapshot()`

### 2.3 Active action monitor

V inspectoru se zobrazí:

- `rules` snapshot
- počet `traps` (+ enabled)
- aktivní `effects`
- počet `vars`

Zdroj:
- `StateStore.getRulesSnapshot()`
- `StateStore.getTrapsSnapshot()`
- `StateStore.getEffectsSnapshot()`
- `StateStore.getVarsSnapshot()`

### 2.4 Real-time debug log

Event log (`EventLogEntry`) obsahuje:

- `scheduler.start`
- `engine.start`
- validátor: `validate.warn:*`, `validate.error:*`
- `flow.random` volby (deterministické)
- trap outcome (`trap.fail`, `trap.success`, `trap.setVar`)
- asset preload timeout/missing (`asset.preload.timeout`, `asset.missing`)

Log je jen observability:
- nijak nemění běh scheduleru ani RNG

---

## 3) Jak používat

- **X = PAUSE** (DEV/ADMIN, v `phase === "playing"`)
- V pauze:
  - **RESTART (ENGINE)**: kompletní restart levelu
  - **SKIP (SUCCESS)**: okamžité ukončení success
  - **ENGINE INSPECTOR**: pohled na `pc/waiting/rules/traps/effects/vars`

---

## 4) Known limitations

- Asset existence je “best effort”:
  - pokud `assetManifest.ts` zůstane prázdný, validator hlásí warning k souborům v `assets.*`.
- “Active action monitor” sleduje stav přes snapshoty (ne per-action hook list).
- **DEV step**: `debugNextStep` / `debugSkipToEnd` na `LevelRunner` jsou zapojené z GamePage (ne no-op); ovlivňují scheduler mimo běžné časování — jen pro ladění.

