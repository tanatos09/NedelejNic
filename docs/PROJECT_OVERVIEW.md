# Přehled projektu Nedělej nic (stav kódu)

Tento dokument popisuje **skutečnou implementaci** v repozitáři. Doplňuje kreativní vizi v `AI_PROJECT_CONTEXT.md` a detailní spec v `ENGINE_DESIGN.md`.

---

## 1. Co aplikace dnes umí

### 1.1 Účty a role

- Registrace / přihlášení (JWT v `localStorage`, `httpClient` přidává token).
- Role: **PLAYER**, **DEV**, **ADMIN** (DB přes Prisma).
- **PLAYER**: po přihlášení jde na **GamePage**, hraje level podle `user.level`.
- **DEV / ADMIN**: po přihlášení výchozí stránka je **AdminDashboard**; do hry přes navigaci zpět na hru (`GamePage`).
- Mobilní zařízení: `App.tsx` zobrazí hlášku „jen pro desktop“, hra se nespustí.

### 1.2 Backend (Express, `server/`)

- **Auth**: `/auth/register`, `/auth/login`, `/auth/me` (viz `routes/auth.ts`).
- **Hra**: `GET /level/:id` — vrátí JSON levelu + **HMAC podpis** (`signLevel(userId, levelId, endTime)`).
- **`POST /result`**: validace podpisu, role, ban; u PLAYER inkrementuje `level` při úspěchu/ neúspěchu; u DEV/ADMIN neposouvá level automaticky.
- **Level data**: načítají se ze **souborů v repozitáři** `levels/**/*.json` — funkce `getLevelConfig(id)` v `server/src/levels.ts`. Priorita: `levels/tests/` před zbytkem `levels/`. **Žádné procedurální generování** v runtime ani v tomto loaderu.
- **Admin API**: uživatelé, role, ban, úroveň, reset, audit (`docs/ADMIN_API_CONTRACT.md`).

### 1.3 Klient (React + Vite, `client/`)

- **Herní smyčka**: `GamePage` — fáze `loading → ready → playing → ended` (žádná „intro“ fáze).
- **Engine**: **`LevelRunner`** + **`TimelineScheduler`** + **`ActionDispatcher`** (`client/src/engine/newEngine/`). Starší **`LevelEngine`** (`LevelEngine.ts`) a část **`InputSystem`** zůstávají v repu kvůli kompatibilitě / legacy, **produkční běh je přes `EngineHost` → LevelRunner**.
- **Vstup**: **`InputManager`** (`engine/input/InputManager.ts`) — attach jen když `phase === 'playing'` (řídí `EngineHost.setActive`). Pravidla `forbidden | allowed | required` pro klik / myš / klávesnici / scroll / dotyk. `data-no-game-input` vylučuje UI od failů.
- **Časová osa**: akce `text.set`, `audio.play/stop`, `ui.layer` (vč. `type:"image"` dlaždic pro captcha), `effect.*`, `rules.set`, `trap.set`, `state.*`, `flow.*`, `level.end`, `game.input.enable/disable` (viz `LevelValidator.ts` a `types.ts`). *Pozn.: `hook.run` je v kódu, ale ne ve validátoru — v datových levelech se nepoužívá.*
- **Karrel + karma**: sekce `karrel.behaviors` reaguje na vstup paralelně k timeline; levely mohou přes `flow.branch` / `whenVar` větvit dialog podle proměnné **`karma`** (lokální skóre, výhra +1 / prohra −1, `client/src/services/karma.ts`).
- **Dokončení levelu**: `finishLevel()` v `LevelRunner` smaže UI vrstvy, přehraje volitelnou **závěrečnou hlášku** (`level.ending` → `success`/`fail`: caption, subtitle, voice, holdMs) a teprve po `holdMs` volá `onSuccess` / `onFail`. UI pak ukáže okno s tlačítkem **Pokračovat** (načte `id + 1` po výhře i prohře).
- **DEV nástroje**: pauza (X), restart engine, skip success, **debug next step** / **skip to end** (`debugNextStep`, `debugSkipToEnd`), inspektor scheduleru (`getDebugSnapshot`).
- **Statické assety**: hlasy `/assets/voices/`, hudba `/assets/music/`, zvuky `/assets/sounds/` — hostované z `client/public/` (Vite).

### 1.4 Levely na disku (`levels/`)

- **`levels/tests/`**: testovací sady (např. `01_wait.json` … `22_combined.json`) — typicky `type: "action"`, `timeline`, `rules`, `end`, `assets`.
- **`levels/templates/`**: šablony (wait, chaos, …).
- JSON je **source of truth**; server je jen načte a podepíše.

---

## 2. Mapa adresářů (zjednodušeně)

```
client/src/engine/
  core/EngineHost.ts       — vstup + LevelRunner
  newEngine/               — LevelRunner, TimelineScheduler, ActionDispatcher, AudioSystem, …
  input/InputManager.ts    — DOM → InputEvent
  effects/HookRuntime.ts   — hook.run
  LevelEngine.ts           — legacy engine (events[]), nepoužívá se jako hlavní runtime

server/src/
  levels.ts                — načtení JSON z ../../levels, signLevel
  controllers/gameController.ts

levels/
  tests/*.json             — úrovně podle id
  templates/*.json
```

---

## 3. Síťové požadavky (realita vs pravidlo)

- **Během `playing`**: žádné API volání — drží se to (žádný `fetch` v engine loop).
- **Po skončení**: jeden `POST /result` s výsledkem a podpisem.

---

## 4. Související dokumentace

| Dokument | Účel |
|----------|------|
| `README.md` | Instalace, spuštění, stručná struktura |
| `docs/LEVEL_AUTHORING_GUIDE.md` | **Kompletní průvodce tvorbou levelů** (akce, Karrel, pasti, karma, ending, recepty) |
| `docs/LEVEL_FORMAT.md` | Formát JSON levelu (action + timeline) |
| `docs/ARCHITECTURE.md` | Vrstvy FE/BE, input, fáze UI |
| `docs/ENGINE_DESIGN.md` | Hluboký návrh akcí a scheduleru |
| `docs/ENGINE_HARDENING.MD` | Tvrdá pravidla runtime |
| `docs/ENGINE_DEBUG.md` | Validator, DEV nástroje |
| `docs/AI_PROJECT_CONTEXT.md` | Vize produktu + technické principy |
| `docs/ADMIN_API_CONTRACT.md` | Admin REST API |

---

## 5. Známé limity (stručně)

- `assetManifest.ts` je prázdný — validátor assetů hlásí varování, ne chyby.
- `type: "custom"` + `module` není plně dokončený plugin systém bez další integrace.
- Podpis levelu zahrnuje `userId`, `levelId`, `end.time` — nehashuje celý obsah timeline (anticheat je lehký).

Tento soubor by měl být aktualizován při větších architektonických změnách.
