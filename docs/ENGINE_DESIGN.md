# NÁVRH NOVÉHO LEVEL ENGINE (Action‑Based, refined + hardened)

Tento dokument je finální refined specifikace univerzálního **action-based** enginu pro hru **Nedělej nic**, doplněná o “hardening” hraničních chování (bez redesignu a bez nových akcí).

Neměnné požadavky projektu (viz `docs/AI_PROJECT_CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_OVERVIEW.md`):
- **Levely jsou data-driven** a engine je pouze **interpretuje**.
- Během fáze **playing** je **0 requestů na server** (a ideálně 0 requestů vůbec).
- Input je bezpečný: stavově řízený attach/detach + respektuje `data-no-game-input`.
- `"type": "custom"` je **plugin** nad stejným enginem, ne “druhý engine”.

---

## 1) Architektura (minimální core engine)

### Minimální subsystémy (3)

1) **EngineCore**
- state machine: `idle → running/paused → ended`
- drží `LevelState` (render model + proměnné + aktivní rules + aktivní traps)
- obsahuje scheduler pro timeline + vykonavatele akcí
- callbacky: `onState`, `onProgress`, `onRenderModel`, `onEventLog`, `onEnd`

2) **InputSystem**
- attach/detach DOM listenerů pouze v playing (zdroj pravdy je UI phase, jako dnes)
- filtruje `data-no-game-input`
- převádí DOM eventy na standardizované `InputEvent` a posílá je do `EngineCore`

3) **AudioSystem**
- preload + play/stop pro `/voices`, `/music`, `/sounds`
- garantuje: preload proběhne před playing; během playing nevznikají nové requesty
- chybějící asset = no-op + log (nesmí shodit level)

> `UIRenderer` není samostatný subsystém: EngineCore publikuje **render model** (layers + effects + text), React ho vykreslí.

---

## 2) Action system (fixní, minimální)

Action set (fixní, bez dalších akcí):

- `text.set`
- `audio.play`
- `audio.stop`
- `ui.layer`
- `effect.start`
- `effect.stop`
- `rules.set`
- `trap.set`
- `state.set`
- `state.add`
- `flow.goto`
- `flow.branch`
- `flow.random`
- `level.end`

---

## 3) Kontrakty akcí (zpřesněné)

### `text.set`

- `slot`: `"subtitle" | "caption"`
- `text`: string (prázdný string = clear)
- `style?`: whitelist
  - minimum: `{ tone?: "neutral" | "warning" | "error", align?: "center" | "left" }`

---

### `audio.play`

- `kind`: `"voice" | "music" | "sound"`
- `file`: filename bez cesty
- `id?`: string (doporučeno pro `voice/music`)
- `loop?`: boolean
- `volume?`: number (0..1)
- `fadeMs?`: number

**Hard rule (0 requestů během playing)**:
- Během playing `audio.play` **nesmí** vytvořit nový audio element ani nastavit nové `src` URL.
- Smí pouze: lookup `(kind,file)` v preload poolu → play, nebo no-op + log když chybí.

**Ducking**: interní chování AudioSystem (není akce).

---

### `audio.stop`

- `id?`: string
- `kind?`: `"voice" | "music" | "sound"`
- `fadeMs?`: number

**Precedence**:
1) Je-li `id`: stop pouze track s `id` (kind se ignoruje).
2) Jinak je-li `kind`: stop všechny tracky daného kind.
3) Jinak: no-op.

---

### `ui.layer`

- `op`: `"add" | "update" | "remove"`
- `id`: unikátní v rámci levelu
- `type` enum: `"toast" | "modal" | "button" | "overlay" | "hud" | "noise" | "cursor" | "image"`
- `props?` whitelist:
  - `text?`, `visible?`, `interactive?`, `variant?`, `position?`, `z?`

**Pro trapy**: renderer musí nastavit `data-layer-id="<id>"` na kořenový DOM element vrstvy.

---

### `effect.start` / `effect.stop`

- `type`: `"glitch" | "blur" | "invert" | "flash" | "shake" | "jitter"`
- `intensity?`: number (0..1)
- `durationMs?`: number
- `target?`: string (default `"screen"`)

**Limit**: max 1 instance na `type` (nový start přepíše starý).

**Duration**:
- `durationMs` vytvoří interní timer, který provede stop.
- ruční `effect.stop` zruší timer.

---

### `rules.set`

- `{ click, mouseMove, keyboard, scroll, touch }` → `"forbidden" | "allowed" | "required"`

**Precedence**:
1) traps
2) rules fallback

---

### `trap.set`

- `id`: string
- `enabled`: boolean
- `kind`: `"uiTarget" | "inputPattern" | "timeWindow"`
- `match`: striktní schema dle kind
- `result`: `{ type: "fail" | "success" | "setVar", reason?: string, key?: string, value?: number }`

**Lifecycle**:
- `enabled:false` = trap zůstává registrován, ale ignoruje input.
- stejné `id` = replace (přepíše existující).

**Matching**:
- first match wins (ostatní se pro daný event nevyhodnocují).

`uiTarget`:
- `match`: `{ layerId: string, action: "click" }`

`inputPattern`:
- `match`: `{ sequence: string[], withinMs: number }` (`KeyboardEvent.code` + `"click"`)

`timeWindow`:
- `match`: `{ start: string, end: string, input: "click" | "mouseMove" | "keyboard" | "scroll" | "touch" }`
- význam: pokud input nastane v okně → result

---

### `state.set` / `state.add`

- vars jsou globální pro level, startují jako `{}`
- missing key = implicitně `0`
- `state.add` na neexistující klíč = `0 + delta`

---

### `flow.goto` / `flow.branch` / `flow.random`

- `flow.goto`: `{ label: string }`
- `flow.random`: `{ choices: string[], seedKey?: string }`
- `flow.branch`:
  - `if`: `{ var: string, op: "eq" | "gte" | "lte", value: number | string }`
  - `then`: label, `else`: label

**Random determinismus**:
- seed = `levelId + seedKey` (nebo default pro level)
- volba se vždy loguje

---

### `level.end`

- `{ result: "success" | "fail", reason?: string }`

**Shutdown**:
- stop scheduler
- detach input
- ignore další akce

---

## 4) Timeline model (imperativní interpret + hardening)

- program counter
- `flow.goto` skok na label
- `at` = čekej do času, pak pokračuj
- `when` = blocking krok (blokuje timeline), ale input+trapy dál běží

**Catch-up**:
- po `flow.goto` na `at` v minulosti se kroky provedou okamžitě v array order

**Same-time**:
- stejné `at` = array order

**Loop limit**:
- max skoků (např. 20), po překročení fail

---

## 5) Input event normalizace (hardening)

`InputEvent`:

```ts
{
  type: "click" | "mouseMove" | "keyboard" | "scroll" | "touch",
  timestamp: number,
  targetLayerId?: string,
  raw: unknown
}
```

- click mapování: `targetLayerId = closest('[data-layer-id]')`; pokud nenalezeno → event ignorovat

---

## 6) Asset pipeline (hardening)

- preload vše před playing
- během playing 0 requestů
- missing asset = silent no-op + log (DEV)

---

## 7) Custom level API (hardening)

Povoleno jen:
- `onStart(ctx)`
- `onInput(inputEvent, ctx)`
- `onStop(ctx)`

Zakázáno:
- vlastní DOM listenery
- vlastní schedulery
- network requesty během playing

# NÁVRH NOVÉHO LEVEL ENGINE (Action‑Based, refined + hardened)

Tento dokument je finální refined specifikace univerzálního **action-based** enginu pro hru **Nedělej nic**, doplněná o “hardening” hraničních chování (bez redesignu a bez nových akcí).

Neměnné požadavky projektu (viz `docs/AI_PROJECT_CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_OVERVIEW.md`):
- **Levely jsou data-driven** a engine je pouze **interpretuje**.
- Během fáze **playing** je **0 requestů na server** (a ideálně 0 requestů vůbec).
- Input je bezpečný: stavově řízený attach/detach + respektuje `data-no-game-input`.
- `"type": "custom"` je **plugin** nad stejným enginem, ne “druhý engine”.

---

## 1) Architektura (minimální core engine)

### Minimální subsystémy (3)

1) **EngineCore**
- state machine: `idle → running/paused → ended`
- drží `LevelState` (render model + proměnné + aktivní rules + aktivní traps)
- obsahuje scheduler pro timeline + vykonavatele akcí
- callbacky: `onState`, `onProgress`, `onRenderModel`, `onEventLog`, `onEnd`

2) **InputSystem**
- attach/detach DOM listenerů pouze v playing (zdroj pravdy je UI phase, jako dnes)
- filtruje `data-no-game-input`
- převádí DOM eventy na standardizované `InputEvent` a posílá je do `EngineCore`

