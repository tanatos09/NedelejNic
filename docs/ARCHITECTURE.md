# Architektura (aktuální implementace)

## Shrnutí

- **Backend** doručuje konfiguraci levelu a ověřuje výsledky; levely jsou **JSON soubory** v `levels/` (viz `server/src/levels.ts`).
- **Frontend** spouští **action-based engine** (`LevelRunner`, `TimelineScheduler`) a **neposílá žádné HTTP požadavky během fáze „playing“** (mimo samotný běh levelu: load level, odeslání výsledku).

---

## Backend (`server/`)

| Oblast | Popis |
|--------|--------|
| Express | `app.ts` — CORS, JSON, routery `/auth`, `/`, `/admin`. |
| Hra | `GET /level/:id` — načte level z `levels/**`, přidá `signature`. `POST /result` — validace JWT, podpisu, role; u PLAYER inkrementuje level. |
| Auth | JWT middleware (`requireAuth`, `verifyJWT`). |
| Data | Prisma (uživatelé, role, ban, …). |

---

## Frontend — vrstvy

```
GamePage (fáze UI: loading | ready | playing | ended)
    │
    └── EngineHost
            ├── LevelRunner (newEngine)
            │       ├── TimelineScheduler
            │       ├── ActionDispatcher → StateStore, AudioSystem, EffectSystem, HookRuntime
            │       └── TrapSystem
            └── InputManager (DOM → InputEvent, jen když je hra aktivní)
```

- **EngineHost** (`engine/core/EngineHost.ts`): vlastní instanci `LevelRunner` a `InputManager`; `setActive(playing?)` zapíná/vypíná vstup a při pauze odpojí vstupy od enginu.
- **LevelRunner**: `load` / `preload` / `start`; po ukončení timeline **`finishLevel()`** (úklid + `onSuccess` / `onFail`).
- **Čas**: scheduler používá `setTimeout` / `clearTimeout` vázané na `window` (ochrana proti „Illegal invocation“).

---

## Vstup (Input)

- **Zapnuto jen při** `phase === 'playing'` na `GamePage` (viz `useEffect` + `EngineHost.setActive`).
- **Grace period** pro `mousemove` po attach (`InputManager` — výchozí 800 ms, engine host může předat jiné hodnoty).
- **Pravidla**: mapování na vstupy v `TimelineScheduler.onInput` (pasti, pak zakázané režimy pravidel).
- **Ochrana UI**: uzly s `data-no-game-input` nepropagují fail do enginu tam, kde to InputManager respektuje.

---

## Herní fáze (GamePage)

1. **loading** — `api.getLevel`, `host.load` (vč. nahrání proměnné `karma` do enginu) + `preload`.
2. **ready** — obrazovka „Začít nedělat nic“.
3. **playing** — `host.start()`, běží scheduler (+ krátké „zbrojení scény“ před startem času).
4. **ended** — `finishLevel()` smaže UI vrstvy, přehraje volitelnou **závěrečnou Karrelovu hlášku** (`level.ending`), aktualizuje **karmu** (+1/−1) a odešle `POST /result`. Pak se ukáže okno s tlačítkem **Pokračovat** → načte `id + 1` (po výhře i prohře).

---

## Role

| Role | Chování (zkratka) |
|------|-------------------|
| PLAYER | Jen aktuální `user.level`; po skončení tlačítko **Pokračovat** na další blok (`id + 1`). |
| DEV | Ladící panel, libovolný level z API, success neposouvá level v DB. |
| ADMIN | Jako DEV + admin rozhraní. |

Konkrétní admin API: [`ADMIN_API_CONTRACT.md`](./ADMIN_API_CONTRACT.md).

---

## Starší kód

- `LevelEngine.ts` + starší `InputSystem.ts` — legacy timeline přes `events[]`. Pro nový obsah používej **action** JSON a `LevelRunner**.

---

## Dokumentace

- Stav kódu: [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md)  
- Formát levelu: [`LEVEL_FORMAT.md`](./LEVEL_FORMAT.md)
