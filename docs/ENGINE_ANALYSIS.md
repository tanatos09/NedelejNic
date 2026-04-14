# ENGINE ANALYSIS (aktuální stav)

> Cíl: pochopit současnou architekturu “level enginu” před refaktoringem / výměnou enginu.  
> Poznámka: tento dokument je čistě analytický (bez změn v kódu).

## 1) Kde se nachází současný level engine

### Frontend (vykonávání levelu v prohlížeči)

- **Level engine (runtime + časování eventů)**: `client/src/engine/LevelEngine.ts`
  - `LevelEngine` – state machine (`'idle' | 'running' | 'paused' | 'ended'`), plánování eventů, progress timer, DEV nástroje (pause/step/skip/log/snapshot-like data).
  - `preloadAssets(config)` – aktuálně jen **audio preload** přes `new Audio('/assets/audio/<file>')`.
- **Input systém**: `client/src/engine/InputSystem.ts`
  - `InputSystem` – správa DOM listenerů (attach/detach), filtrování UI elementů přes `data-no-game-input`, grace period pro mousemove.
- **Orchestrátor hry (UI + životní cyklus)**: `client/src/pages/GamePage.tsx`
  - Fázování obrazovek: `Phase = 'loading' | 'intro' | 'playing' | 'ended'`
  - `loadLevel(levelId)` načítá config z backendu, preloade assety, vytváří `LevelEngine`, startuje ho, odesílá výsledek (`/result`).
- **Spouštění aplikace / routing**: `client/src/App.tsx`
  - rozhoduje `auth/game/admin` pohled; předává `onAdmin` do `GamePage`.

### Backend (generování levelů + podpis + validace/progrese)

- **Level data + generátor + signing**: `server/src/levels.ts`
  - `DEFINED_LEVELS` (1–10 ručně), `generateLevel(levelNum)` (procedurální pro vyšší levely)
  - `signLevel(levelId, endTime, userId)` → HMAC SHA-256 (`LEVEL_SECRET`)
  - `getLevelConfig(levelNum)` vrací definovaný nebo generovaný level
- **Game API routing**: `server/src/routes/game.ts`
  - `GET /level/:id`
  - `POST /result`
- **Game controller**: `server/src/controllers/gameController.ts`
  - `getLevel`: auth + ban + role/level access + podpis a vrácení configu
  - `postResult`: validace signature + role/level access + (PLAYER) increment level
- **Auth middleware**: `server/src/middleware/verifyJWT.ts` (+ alias `requireAuth`)

## 2) Jak se levely načítají

### Datový formát levelu

Spec je v `docs/LEVEL_FORMAT.md` a odpovídá typům v:
- `server/src/levels.ts` (`LevelConfig`, `LevelEvent`, `LevelRules`, `LevelEnd`)
- `client/src/types.ts` (`LevelConfig`, `LevelEvent`, …)

Level má:
- `id: number`
- `rules`: co je považováno za fail input (`mouseMove/click/keyboard/scroll/touch` jako boolean)
- `events[]`: časované eventy (aktuálně `subtitle`, `clear`, `voice`)
- `end`: aktuálně pouze timer (`{ type: 'timer', time: seconds }`)
- `signature`: HMAC podpis z backendu (používá se pro validaci výsledku)

### Runtime tok (frontend)

1. `GamePage` zavolá `loadLevel(user.level)` v `useEffect`.
2. `api.getLevel(levelId)` (`client/src/services/api.ts`) → `httpClient.get('/level/:id')`.
3. Po úspěchu:
   - uloží `config`
   - zavolá `preloadAssets(cfg)` (viz sekce assety)
   - nastaví `phase = 'intro'` a po `introDelay = 2000ms` přepne na `phase = 'playing'`
4. V `playing`:
   - vytvoří `new LevelEngine(cfg, callbacks, devMode?)`
   - uloží do `engineRef`
   - zavolá `engine.start()`
5. Na `onFail`/`onSuccess`:
   - `GamePage` nastaví `phase = 'ended'`, vykreslí end overlay
   - odešle `api.postResult(result, cfg.id, cfg.signature)` (catch ignoruje chybu)

### Runtime tok (backend)

#### `GET /level/:id` (`gameController.getLevel`)

- vyžaduje JWT (`requireAuth` → `verifyJWT`)
- ověří:
  - user existuje a není banned
  - **PLAYER** smí načíst pouze svůj aktuální `user.level`
  - **DEV/ADMIN** smí načíst libovolný level
- sestaví `config = getLevelConfig(levelId)` a doplní `signature = signLevel(config.id, config.end.time, req.user.userId)`
- vrátí JSON: `{ ...config, signature }`

#### `POST /result` (`gameController.postResult`)

- vyžaduje JWT
- ověří:
  - `result` je `success|fail`
  - `levelId` je number >= 1
  - `signature` je string
  - user existuje, není banned
  - **PLAYER** smí poslat výsledek jen pro svůj aktuální level
- recompute signature:
  - `config = getLevelConfig(levelId)`
  - `expected = signLevel(config.id, config.end.time, req.user.userId)`
  - `signature` musí == `expected`