3) **AudioSystem**
- preload + play/stop pro `/voices`, `/music`, `/sounds`
- garantuje: preload proběhne před playing; během playing nevznikají nové requesty
- chybějící asset = no-op + log (nesmí shodit level)

> `UIRenderer` není samostatný subsystém: EngineCore publikuje **render model** (layers + effects + text), React ho vykreslí.

---

## 2) Action system (fixní, minimální)

Action set (fixní, bez dalších akcí):

- `text.set`
- `audio.play`
- `audio.stop`
- `ui.layer`
- `effect.start`
- `effect.stop`
- `rules.set`
- `trap.set`
- `state.set`
- `state.add`
- `flow.goto`
- `flow.branch`
- `flow.random`
- `level.end`

---

## 3) Kontrakty akcí (zpřesněné)

### `text.set`

- **Účel**: nastavit textovou vrstvu (subtitle/caption).
- **Parametry**:
  - `slot`: `"subtitle" | "caption"`
  - `text`: string (prázdný string = clear)
  - `style?`: omezený whitelist
    - minimum: `{ tone?: "neutral" | "warning" | "error", align?: "center" | "left" }`

---

### `audio.play`

- **Účel**: přehrát audio z preloaded poolu.
- **Parametry**:
  - `kind`: `"voice" | "music" | "sound"`
  - `file`: string (filename bez cesty)
  - `id?`: string (doporučeno pro `voice/music`)
  - `loop?`: boolean
  - `volume?`: number (0..1)
  - `fadeMs?`: number

**Hard rule (0 requestů během playing)**:
- Během playing `audio.play` **nesmí** vytvořit nový audio element ani nastavit nové `src` URL.
- Smí pouze: lookup `(kind,file)` v preload poolu → play, nebo no-op + log když chybí.

**Ducking**:
- Ducking je interní chování AudioSystem (není samostatná akce).

---

### `audio.stop`

- **Účel**: zastavit přehrávání.
- **Parametry**:
  - `id?`: string
  - `kind?`: `"voice" | "music" | "sound"`
  - `fadeMs?`: number

**Precedence (jednoznačně)**:
1) Je-li `id`: zastaví se jen track s `id` (kind se ignoruje).
2) Jinak je-li `kind`: zastaví se všechny tracky daného kind.
3) Jinak (žádné `id` ani `kind`): **no-op**.

---

### `ui.layer`

- **Účel**: add/update/remove UI vrstvy (včetně fake UI).
- **Parametry**:
  - `op`: `"add" | "update" | "remove"`
  - `id`: string (unikátní v rámci levelu)
  - `type`: omezený enum:
    - `"toast" | "modal" | "button" | "overlay" | "hud" | "noise" | "cursor" | "image"`
  - `props?`: omezený whitelist:
    - `text?`: string
    - `visible?`: boolean
    - `interactive?`: boolean (default false)
    - `variant?`: `"neutral" | "warning" | "danger" | "success"`
    - `position?`: `"center" | "top" | "topRight" | "topLeft" | "bottom" | "bottomRight" | "bottomLeft"`
    - `z?`: number

**Pro trapy (povinné)**:
- Renderer mapuje layer `id` na DOM atribut: `data-layer-id="<id>"`.

---

### `effect.start` / `effect.stop`

- **Parametry**:
  - `type`: `"glitch" | "blur" | "invert" | "flash" | "shake" | "jitter"`
  - `intensity?`: number (0..1)
  - `durationMs?`: number
  - `target?`: string (default `"screen"`)

**Jednodušující pravidlo**:
- Max 1 instance efektu na `type` (nový `effect.start` stejného type přepíše starý).

**Effect lifecycle (hardening)**:
- `durationMs` vytváří interní timer, který po době doběhne a provede ekvivalent `effect.stop` pro daný `type`.
- Ruční `effect.stop` musí tento timer zrušit.

---

### `rules.set`

- **Parametry**:
  - `{ click, mouseMove, keyboard, scroll, touch }` → `"forbidden" | "allowed" | "required"`

**Rules vs traps: precedence (hardening)**:
- Input vyhodnocení je vždy:
  1) **Traps** (první match vyhrává)
  2) pokud nic nematchlo / neukončilo level, **Rules** jako fallback

---

### `trap.set` (omezený)

- **Parametry**:
  - `id`: string
  - `enabled`: boolean
  - `kind`: `"uiTarget" | "inputPattern" | "timeWindow"`
  - `match`: striktní schema dle kind
  - `result`: `{ type: "fail" | "success" | "setVar", reason?: string, key?: string, value?: number }`

**Trap lifecycle (hardening)**:
- `enabled:false` = trap zůstává registrován, ale ignoruje input (nematchuje).
- `trap.set` se stejným `id` přepisuje existující trap (update/replace).

**Vyhodnocení trapů (hardening)**:
- trapy se vyhodnocují v definovaném pořadí (např. pořadí registrace v `LevelState`)
- **první match vyhrává**: pro daný `InputEvent` se ostatní trapy už nevyhodnocují

#### `kind: "uiTarget"` (jen click)

- `match`: `{ layerId: string, action: "click" }`

#### `kind: "inputPattern"` (jen sequence + withinMs)

- `match`: `{ sequence: string[], withinMs: number }`
- `sequence` používá `KeyboardEvent.code` + speciální token `"click"` (pokud je potřeba).

#### `kind: "timeWindow"` (jen “pokud input nastane v okně → result”)

- `match`: `{ start: string, end: string, input: "click" | "mouseMove" | "keyboard" | "scroll" | "touch" }`
- význam: pokud daný input **nastane** v okně, provede se `result`.

---

### `state.set` / `state.add`

- `state.set`: `key: string`, `value: number | string`
- `state.add`: `key: string`, `delta: number`

**StateStore (hardening)**:
- proměnné jsou globální pro celý level
- inicializace: prázdný objekt `{}`
- `state.add` na neexistující klíč = implicitní 0 (tj. `0 + delta`)

---

### `flow.goto` / `flow.branch` / `flow.random`

- `flow.goto`: `{ label: string }`
- `flow.random`: `{ choices: string[], seedKey?: string }`
- `flow.branch`:
  - `if`: `{ var: string, op: "eq" | "gte" | "lte", value: number | string }`
  - `then`: label
  - `else`: label

**Random determinismus (hardening)**:
- `flow.random`:
  - vždy zapíše vybranou volbu do event logu
  - seed je deterministicky odvozen z `levelId + seedKey` (pokud `seedKey` chybí, použije se default pro daný level)

---

### `level.end`

- `{ result: "success" | "fail", reason?: string }`

**Engine shutdown (hardening)**:
- Po prvním `level.end` engine musí:
  - zastavit scheduler (zrušit čekání na `at` i aktivní blocking `when`)
  - deaktivovat input (detach listeners)
  - ignorovat další timeline akce (i kdyby doběhl nějaký timer)

---

## 4) Timeline model (imperativní interpret + hardening)

Scheduler je **imperativní interpret**:
- engine má program counter (index kroku)
- `flow.goto` mění program counter skokem na `label`
- `at` znamená “čekej do času T od startu”, pak pokračuj
- `when` je **blocking krok** (blokuje postup timeline)

### Krok timeline

Krok může mít:
- `label?: string`
- `at?: string`
- `when?: object`
- `do: string` + parametry

### `when` (blocking)

`when` **blokuje další timeline kroky**, dokud nenastane podmínka nebo level neskončí.

Povolené `when`:
- `when: { input: "click" }`
- `when: { input: "keyDown", key: "Space" }`
- `when: { var: "chaos", gte: 3 }`

**Interakce `when` a traps (hardening)**:
- I když scheduler čeká na `when`, `InputSystem` dál posílá `InputEvent` a trapy se stále vyhodnocují.
- Pokud trap ukončí level, čekání na `when` se ukončí (engine ended).

### Scheduler a časování (hardening)

- **Skok na `at` v minulosti**:
  - Pokud `flow.goto` přeskočí na krok s `at` a \(at \le currentElapsed\), krok se provede **okamžitě** (bez čekání).
  - Totéž pro všechny následné kroky s `at` v minulosti (“catch-up”).
- **Více kroků se stejným `at`**:
  - Provedou se v pořadí v timeline poli.

### Guardrails

- `flow.goto` limit skoků (např. 20) za level; po překročení `level.end` fail (“loop limit exceeded”).

---

## 5) Input event normalizace (hardening)

`InputSystem` převádí DOM eventy na:

```ts
InputEvent = {
  type: "click" | "mouseMove" | "keyboard" | "scroll" | "touch",
  timestamp: number,
  key?: string,
  layerId?: string
}
```

- `layerId` se u clicku získává přes `closest('[data-layer-id]')` na `event.target`.

---

## 6) JSON ukázky (pouze nový action set)

### Action level (ukázka)

```json
{
  "id": 12,
  "type": "action",
  "title": "Ticho",
  "assets": {
    "voices": ["intro_12.mp3"],
    "music": ["ambient_1.ogg"],
    "sounds": ["error_1.wav", "click_fake.wav"]
  },
  "rules": {
    "click": "forbidden",
    "mouseMove": "forbidden",
    "keyboard": "forbidden",
    "scroll": "forbidden",
    "touch": "forbidden"
  },
  "end": { "type": "timer", "time": 20 },
  "timeline": [
    { "at": "0s", "do": "text.set", "slot": "subtitle", "text": "Vítej. Nedělej nic." },
    { "at": "2s", "do": "audio.play", "kind": "voice", "file": "intro_12.mp3", "id": "v1" },
    { "at": "5s", "do": "text.set", "slot": "subtitle", "text": "" },
    {
      "at": "8s",
      "do": "ui.layer",
      "op": "add",
      "id": "fakeToast1",
      "type": "toast",
      "props": { "text": "Klikni pro pokračování.", "interactive": true, "position": "top", "variant": "warning" }
    },
    {
      "at": "9s",
      "do": "trap.set",
      "id": "t1",
      "enabled": true,
      "kind": "uiTarget",
      "match": { "layerId": "fakeToast1", "action": "click" },
      "result": { "type": "fail", "reason": "Kliknul jsi. Hra skončila." }
    },
    { "at": "10s", "do": "flow.random", "choices": ["A", "B"], "seedKey": "rng" },
    { "label": "A" },
    { "do": "audio.play", "kind": "sound", "file": "error_1.wav" },
    { "do": "effect.start", "type": "shake", "intensity": 0.6, "durationMs": 400 },
    { "do": "flow.goto", "label": "END" },
    { "label": "B" },
    { "do": "effect.start", "type": "glitch", "intensity": 0.7, "durationMs": 1200 },
    { "do": "flow.goto", "label": "END" },
    { "label": "END" },
    { "at": "20s", "do": "level.end", "result": "success" }
  ],
  "signature": "hmac..."
}
```

### Custom level (ukázka)

```json
{
  "id": 77,
  "type": "custom",
  "module": "level_77_cursorChaos",
  "assets": { "voices": [], "music": [], "sounds": [] },
  "end": { "type": "timer", "time": 30 },
  "signature": "hmac..."
}
```

---

## 7) Asset pipeline (hardening)

- Všechny assety z `assets.*` se preloadují **před** playing.
- Během playing nesmí vzniknout žádný nový request.
- Chybějící asset nikdy neshodí level (no-op + log).

---

## 8) Custom level API (hardening)

Povoleno jen:
- `onStart(ctx)`
- `onInput(inputEvent, ctx)`
- `onStop(ctx)`

Zakázáno:
- vlastní DOM listenery
- vlastní schedulery
- network requesty během playing

# NÁVRH NOVÉHO LEVEL ENGINE (Action‑Based, refined)

Tento dokument je finální refined návrh univerzálního **action-based** enginu pro hru **Nedělej nic**.  
Cíl: **co nejjednodušší implementovatelný engine** (bez redesignu), který stále pokrývá všechny požadavky a všechny typy levelů kombinací stejných akcí.

Neměnné požadavky projektu (viz `docs/AI_PROJECT_CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_OVERVIEW.md`):
- **Levely jsou data-driven** a engine je pouze **interpretuje**.
- Během fáze **playing** je **0 requestů na server** (a ideálně 0 requestů vůbec).
- Input je bezpečný: stavově řízený attach/detach + respektuje `data-no-game-input`.
- `"type": "custom"` je **plugin** nad stejným enginem, ne “druhý engine”.

---

## 1) Architektura (minimální core engine)

### Princip: “Level je scénář, engine je interpret”

Level je čitelný scénář složený z:
- **rules**: zakázané / povolené / povinné akce hráče
- **assets**: co se musí preloadnout před startem
- **timeline**: kdy a za jakých podmínek se provádí akce
- **end**: kdy level končí (typicky timer)

Engine:
- načte level data,
- **preloadne assets před startem playing**,
- během playing interpretuje timeline a vyhodnocuje input,
- po skončení vrátí výsledek UI (UI teprve potom pošle `/result`).

### Minimální subsystémy (3)

1) **EngineCore**
- state machine: `idle → running/paused → ended`
- drží `LevelState` (render model + proměnné + aktivní rules + aktivní traps)
- obsahuje scheduler pro timeline + vykonavatele akcí
- emit/callbacky: `onState`, `onProgress`, `onRenderModel`, `onEventLog`, `onEnd`

2) **InputSystem**
- attach/detach DOM listenerů pouze v playing (zdroj pravdy je UI phase, jako dnes)
- filtruje `data-no-game-input`
- převádí DOM eventy na standardizované `InputEvent` a posílá je do `EngineCore`

3) **AudioSystem**
- preload + play/stop pro `/voices`, `/music`, `/sounds`
- garantuje: preload proběhne před playing; během playing nevznikají nové requesty
- chybějící asset = no-op + log (nesmí shodit level)

> `UIRenderer` není samostatný subsystém: EngineCore drží jednoduchý **render model** (layers + effects + text), React ho vykreslí.

---

## 2) Action system (minimální, parametrický)

Zásada: **málo akcí**, ale parametrických. Všechny typy levelů jsou kompozice těchto akcí.

Action set (fixní, bez dalších akcí):

- `text.set`
- `audio.play`
- `audio.stop`
- `ui.layer`
- `effect.start`
- `effect.stop`
- `rules.set`
- `trap.set`
- `state.set`
- `state.add`
- `flow.goto`
- `flow.branch`
- `flow.random`
- `level.end`

---

## 3) Kontrakty akcí (zpřesněné, implementačně jednoznačné)

### `text.set`

- **Účel**: nastav textovou vrstvu (subtitle/caption).  
- **Parametry**:
  - `slot`: `"subtitle" | "caption"`
  - `text`: string (prázdný string = clear)
  - `style?`: omezený whitelist (aby to neeskalovalo do “libovolného CSS”)
    - doporučené minimum: `{ tone?: "neutral" | "warning" | "error", align?: "center" | "left" }`

> `text.clear` se nepoužívá. Clear je `text.set` s `text: ""`.

---

### `audio.play`

- **Účel**: přehrát audio z předem preloaded poolu.
- **Parametry**:
  - `kind`: `"voice" | "music" | "sound"`
  - `file`: string (filename bez cesty)
  - `id?`: string (doporučeno pro `voice/music`; pro `sound` může chybět)
  - `loop?`: boolean (typicky pro music)
  - `volume?`: number (0..1)
  - `fadeMs?`: number

**Kritické pravidlo (0 requestů během playing)**:
- Během playing `audio.play` **nesmí** vytvořit nový audio element ani nastavit nové `src` URL.  
  Smí pouze:
  - vyhledat `(kind,file)` v preload poolu,
  - pokud existuje, spustit přehrání,
  - pokud neexistuje (missing), provést no-op a zalogovat.

**Ducking**:
- Ducking není samostatná akce. Je to **interní chování AudioSystem** (např. voice automaticky ztlumí music podle interní policy).

---

### `audio.stop`

- **Účel**: zastavit přehrávání.
- **Parametry**:
  - `id?`: string
  - `kind?`: `"voice" | "music" | "sound"`
  - `fadeMs?`: number

**Precedence parametrů (jednoznačně)**:
1) Pokud je uvedené `id`, zastaví se **jen** track s tímto `id` (kind se ignoruje).
2) Jinak, pokud je uvedené `kind`, zastaví se všechny tracky daného kind (typicky `music`).
3) Pokud není ani `id` ani `kind`, je to **no-op** (aby se předešlo “stopni všechno omylem”).

---

### `ui.layer`

- **Účel**: jednotné vytváření/úprava/mazání UI vrstev (včetně fake UI).
- **Parametry**:
  - `op`: `"add" | "update" | "remove"`
  - `id`: string (globálně unikátní v rámci levelu)
  - `type`: omezený enum (ne libovolný string)
    - povolené: `"toast" | "modal" | "button" | "overlay" | "hud" | "noise" | "cursor" | "image"`
  - `props?`: omezený whitelist (ne libovolný objekt)
    - společné minimum:
      - `text?`: string
      - `visible?`: boolean
      - `interactive?`: boolean (default: `false`)
      - `variant?`: `"neutral" | "warning" | "danger" | "success"`
      - `position?`: `"center" | "top" | "topRight" | "topLeft" | "bottom" | "bottomRight" | "bottomLeft"`
      - `z?`: number