- pro progres:
  - **PLAYER**: `level` se inkrementuje v DB (`prisma.user.update ... increment: 1`)
  - **DEV/ADMIN**: neinkrementuje (devMode), vrací `devMode: true`

## 3) Jak se řeší časování / eventy

### Časování (frontend)

V `client/src/engine/LevelEngine.ts` je timing implementovaný čistě browser API:

- **Eventy**:
  - `setupEvents()` vytvoří pro každý `config.events[i]` `window.setTimeout(..., ev.time * 1000)`.
  - callback volá `executeEvent(i)`.
  - při `resume()` se používá `setupRemainingEvents()` – přepočítá “remaining time” vůči `elapsed` a eventy buď rovnou provede, nebo znovu naplánuje.
- **Konec levelu + progress**:
  - `setupTimer()` spouští `window.setInterval(..., 100)`:
    - počítá `progress = elapsed / (config.end.time * 1000)`
    - když `elapsed >= duration`, engine `stop()` + `onSuccess()`
- **Pause/Resume (DEV)**:
  - `pause()` clearuje timeouty/interval + detach input + state `'paused'`
  - `resume()` dopočítá `pausedElapsed`, reschedule zbývající eventy + attach input + state `'running'`

### “Event systém” (význam v projektu)

Projekt zde nepoužívá obecný event bus (publish/subscribe). “Eventy” jsou:
- **data-driven** položky v `config.events[]`
- **časované** přes setTimeout
- **dispatch do UI** přes callbacky:
  - `onSubtitle(text)` (UI text)
  - `onProgress(progress)` (progress bar)
  - `onEventLog(entry)` (DEV log overlay)
  - `onStateChange(state)` (DEV UI)
  - `onFail(reason)` / `onSuccess()`

`LevelEngine` si navíc vede `eventLog[]` a exposuje snapshot-like strukturu přes getter `snapshot`.

## 4) Jak funguje input (mouse, click, keyboard)

### Kde se input zachytává

- `client/src/engine/InputSystem.ts`:
  - attachuje listenery na `document` pro:
    - `click`
    - `keydown`
    - `scroll`
    - `touchstart`
    - `mousemove` (s odloženou aktivací – grace period)

### Pravidla inputu (level rules)

`InputSystem` dostane `rules` z `LevelConfig.rules`. Pro každý typ akce:
- pokud `rules[ruleKey] === true`, listener se připojí a jakýkoliv relevantní event → `handler.onFail(msg)`
- pokud `rules[...] === false`, daný listener se vůbec nepřipojí (daná akce hráče “nevadí”)

### UI izolace: `data-no-game-input`

`InputSystem` z každého eventu bere `e.target` a dělá:
- `if (target?.closest('[data-no-game-input]')) return;`

Tím pádem UI vrstvy (dev overlay, end screens, error overlay, player info) mohou být interaktivní, aniž by to spustilo fail.

### Životní cyklus listenerů (state-based)

`GamePage.tsx` explicitně řídí, kdy je input aktivní:
- aktivní pouze když `phase === 'playing'` a zároveň není zobrazen dev pause menu overlay (`!showPauseMenu`)
- při změně `phase/showPauseMenu` volá `engine.attachInputListeners()` / `engine.detachInputListeners()`

Pozor: `LevelEngine.start()` momentálně také volá `this.attachInputListeners()` (tj. engine se snaží input aktivovat sám), ale `GamePage` to následně (v praxi) přepíná podle phase/pause overlay. Z pohledu architektury je “zdroj pravdy” pro aktivaci inputu spíš `GamePage` (stav UI/fází).

### DEV klávesa X (pause/resume)

V `GamePage.tsx` je `window.addEventListener('keydown', ..., { capture: true })` pro `KeyX` (jen DEV/ADMIN).
- běží v capture fázi a volá `e.stopImmediatePropagation()`, aby to “přebilo” `InputSystem` (který také chytá `keydown`).
- když `phase === 'playing'`:
  - pokud engine `running` → `engine.pause()`
  - pokud engine `paused` → `engine.resume()`

## 5) Jak se načítají assety (audio, obrázky)

### Audio

Audio je zatím řešeno pouze jako **preload** (bez playback vrstvy):

- `preloadAssets(config)` v `client/src/engine/LevelEngine.ts`:
  - vybere eventy `type === 'voice' && e.audio`
  - pro každý vytvoří `new Audio('/assets/audio/<filename>')`
  - čeká na `canplaythrough` nebo `error` (error taky resolve → preload neblokuje neúspěchem)

Z toho plyne:
- engine očekává statické audio soubory dostupné přes URL `/assets/audio/...` (typicky by to bylo `client/public/assets/audio/...` ve Vite, ale v repozitáři aktuálně **nejsou nalezeny** žádné audio/image/video soubory ani složky `public/assets`).

### Obrázky / video

V aktuálním kódu jsem nenašel asset pipeline pro obrázky/video:
- žádné `import`/`fetch`/loader pro image/video
- žádné statické asset soubory v repozitáři (`*.png/jpg/svg/mp4/webm` – globálně nenalezeno)