**Podmínka pro implementaci trapů**:
- Renderer musí mapovat `ui.layer.id` na DOM atribut tak, aby šel spolehlivě detekovat klik:
  - např. element pro danou vrstvu musí mít `data-layer-id="<id>"`
  - click event se vyhodnocuje přes `closest('[data-layer-id]')`

> `data-no-game-input` je pouze pro “skutečné UI” (např. dev overlay). Fake UI vrstvy z levelu **nesmí** být označeny `data-no-game-input`, pokud mají být past.

---

### `effect.start` / `effect.stop`

- **Účel**: spustit / zastavit vizuální efekt.
- **Parametry**:
  - `type`: `"glitch" | "blur" | "invert" | "flash" | "shake" | "jitter"`
  - `intensity?`: number (0..1)
  - `durationMs?`: number (pokud je uvedeno, efekt se po době automaticky ukončí)
  - `target?`: string (volitelné; např. `"screen"` jako default)

**Zjednodušující pravidlo**:
- V jednu chvíli může běžet **max 1 instance efektu na `type`**.  
  Nový `effect.start` stejného type přepíše předchozí (restart/overwrite).

---

### `rules.set`

- **Účel**: nastavit pravidla inputu pro danou fázi levelu.
- **Parametry**:
  - `{ click, mouseMove, keyboard, scroll, touch }` → `"forbidden" | "allowed" | "required"`

**Vyhodnocení inputu: precedence (jednoznačně)**:
1) **Traps** (viz `trap.set`) se vyhodnotí první.
2) Pokud žádný trap nematchnul nebo neukončil level, použijí se **rules** jako fallback.

> To je nutné pro implementaci “opposite rules” a puzzle bez toho, aby required/forbidden vedlo k chaosu.

---

### `trap.set` (omezený a vymahatelný)

- **Účel**: definovat jednoduché pasti/puzzle podmínky.
- **Parametry**:
  - `id`: string
  - `enabled`: boolean
  - `kind`: `"uiTarget" | "inputPattern" | "timeWindow"`
  - `match`: přesná struktura podle kind (viz níže; žádné volné objekty)
  - `result`: `{ type: "fail" | "success" | "setVar", reason?: string, key?: string, value?: number }`

**Pravidla vyhodnocení trapů (jednoznačně)**:
- Trapy se vyhodnocují v pořadí, v jakém byly naposledy nastaveny v `LevelState` (typicky pořadí v timeline).
- **První match vyhrává**: jakmile trap matchne relevantní událost, jeho `result` se provede a ostatní trapy se pro daný input event nevyhodnocují.
- Trapy mají precedence před `rules.set` (viz výše).

#### `kind: "uiTarget"` (jen click)

- podporuje pouze akci: `click`
- `match` struktura:
  - `{ layerId: string, action: "click" }`

#### `kind: "inputPattern"` (jen sequence + withinMs)

- `match` struktura:
  - `{ sequence: string[], withinMs: number }`
- `sequence` používá stejné názvy jako `KeyboardEvent.code` + speciální token `"click"` (pokud je potřeba v patternu klik).
- Žádné regexy, žádné AND/OR, žádné simultánní stavy.

#### `kind: "timeWindow"` (jen “pokud input nastane v okně → result”)

- `match` struktura:
  - `{ start: string, end: string, input: "click" | "mouseMove" | "keyboard" | "scroll" | "touch" }`
- význam: pokud daný input **nastane** v intervalu, trap matchne a provede `result`.
- Povinné/zakázané chování mimo okno se řeší přes `rules.set` + timeline (`flow.branch`) – ne přes timeWindow trap.

---

### `state.set` / `state.add`

- **Účel**: proměnné pro escalation, narrator arc, loop počitadla.
- **Parametry**:
  - `state.set`: `key: string`, `value: number | string`
  - `state.add`: `key: string`, `delta: number`

> Pro jednoduchost: `gte` podmínky v `flow.branch` a `when` mají smysl hlavně pro numerické proměnné.

---

### `flow.goto` / `flow.branch` / `flow.random`

- **`flow.goto`**: `{ label: string }`
- **`flow.random`**: `{ choices: string[], seedKey?: string }`

- **`flow.branch`**:
  - `if` má omezené schema (aby to zůstalo implementovatelně jednoduché):
    - `{ var: string, op: "eq" | "gte" | "lte", value: number | string }`
  - `then`: label string
  - `else`: label string

**Determinismus**:
- `flow.random` musí logovat vybranou volbu do event logu (DEV).
- `seedKey` je jen “klíč” pro seed derivaci (např. seed může být odvozen z `levelId + seedKey`; detail je implementační, ale chování musí být stabilní).

---

### `level.end`

- **Účel**: ukončit level.
- **Parametry**: `{ result: "success" | "fail", reason?: string }`

**Jednoznačné pravidlo**:
- První `level.end` ukončí level, vypne scheduler, odpojí input a další akce jsou no-op.

---

## 4) Timeline model (explicitně imperativní interpret)

Scheduler je definován jako **imperativní interpret**:
- Engine má **program counter** (index aktuálního kroku).
- `flow.goto` mění program counter skokem na `label`.
- `at` znamená **čekej do času** od startu levelu a pak pokračuj.
- `when` je **blocking krok**: engine se na kroku zastaví a čeká, dokud se podmínka nesplní (nebo level neskončí).

### Struktura kroku timeline

Krok může mít:
- `label?: string`
- `at?: string` (absolutní čas od startu; `"0s"`, `"250ms"`, `"12.5s"`)
- `when?: object` (omezené schema, viz níže)
- `do: string` (název akce)
- parametry akce

Pravidla:
- Krok bez `at` a bez `when` se provede **okamžitě**, když se na něj program counter dostane.
- `timeline.wait` se nepoužívá (čekání řeší `at` nebo `when`).

### `when` (minimalistické, blocking)

Pro implementační jednoduchost jsou povolené jen:
- `when: { input: "click" }`
- `when: { input: "keyDown", key: "Space" }`
- `when: { var: "chaos", gte: 3 }`

### Guardrails (proti nekonečnému chaosu)

- `flow.goto` má limit skoků (např. 20) za level.
  - po překročení: `level.end` fail (reason “loop limit exceeded”)
- `flow.random` je seedovatelný (stabilní) a logovaný.

---

## 5) Struktura level JSON (kontrakt + ukázky)

### Action level (ukázka)

> Poznámka: `text.set` s `text: ""` je clear.

```json
{
  "id": 12,
  "type": "action",
  "title": "Ticho",

  "assets": {
    "voices": ["intro_12.mp3"],
    "music": ["ambient_1.ogg"],
    "sounds": ["error_1.wav", "click_fake.wav"]
  },

  "rules": {
    "click": "forbidden",
    "mouseMove": "forbidden",
    "keyboard": "forbidden",
    "scroll": "forbidden",
    "touch": "forbidden"
  },

  "end": { "type": "timer", "time": 20 },

  "timeline": [
    { "at": "0s", "do": "text.set", "slot": "subtitle", "text": "Vítej. Nedělej nic." },
    { "at": "2s", "do": "audio.play", "kind": "voice", "file": "intro_12.mp3", "id": "v1" },
    { "at": "5s", "do": "text.set", "slot": "subtitle", "text": "" },

    { "at": "8s",
      "do": "ui.layer",
      "op": "add",
      "id": "fakeToast1",
      "type": "toast",
      "props": { "text": "Klikni pro pokračování.", "interactive": true, "position": "top", "variant": "warning" }
    },

    { "at": "9s",
      "do": "trap.set",
      "id": "t1",
      "enabled": true,
      "kind": "uiTarget",
      "match": { "layerId": "fakeToast1", "action": "click" },
      "result": { "type": "fail", "reason": "Kliknul jsi. Hra skončila." }
    },

    { "at": "10s", "do": "flow.random", "choices": ["A", "B"], "seedKey": "rng" },

    { "label": "A" },
    { "do": "audio.play", "kind": "sound", "file": "error_1.wav" },
    { "do": "effect.start", "type": "shake", "intensity": 0.6, "durationMs": 400 },
    { "do": "flow.goto", "label": "END" },

    { "label": "B" },
    { "do": "effect.start", "type": "glitch", "intensity": 0.7, "durationMs": 1200 },
    { "do": "flow.goto", "label": "END" },

    { "label": "END" },
    { "at": "20s", "do": "level.end", "result": "success" }
  ],

  "signature": "hmac..."
}
```

### Custom level (ukázka)

```json
{
  "id": 77,
  "type": "custom",
  "module": "level_77_cursorChaos",
  "assets": { "voices": [], "music": [], "sounds": [] },
  "end": { "type": "timer", "time": 30 },
  "signature": "hmac..."
}
```

---

## 6) Asset pipeline (validace “0 requestů během playing”)

### Pravidla (vymahatelná)

- **Preload před startem**: Engine musí dokončit `preload(assets)` před přechodem do playing.
- **Během playing 0 requestů**:
  - žádné fetch,
  - žádné lazy load,
  - žádné vytváření nových audio objektů se `src`,
  - pouze přehrávání už preloaded assetů.
- **Chybějící asset nesmí shodit level**:
  - preload fail = zalogovat `asset.missing` a pokračovat,
  - `audio.play` na chybějící asset = no-op.

### Cesty (pevné base path)

Autor zadává jen filename; engine mapuje:
- `/assets/voices/<file>`
- `/assets/music/<file>`
- `/assets/sounds/<file>`

---

## 7) Custom levely (`"type": "custom"`) — zpřesněný plugin kontrakt

Custom je escape hatch, ale nesmí vzniknout druhý engine.

### Povoleno (jen toto)

- `onStart(ctx)`
- `onInput(inputEvent, ctx)`
- `onStop(ctx)`

`ctx` poskytne:
- `dispatch(action)` (stejný action set jako JSON)
- `getVar(key)` / `setVar(key, value)` (nebo přes `state.*` akce)
- `end(result, reason?)` (ekvivalent `level.end`)

### Zakázáno (explicitně)

- vlastní DOM listenery
- vlastní schedulery (intervaly/timeouts pro řízení průběhu levelu)
- jakékoliv network requesty během playing

> Custom modul musí používat stejné `InputSystem` a stejné `EngineCore` řízení (tj. pouze reaguje přes `dispatch` a `end`).

---

## 8) Jak engine pokryje všech 22 typů levelů (bez dalších systémů)

Vše je kompozice stejného action setu:

1. **wait**: `rules.set` forbidden + `text.set` + timer
2. **temptation**: `ui.layer` (provokace) + `trap.set uiTarget` + `audio.play voice`
3. **cursor troll**: `ui.layer type:"cursor"` + `effect.start type:"jitter"/"shake"`
4. **visual chaos**: `effect.start` (glitch/flash/invert/blur) + `state.add` (escalation)
5. **sound**: `audio.play kind:"sound"/"music"` + text
6. **commentator**: `audio.play kind:"voice"` + `text.set`
7. **psychological pressure**: `state.add` + `flow.branch` + fake warnings `ui.layer`
8. **fake game**: `ui.layer` (hud/button/modal) + `trap.set` + `rules.set` (opposite rules)
9. **hidden action puzzle**: `trap.set kind:"inputPattern"` + `flow.branch`
10. **time trick**: `trap.set kind:"timeWindow"` + `flow.branch` + `rules.set` pro změny pravidel
11. **fake UI**: `ui.layer` + `trap.set uiTarget`
12. **loop**: `flow.goto` + `state.add` (počítadla) + loop limit
13. **meta**: `ui.layer` (fake debug) + voice/text + efekty
14. **random chaos**: `flow.random` + `effect.start` + `audio.play sound`
15. **minimalism**: minimum `text.set`, ticho, jemná music
16. **existential**: text + voice + ambient + dlouhé `at`
17. **expectation break**: dlouho klid + náhlá past (`ui.layer` + `trap.set`) + efekt
18. **input trap**: `trap.set` kolem fake UI + `rules.set` forbidden
19. **opposite rules**: `rules.set` přepínané v čase + `flow.branch`
20. **chaos escalation**: `state.add chaos` + `flow.branch` → přidávání `effect/ui/audio`
21. **narrator arc**: `state.*` (fáze) + voice/text + branch/random podle proměnných
22. **kombinované**: segmenty přes `label` + `flow.goto/branch/random`

---

## 9) Shrnutí před implementací

- Dokument je konzistentní: **jen refined návrh**.
- Action set je fixní a minimální (bez `text.clear` a bez `audio.mix`).
- Timeline model je explicitně **imperativní interpret** (program counter).
- Trapy jsou omezené a vymahatelné (první match vyhrává, trapy mají precedence před rules).
- Asset pipeline explicitně garantuje “0 requestů během playing”.

# NÁVRH NOVÉHO LEVEL ENGINE (Action‑Based, zjednodušený a implementovatelný)

Tento dokument je **refinement** původního návrhu. Cíl: co nejjednodušší implementovatelný engine, který stále pokrývá všechny popsané schopnosti a 22 typů levelů.

Neměnné požadavky projektu (viz `docs/AI_PROJECT_CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_OVERVIEW.md`):
- **Levely jsou data-driven** a engine je pouze **interpretuje**.
- Během fáze **playing** je **0 requestů na server** (a ideálně 0 requestů vůbec).
- Input je bezpečný: stavově řízený attach/detach + respektuje `data-no-game-input`.
- `"type": "custom"` je **plugin** nad stejným enginem, ne “druhý engine”.

---

## Architektura (minimální core engine)

### Princip: “Level je scénář, engine je interpret”

Level je čitelný scénář složený z:
- **rules** (zakázané/povolené/povinné akce hráče),
- **assets** (co se musí preloadnout),
- **timeline** (kdy a za jakých podmínek se provádějí akce),
- **end** (kdy level končí, typicky timer).

Engine:
- načte level data,
- **preloadne assets před startem**,
- během playing spouští timeline kroky a vyhodnocuje input,
- po skončení vrátí výsledek UI, které teprve potom pošle `/result`.

### Minimální subsystémy (3)

1) **EngineCore**
- state machine: `idle → running/paused → ended`
- drží `LevelState` (render model + proměnné + aktivní rules/traps)
- obsahuje jednoduchý scheduler pro `timeline` + vykonavatele akcí (dispatcher)
- emit: `onState`, `onProgress`, `onText`, `onRenderModel`, `onEventLog`, `onEnd`

2) **InputSystem**
- attach/detach DOM listenerů pouze v playing (zdroj pravdy je UI phase, jako dnes)
- filtruje `data-no-game-input`
- převádí DOM eventy na standardizované `InputEvent` a předává je `EngineCore`

3) **AudioSystem**
- preload + play/stop pro `/voices`, `/music`, `/sounds`
- garantuje: preload proběhne před playing; během playing nevznikají nové requesty
- chybějící asset = no-op + log (nesmí shodit level)

> `UIRenderer` není samostatný subsystém: EngineCore drží jednoduchý **render model** (layers + effects + text), React ho vykreslí.

---

## Action system (zjednodušený, parametrický)

Cíl: **málo akcí**, ale každá je univerzální a parametrická. Všechny typy levelů jsou kompozice těchto akcí.

### Seznam akcí (minimální)

#### 1) Text

- **`text.set`**
  - parametry: `slot: "subtitle" | "caption"`, `text: string`, `style?: object`
- **`text.clear`**
  - parametry: `slot`

#### 2) Audio

- **`audio.play`**
  - parametry: `kind: "voice" | "music" | "sound"`, `file: string`, `id?: string`, `loop?: boolean`, `volume?: number`, `fadeMs?: number`
- **`audio.stop`**
  - parametry: `id?: string`, `kind?: "voice" | "music" | "sound"`, `fadeMs?: number`
- (volitelné, ale jednoduché) **`audio.mix`**
  - parametry: `preset: "duckMusicForVoice"`, `value?: number`

#### 3) UI / fake UI / vrstvy

- **`ui.layer`** (sjednocuje add/update/remove/toast/modal/button…)
  - parametry: `op: "add" | "update" | "remove"`, `id: string`, `type: string`, `props?: object`
  - příklady `type`: `"toast" | "modal" | "button" | "hud" | "overlay" | "image" | "noise" | "cursor"`

#### 4) Efekty (sjednocené)

- **`effect.start`**
- **`effect.stop`**
  - parametry: `type: "glitch" | "blur" | "invert" | "flash" | "shake" | "jitter"`, `intensity?: number`, `durationMs?: number`, `target?: string`

> Tím jsou sloučené původní `screen.flash`, `screen.shake`, `cursor.jitter`, `effect.glitch/blur/invertColors` do 2 akcí.

#### 5) Rules + traps/puzzle (sjednocené)

- **`rules.set`**
  - parametry: mapování `{ click, mouseMove, keyboard, scroll, touch }` → `"forbidden" | "allowed" | "required"`

- **`trap.set`** (jedna akce místo add/remove/arm/disarm/expect/ignoreWindow)
  - parametry:
    - `id: string`
    - `enabled: boolean`
    - `kind: "uiTarget" | "inputPattern" | "timeWindow"`
    - `match: object` (podle kind)
    - `result: { type: "fail" | "success" | "setVar", reason?: string, key?: string, value?: number }`

Příklady `match`:
- `uiTarget`: `{ layerId: "fakeBtn1", action: "click" }`
- `inputPattern`: `{ sequence: ["KeyX","KeyX","KeyX"], withinMs: 2000 }`
- `timeWindow`: `{ start: "9s", end: "10s", input: "click" }`