To neznamená, že UI nemůže v budoucnu používat image/video, ale v této verzi je engine primárně “subtitle + timer + input fail”.

## 6) Které části kódu by bylo potřeba změnit pro nový engine

Záleží, co “nový engine” znamená (jen interní refactor vs. úplně jiný runtime). Minimální mapování integračních bodů:

### A) Engine core (musí se měnit téměř jistě)

- `client/src/engine/LevelEngine.ts`
  - timing model (`setTimeout/setInterval`) vs nový scheduler
  - definice eventů (`subtitle/clear/voice`) vs nové typy eventů
  - state machine + DEV funkcionalita (pause/resume/step/skip/log)
  - způsob “end condition” (nyní pouze timer)

### B) Input vrstva (podle designu)

- `client/src/engine/InputSystem.ts`
  - pokud nový engine zavede jiné “fail conditions” (např. složitější pravidla, zóny, UI simulace), bude potřeba rozšířit nebo nahradit
  - lifecycle attach/detach je dnes pevně spojen s DOM (`document.addEventListener`)

### C) Orchestrace a UI kontrakt (musí se přizpůsobit API enginu)

- `client/src/pages/GamePage.tsx`
  - vytvoření enginu a propojení callbacků
  - phase machine (`loading/intro/playing/ended`) a timing intro delay
  - DEV overlay (pause menu, event log) je přímo navázaný na engine API (`pause/resume/nextEvent/skipToEnd/resetLevel/getEventLog` a callbacky)

### D) Level formát + backend signing/validace (mění se při změně “source of truth” level dat)

Pokud nový engine změní data, která jsou relevantní pro validaci výsledku, je nutné:
- `server/src/levels.ts` (level schema + generátor)
- `server/src/controllers/gameController.ts` (co se podepisuje a jak se validuje)
- `docs/LEVEL_FORMAT.md` (spec)
- `client/src/types.ts` (TS typy)

Poznámka: dnešní signature je odvozena pouze z `userId`, `levelId`, `end.time`. Pokud se změní např. eventy nebo pravidla, a chcete je “kryptograficky zafixovat”, signature by musela zahrnout i hash eventů/rules (to už je změna backend kontraktu).

### E) Asset systém (pokud nový engine zavede playback/streaming/sprites)

- `client/src/engine/LevelEngine.ts` (nebo nový modul) – dnes je jen preload audio
- přidání/změna statického hostingu assetů (např. `client/public/assets/...`) a pravidel pro bundling

## 7) Rizika při refaktoringu

- **Regrese “0 requestů během levelu”**: dle `docs/AI_PROJECT_CONTEXT.md` je to absolutní pravidlo. Nový engine nesmí během `playing` provádět žádné síťové požadavky (ani na assety, ani na telemetry, ani na “next event”).
- **Input izolace a UI bezpečnost**:
  - současný design stojí na kombinaci:
    - phase-based attach/detach (primární)
    - `data-no-game-input` filtr (sekundární)
  - při refaktoru hrozí návrat k “globálně aktivním listenerům” → UI interakce bude nechtěně failovat.
- **Timing drift / determinismus**:
  - přechod ze `setTimeout`/`setInterval` na jiný scheduler může změnit order eventů, přesnost, nebo chování při tab background / throttlingu.
  - pause/resume dnes přepočítává “elapsed” a reschedule; při změně implementace je riziko double-fire / missed events.
- **DEV overlay coupling**:
  - `GamePage` je těsně svázaná s engine API (pause/step/log). Změna enginu může rozbít DEV tooling, i když “normální” gameplay bude fungovat.
- **Backward compatibility level formátu**:
  - backend generuje levely a podepisuje je. Pokud se změní schema levelu, je potřeba koordinovat FE+BE a migrovat definované levely i generátor.
- **Signature/anti-cheat assumptions**:
  - aktuální podpis pokrývá jen `(userId, levelId, endTime)`. Pokud se engine rozhoduje podle dalších dat, která nejsou podepsaná, backend validace může být slabší (nebo naopak příliš striktní).
- **Asset dostupnost**:
  - engine očekává `/assets/audio/...`, ale repozitář aktuálně neobsahuje asset soubory. Při nasazení/refaktoru je riziko, že se změní base path nebo bundling a preload bude selhávat (byť current code chybu maskuje resolve na `error`).

---

## Rychlá mapa “kde co je” (pro navigaci)

- **Level runtime + timing**: `client/src/engine/LevelEngine.ts`
- **Input listeners + fail rules**: `client/src/engine/InputSystem.ts`
- **UI + state machine + engine wiring**: `client/src/pages/GamePage.tsx`
- **FE API**: `client/src/services/api.ts`, `client/src/services/httpClient.ts`
- **Level generation/signing**: `server/src/levels.ts`
- **Level endpoints**: `server/src/routes/game.ts`, `server/src/controllers/gameController.ts`
- **Dokumentace architektury**: `docs/ARCHITECTURE.md`, `docs/LEVEL_FORMAT.md`, `docs/AI_PROJECT_CONTEXT.md`