#### 6) Proměnné (escalation, narrator arc, meta)

- **`state.set`**: `key`, `value`
- **`state.add`**: `key`, `delta`

#### 7) Tok timeline (branch/random/loop)

- **`flow.goto`**: `label`
- **`flow.branch`**: `if`, `then`, `else`
- **`flow.random`**: `choices: string[]`, `seedKey?: string`

#### 8) Ukončení levelu

- **`level.end`**
  - parametry: `result: "success" | "fail"`, `reason?: string`

---

## Timeline (zjednodušená)

Cíl: jednoduché pro autora i implementaci, ale stále umí:
- časované akce,
- branch,
- random,
- loop.

### Základní pravidla

- Timeline je pole “kroků”.
- Krok může mít:
  - `at` (volitelné): absolutní čas od startu (`"0s"`, `"250ms"`, `"12.5s"`)
  - `when` (volitelné): trigger
  - `label` (volitelné): značka pro skoky
  - `do`: akce
- Krok bez `at` a bez `when` se provede **okamžitě**, jakmile se na něj “dostane” (typicky po `flow.goto`).
- `timeline.wait` se **ruší** (čekání se řeší `at` nebo `when`).

### Minimalistické triggery `when`

Pro MVP stačí:
- `when: { "input": "click" }`
- `when: { "input": "keyDown", "key": "Space" }`
- `when: { "var": "chaos", "gte": 3 }`

> “Audio-ended” trigger lze doplnit později bez změny action systému.

### Guardrails (aby se to dalo bezpečně implementovat)

- `flow.goto` má max počet skoků (např. 20) → ochrana proti nekonečným loopům.
- `flow.random` může být seedované přes `seedKey` (DEV/debug).

---

## Struktura level JSON (po refinementu)

### Action level

```json
{
  "id": 12,
  "type": "action",
  "title": "Ticho",

  "assets": {
    "voices": ["intro_12.mp3"],
    "music": ["ambient_1.ogg"],
    "sounds": ["error_1.wav", "click_fake.wav"]
  },

  "rules": {
    "click": "forbidden",
    "mouseMove": "forbidden",
    "keyboard": "forbidden",
    "scroll": "forbidden",
    "touch": "forbidden"
  },

  "end": { "type": "timer", "time": 20 },

  "timeline": [
    { "at": "0s", "do": "text.set", "slot": "subtitle", "text": "Vítej. Nedělej nic." },
    { "at": "2s", "do": "audio.play", "kind": "voice", "file": "intro_12.mp3", "id": "v1" },
    { "at": "5s", "do": "text.clear", "slot": "subtitle" },

    { "at": "8s", "do": "ui.layer", "op": "add", "id": "fakeToast1", "type": "toast",
      "props": { "text": "Klikni pro pokračování." } },

    { "at": "9s", "do": "trap.set", "id": "t1", "enabled": true,
      "kind": "uiTarget",
      "match": { "layerId": "fakeToast1", "action": "click" },
      "result": { "type": "fail", "reason": "Kliknul jsi. Hra skončila." } },

    { "at": "10s", "do": "flow.random", "choices": ["A", "B"], "seedKey": "rng" },

    { "label": "A" },
    { "do": "audio.play", "kind": "sound", "file": "error_1.wav" },
    { "do": "effect.start", "type": "shake", "intensity": 0.6, "durationMs": 400 },
    { "do": "flow.goto", "label": "END" },

    { "label": "B" },
    { "do": "effect.start", "type": "glitch", "intensity": 0.7, "durationMs": 1200 },
    { "do": "flow.goto", "label": "END" },

    { "label": "END" },
    { "at": "20s", "do": "level.end", "result": "success" }
  ],

  "signature": "hmac..."
}
```

### Custom level

```json
{
  "id": 77,
  "type": "custom",
  "module": "level_77_cursorChaos",
  "assets": { "voices": [], "music": [], "sounds": [] },
  "end": { "type": "timer", "time": 30 },
  "signature": "hmac..."
}
```

---

## Asset pipeline (upřesněno, vymahatelné)

### Pravidla

- **Preload před startem**: Engine musí dokončit `preload(assets)` před přechodem do playing.
- **Během playing 0 requestů**:
  - žádné fetch, žádné lazy load, žádné nové audio URL,
  - jen přehrávání již “připravených” assetů.
- **Chybějící asset nesmí shodit level**:
  - preload selhání = zaznamenat do event logu + pokračovat,
  - `audio.play` na chybějící file = no-op (tichý).

### Cesty

Autor zadává jen filename; engine mapuje na:
- `/assets/voices/<file>`
- `/assets/music/<file>`
- `/assets/sounds/<file>`

---

## Custom levely (`"type": "custom"`) — plugin nad stejným enginem

Custom je escape hatch, ale stále:
- používá stejný action system (přes `dispatch`),
- respektuje input safety,
- respektuje asset preload pravidla,
- nesmí mít vlastní “druhý scheduler”, který obchází core.

Koncept kontraktu:
- `onStart(ctx)` (volitelné)
- `onInput(inputEvent, ctx)` (volitelné)
- `onStop(ctx)` (volitelné)

`ctx` poskytne:
- `dispatch(action)`
- `getVar(key)` / `setVar(key, value)` (nebo přes `state.*`)
- `end(result, reason?)` (ekvivalent `level.end`)

---

## Jak může neprogramátor vytvořit level

Autor levelu typicky upraví jen:
- `rules` (forbidden/allowed/required),
- `assets` (seznam souborů),
- `end.time` (délka),
- `timeline` (kroky `at/label/when` + `do`).

Doporučený postup:
1) napsat texty (jen `text.set/clear`) a časy (`at`)
2) přidat voice/music/sfx (jen `audio.play/stop`)
3) přidat fake UI (jen `ui.layer`)
4) přidat pasti/puzzle (jen `trap.set`)
5) přidat chaos (jen `effect.start/stop`)
6) přidat random/branch/loop jen pokud je to potřeba (`flow.*`)

---

## Jak engine pokryje všech 22 typů levelů (po zjednodušení)

Vše je stále kompozice stejných akcí:

1. **wait**: `rules.set` forbidden + `text.*` + timer
2. **temptation**: `ui.layer` (provokace) + `trap.set` fail + `audio.play voice`
3. **cursor troll**: `ui.layer type:"cursor"` + `effect.start type:"jitter"/"shake"`
4. **visual chaos**: `effect.start` (glitch/flash/invert/blur) + `state.add` (escalation)
5. **sound**: `audio.play kind:"sound"/"music"` + text
6. **commentator**: `audio.play kind:"voice"` + `text.set` synchron
7. **psychological pressure**: `state.add` + `flow.branch` + fake warnings `ui.layer`
8. **fake game**: `ui.layer` (hud/button/modal) + `trap.set` + `rules.set` (opposite rules)
9. **hidden action puzzle**: `trap.set kind:"inputPattern"` + `flow.branch`
10. **time trick**: `trap.set kind:"timeWindow"` + `rules.set` (dočasně required/allowed) + `flow.branch`
11. **fake UI**: `ui.layer` + `trap.set kind:"uiTarget"`
12. **loop**: `flow.goto` + `state.add` (počítání cyklů) + guardrails
13. **meta**: `ui.layer` (fake debug) + voice/text + efekty
14. **random chaos**: `flow.random` + `effect.start` + `audio.play sound`
15. **minimalism**: minimum `text.*`, ticho, jemná music
16. **existential**: text + voice + ambient + dlouhé `at`
17. **expectation break**: dlouho klid + pak past `ui.layer` + `trap.set` + efekt
18. **input trap**: `trap.set` kolem fake UI + `rules.set` forbidden
19. **opposite rules**: `rules.set` přepínané v čase + `trap.set timeWindow` pro validaci
20. **chaos escalation**: `state.add chaos` + `flow.branch` → přidávat `effect/ui/audio`
21. **narrator arc**: `state.*` (fáze) + voice/text + branch/random podle proměnných
22. **kombinované**: segmenty přes `label` + `flow.goto/branch/random`

---

## Shrnutí před implementací

- **0 requestů během playing**: preload ve `loading/intro`.
- **Input bezpečnost**: attach/detach podle phase + `data-no-game-input`.
- **Jeden engine**: action levely + custom jako plugin nad stejným dispatch/state.
- **Jednoduchý action set**: `text`, `audio`, `ui.layer`, `effect`, `rules`, `trap`, `state`, `flow`, `level.end`.

# NÁVRH NOVÉHO LEVEL ENGINE (Action‑Based, univerzální)

Tento dokument navrhuje **jeden univerzální action-based engine** pro hru **Nedělej nic**, který je:

- **data-driven** (čitelné JSON pro tvorbu levelů),
- **timeline-based** (časované eventy),
- podporuje **assets** (`/voices`, `/music`, `/sounds`),
- splňuje pravidlo z `docs/AI_PROJECT_CONTEXT.md`: **během běhu levelu musí být 0 requestů na server**,
- má bezpečný **input lifecycle** (stavově řízené listenery + `data-no-game-input`, jak je popsáno v `docs/ARCHITECTURE.md` a `docs/PROJECT_OVERVIEW.md`),
- umí fallback na `"type": "custom"` (načtení JS levelu ze složky `levels/`).

---

## Architektura nového engine

### Princip: “Level je scénář, engine je interpret”

Level je textově čitelný scénář složený z:
- **timeline** (co se kdy stane),
- **pravidel** (co je zakázaná / povolená akce hráče, případně “opačná pravidla”),
- **akcí** (action system) — univerzální stavebnice pro všechny typy levelů,
- **vrstev** (layers) — UI, zvuk, kurzor, fake UI, chaos efekty atd.

Engine je runtime, který:
- načte data levelu,
- **preloadne** všechny potřebné assety před startem,
- během běhu levelu:
  - plánuje timeline eventy,
  - dispatchuje akce (mutace scénického stavu),
  - řídí input detekci,
  - vyhodnocuje “fail/success/end” podmínky,
  - neposílá žádné requesty,
- po skončení:
  - vrátí výsledek orchestru (UI stránce), která teprve poté pošle `/result`.

### Modulární návrh (konceptuální)

- **LevelRunner**
  - API: `load(level)`, `preload()`, `start()`, `stop()`, `pause()`, `resume()`
  - drží reference na níže uvedené subsystémy
- **TimelineScheduler**
  - bere `timeline[]` a podle času/triggerů spouští “actions”
  - podporuje: absolutní čas, relativní offset, značky/labely, podmínky, náhody
- **ActionDispatcher**
  - validuje a vykonává akce (čistě deterministické mutace “LevelState”)
  - loguje provedené akce pro DEV režim
- **StateStore (LevelState)**
  - jediný zdroj pravdy pro aktuální scénu: texty, vrstvy, zvuky, kurzor, aktivní pasti, pravidla, proměnné…
- **InputManager**
  - stavově attach/detach DOM listenerů (jen ve fázi “playing”)
  - překládá fyzický input → **input akce** (např. `input.click`, `input.keyDown`)
  - respektuje `data-no-game-input`
- **AudioManager**
  - preload a playback pro `/voices`, `/music`, `/sounds`
  - režimy: jednorázové efekty, voice line, hudba v loopu, ducking
- **UIRenderer**
  - vykreslí “vrstvy” podle `LevelState`
  - engine neřeší konkrétní React komponenty; jen publikuje render model
- **CustomLevelAdapter**
  - když `type: "custom"`, načte JS modul (před startem), který vrací stejný “level contract”

Tento návrh zachovává současnou filozofii projektu:
- backend generuje data a podepisuje,
- frontend engine data pouze interpretuje,
- **0 requestů během levelu**.

---

## Action system (seznam akcí)

Akce jsou základní stavební bloky. Jsou záměrně obecné: jeden engine, mnoho kombinací.

### 1) Text / narrace

- **`subtitle.show`**: zobraz text (komentátor, systémové hlášky)
- **`subtitle.clear`**: smaž subtitle
- **`caption.show`**: druhá textová vrstva (např. “fake system toast”)
- **`log.note`**: interní log (DEV overlay, analytika bez networku)

### 2) Audio (assets)

- **`audio.voice.play`**: zahraj voice line z `/voices`
- **`audio.music.play`**: spusť hudbu z `/music` (loop/volume/fade)
- **`audio.music.stop`**: stop / fade out
- **`audio.sfx.play`**: zvukový efekt z `/sounds`
- **`audio.duck`**: dočasně ztlumí music při voice (ducking)

### 3) Vrstvy UI / fake UI

- **`layer.add`**: přidej vrstvu (id, typ, styl, z-index, interaktivita)
- **`layer.update`**: změň vlastnosti vrstvy (text, pozice, animace, viditelnost)
- **`layer.remove`**: odeber vrstvu
- **`ui.toast`**: fake toast (např. “Systémová chyba”)
- **`ui.modal`**: fake modal / dialog
- **`ui.button.spawn`**: fake tlačítko (včetně “past” nastavení)

### 4) Kurzor / vizuální chaos

- **`cursor.mode`**: změň kurzor (hidden, fake cursor, inverted, multiple)
- **`cursor.jitter`**: třes/offset kurzoru (čistě vizuálně)
- **`screen.shake`**: otřes obrazovky
- **`screen.flash`**: flash overlay
- **`effect.glitch`**: glitch / noise overlay
- **`effect.invertColors`**: invert/kontrast
- **`effect.blur`**: blur

### 5) Pravidla a pasti (vyhodnocení inputu)

Základní princip: engine umí “co je fail”, ale zároveň musí podporovat:
- **opposite rules** (někdy je akce povinná),
- **hidden action puzzle** (správná tajná akce),
- **input trap** (engine provokuje k akci).

Akce:

- **`rules.set`**: nastav “zakázané / povolené / povinné” akce
  - např. `click: forbidden`, `mouseMove: forbidden`, `keydown: forbidden`
  - nebo `click: required` (opposite rules)
- **`trap.add`**: definuj past (např. “klik na fake tlačítko failne”)
- **`trap.remove`**
- **`trap.arm/disarm`**: aktivace pastí podle času/triggerů
- **`input.expect`**: čekej na konkrétní input pattern (puzzle)
- **`input.ignoreWindow`**: grace period nebo “safe window” (časový trik)

### 6) Timeline control (meta akce)

- **`timeline.wait`**: explicitní wait (čitelné pro autora)
- **`timeline.jump`**: skok na label (loop)
- **`timeline.branch`**: podmíněný skok podle stavu (např. hráč udělal / neudělal akci)
- **`timeline.random`**: náhodná větev
- **`state.setVar` / `state.incVar`**: proměnné pro psychologický tlak / eskalaci

### 7) Ukončení levelu

- **`level.end.success`**
- **`level.end.fail`** (s důvodem)
- **`level.end.timer`**: definice trvání / hard end


---

## Struktura level JSON (návrh)

Cíl: **čitelné i pro neprogramátora**. Proto:
- jednoduché názvy,
- minimální vnoření,
- timeline akce se píšou jako “věty”.

### Základní schema (koncept)

```json
{
  "id": 12,
  "type": "action",
  "title": "Ticho",
  "difficulty": 2,

  "assets": {
    "voices": ["intro_12.mp3", "laugh_1.mp3"],
    "music": ["ambient_1.ogg"],
    "sounds": ["error_1.wav", "click_fake.wav"]
  },

  "rules": {
    "click": "forbidden",
    "mouseMove": "forbidden",
    "keyboard": "forbidden",
    "scroll": "forbidden",
    "touch": "forbidden"
  },

  "timeline": [
    { "at": "0s",  "do": "subtitle.show", "text": "Vítej. Nedělej nic." },
    { "at": "2s",  "do": "audio.voice.play", "file": "intro_12.mp3" },
    { "at": "5s",  "do": "subtitle.clear" },
    { "at": "8s",  "do": "ui.toast", "text": "Klikni pro pokračování." },
    { "at": "10s", "do": "timeline.random", "choices": ["A", "B"] },

    { "label": "A" },
    { "do": "audio.sfx.play", "file": "error_1.wav" },
    { "do": "subtitle.show", "text": "To bylo těsné." },
    { "at": "20s", "do": "level.end.success" },

    { "label": "B" },
    { "do": "effect.glitch", "intensity": 0.6 },
    { "at": "20s", "do": "level.end.success" }
  ],

  "end": { "type": "timer", "time": 20 },

  "signature": "hmac..."
}
```

### Poznámky ke čitelnosti

- `do` je název akce.
- parametry jsou “přirozené”: `text`, `file`, `volume`, `loop`, `id`.
- čas je string (`"10s"`, `"250ms"`) — pro neprogramátora čitelné.
- `label` umožní psát loop/branch bez složitých indexů.

### Rozšíření pro “custom”

```json
{
  "id": 77,
  "type": "custom",
  "module": "level_77_cursorChaos",
  "assets": { "voices": [], "music": [], "sounds": [] },
  "end": { "type": "timer", "time": 30 },
  "signature": "hmac..."
}
```

---

## Jak funguje timeline

Timeline musí umět 3 věci:

1. **časované akce** (klasický “v čase t proveď akci”)
2. **trigger-based akce** (na input / na splnění podmínky / na dokončení audia)
3. **větvení a loop** (meta, escalation, expectation break)

### 1) Časované eventy

- `at: "Ns"` je absolutní čas od startu levelu.
- může existovat i `after: "Ns"` jako relativní offset od poslední akce nebo od labelu (autorsky přívětivé).

### 2) Trigger-based eventy

Návrh triggerů (koncept):

- `when: { "input": "click" }`  
- `when: { "input": "keyDown", "key": "Space" }`
- `when: { "state": { "var": "temptation", "gte": 3 } }`
- `when: { "audioEnded": "intro_12.mp3" }`

Typické použití:
- hidden action puzzle: čekej na tajný pattern
- fake game: reaguj na interakci
- psychological pressure: eskaluj po každé “odolal jsi”

### 3) Větvení, random, loop

Pro autory:
- `timeline.branch` (podmínka → label)
- `timeline.random` (náhodný label)
- `timeline.jump` (loop)

Zároveň engine musí hlídat bezpečnost:
- max počet skoků / max délka timeline (aby se level “nezacyklil” bez limitu),
- determinismus: pro replay/debug lze seedovat random (DEV).

### Pause/Resume (DEV)

Zachovat současný princip:
- při `pause` se zastaví scheduler a input se odpojí (UI je bezpečné),
- při `resume` se přepočítá elapsed a pokračuje se v timeline.

---

## Jak se načítají assets (`/voices`, `/music`, `/sounds`)

Požadavek: během levelu **nesmí běžet žádné requesty**.

### Návrh asset pipeline

- Level JSON v `assets` explicitně vyjmenuje soubory, které se musí preloadnout:
  - `voices`: komentátor (speech/voice lines)
  - `music`: hudba / atmosféra
  - `sounds`: SFX
- `AudioManager.preload(assets)` se provede **před startem** (`phase: loading/intro`).

### Cesty (koncept)

Engine pracuje s pevnými base path:
- `/assets/voices/<file>`
- `/assets/music/<file>`
- `/assets/sounds/<file>`

Tím se vyhne “magii” a autor levelu ví, kam soubor patří.

### Fallback chování

- Preload chyby nesmí shodit hru (stejně jako dnes `preloadAssets` resolve i na `error`), ale:
  - engine může zaznamenat `asset.missing` do event logu (DEV),
  - akce `audio.*.play` by měla být no-op, pokud asset není dostupný.

---

## Jak fungují custom levely (`"type": "custom"`)

Požadavek: možnost fallbacku na JS level, ale **ne 22 enginů**.

### Princip

Custom level je “escape hatch” pro výjimečné mechaniky, které nejdou pohodlně popsat action sistemem.

Custom modul:
- se načítá **před startem** (v loading/intro fázi),
- nesmí spouštět síťové requesty během playing,
- musí komunikovat s enginem přes stejný ActionDispatcher/StateStore (tj. custom level nesmí být “druhý engine”, pouze “custom script”).

### Rozhraní custom levelu (koncept)

Custom level by měl umět:
- dodat vlastní `timeline` nebo přímo registrovat “hooks”:
  - `onStart(ctx)`
  - `onInput(event, ctx)`
  - `onTick(elapsed, ctx)` (opatrně; preferovat timeline)
  - `onStop(ctx)`
- používat `ctx.dispatch(action)` pro stejné akce, které používá JSON.

Výhoda:
- engine zůstává jednotný (logování, pause/resume, input safety, asset preload).
- custom level jen “přidá chování”.

---

## Jak může neprogramátor vytvořit level

Cíl je, aby autor levelu psal hlavně:
- pravidla (co hráč nesmí / musí),
- timeline scénář (co se kdy stane),
- asset seznam (jaké voice/music/sfx použít).

### Doporučený pracovní postup pro autora

1. Vybrat šablonu (např. “wait”, “temptation”, “sound”, “fake UI”…).
2. Vyplnit:
   - `title`
   - `rules` (většinou “forbidden” akce)
   - `end.time` (délka)
3. Napsat `timeline` jako seznam kroků:
   - `subtitle.show` / `clear`
   - `audio.voice.play`
   - `ui.toast` / `ui.modal` / `layer.add`
   - (volitelně) random/branch/loop
4. Dodat audio soubory do správných složek: `/voices`, `/music`, `/sounds`.

### “Autorská jednoduchost” v JSON

Pro neprogramátora je zásadní:
- krátké akce,
- názvy souborů bez cest (jen `file: "welcome.mp3"`),
- časování v sekundách.

Zároveň engine drží interní komplexitu (state machine, input safety, scheduling).

---

## Jak engine pokryje všech 22 typů levelů

Níže je mapování “typů levelů” na kombinace akčních bloků. Nejsou to různé enginy, jen jiné scénáře.

### 1) wait

- `rules.set` (většina akcí forbidden)
- timeline: subtitle + ticho + `level.end.success` na timer

### 2) temptation

- `ui.toast`/`ui.button.spawn` (provokace)
- `audio.voice.play` (komentář)
- stále `click` forbidden, nebo občas “opposite”

### 3) cursor troll

- `cursor.mode` (fake cursor / multiple)
- `cursor.jitter`, `screen.shake`
- kombinace s fake UI

### 4) visual chaos

- `effect.glitch`, `effect.invertColors`, `effect.blur`, `screen.flash`
- eskalace přes `state.incVar` + `timeline.branch`

### 5) sound

- `audio.sfx.play` (random),
- `audio.music.play` (psychologický tlak),
- “ticho” jako past (náhlý zvuk na 19.8s)

### 6) commentator

- `audio.voice.play` + `subtitle.show` (synchronizace)
- “narrator arc” přes proměnné a větvení

### 7) psychological pressure

- eskalace: `state.incVar` + `timeline.branch`
- fake warnings: `ui.toast`, `ui.modal`
- zvukové efekty + glitch

### 8) fake game

- `layer.add` (fake HUD, score, progress)
- `ui.button.spawn` (start/pause fake)
- často “opposite rules”: v určitém momentu je akce povinná nebo naopak zakázaná

### 9) hidden action puzzle

- `input.expect` (pattern: např. “stiskni X 3× během 2s”, nebo “klikni do konkrétní zóny”)
- “maskování” přes `layer.add` (UI šum)

### 10) time trick

- `input.ignoreWindow` (krátké safe okno)
- `timeline.branch` (pokud hráč klikl v okně → success, jinak fail nebo opačně)
- falešné countdowny (UI)

### 11) fake UI

- `ui.modal`, `ui.toast`, `layer.add/update/remove`
- pasti přes `trap.add` (klik na “OK” failne)

### 12) loop

- `timeline.jump` na label + limit skoků
- “když odoláš N cyklů → success”

### 13) meta

- engine/DEV vibe bez skutečného DEV módu:
  - fake debug panel (`layer.add`)
  - fake “engine error” (`ui.modal`)
  - komentátor “mluví o kódu”

### 14) random chaos

- `timeline.random` (branch do různých segmentů)
- náhodné SFX/FX
- seedovatelný random pro DEV

### 15) minimalism

- minimum vrstev: jen subtitle + ticho
- jemné audio/voice

### 16) existential

- `subtitle.show` (filozofické texty)
- dlouhé pauzy
- hudba/ambient

### 17) expectation break

- scénář buduje očekávání a pak ho poruší:
  - např. celý level ticho a na 1s před koncem přijde obří fake UI past
- realizace přes timeline + efekty + UI

### 18) input trap

- `trap.add` kolem “nevinných” prvků
- dynamické arm/disarm
- `data-no-game-input` se používá jen pro “skutečné UI” (např. DEV overlay), fake UI je součást levelu → má být chytané

### 19) opposite rules

- `rules.set` přepíná forbidden ↔ required v čase
- `timeline.branch` podle toho, zda hráč splnil “required” akci v okně

### 20) chaos escalation

- proměnná `chaosLevel`
- každý interval: `state.incVar` + `timeline.branch` → přidá další efekty, zvuky, fake UI

### 21) narrator arc

- dlouhodobý oblouk komentátora:
  - v rámci jednoho levelu: segmenty voice + text + eskalace tónu
  - mezi levely: tato vrstva je spíše obsahová, ale engine musí umožnit “voice playlist” a proměnné

### 22) kombinované levely

- kombinace všeho výše:
  - timeline segmenty (A: minimalism, B: fake UI, C: cursor troll, D: puzzle)
- action-based engine to podporuje přirozeně, protože vše je jen kompozice akcí.

---

## Shrnutí klíčových pravidel pro implementaci (později)

- **Žádné requesty během playing**: preload vše v loading/intro.
- **Input je stavově řízený**: attach jen v playing; UI chránit `data-no-game-input`.
- **Timeline je zdroj pravdy**: i “random chaos” je jen timeline branch.
- **Custom levels nejsou nový engine**: jen plugin/hook nad ActionDispatcher + StateStore.

