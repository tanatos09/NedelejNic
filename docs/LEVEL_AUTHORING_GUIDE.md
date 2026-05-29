# Tvorba levelů (kompletní průvodce)

Tento dokument je **úplná referenční příručka** pro tvorbu levelů hry *Nedělej nic*. Najdeš tu vše, co engine umí, jak se to zapisuje do JSON a hotové recepty na mechaniky.

> Zdroj pravdy v kódu: typy `client/src/engine/newEngine/types.ts`, validátor `client/src/engine/newEngine/LevelValidator.ts`, běh `LevelRunner.ts` + `TimelineScheduler.ts` + `ActionDispatcher.ts`. Příklady: `levels/tests/`.

---

## 0. Jak to funguje v kostce

- **Level = jeden `.json` soubor** ve složce `levels/` nebo `levels/tests/`.
- Server (`server/src/levels.ts`) najde soubor podle `id`, přidá **podpis** a pošle klientovi. **`levels/tests/` má přednost** před zbytkem `levels/`. Pokud má víc souborů stejné `id`, vyhraje první nalezený — proto **drž `id` unikátní**.
- Klient level **zvaliduje** (neblokující warnings/errors do logu), **přednačte audio**, a po kliknutí na „Začít" spustí **timeline** (časovou osu).
- Postup mezi levely řídí server: `id` jsou **sekvenční** (1, 2, 3, …). Hráč po skončení levelu jde na `id + 1` (po výhře i prohře).

Číslování: **Prolog = level `id: 1`**, první herní blok = `id: 2`, atd.

---

## 1. Minimální šablona

```json
{
  "id": 100,
  "type": "action",
  "title": "Název bloku",
  "description": "K čemu level je (jen pro lidi, engine ignoruje).",
  "assets": { "voices": [], "music": [], "sounds": [] },
  "rules": {
    "click": "allowed",
    "mouseMove": "allowed",
    "keyboard": "allowed",
    "scroll": "allowed",
    "touch": "allowed"
  },
  "end": { "type": "timer", "time": 60 },
  "timeline": [
    { "at": "0s", "do": "text.set", "slot": "subtitle", "text": "Ahoj." },
    { "at": "60s", "do": "level.end", "result": "success" }
  ]
}
```

JSON **nesmí obsahovat komentáře** a musí být platný.

---

## 2. Pole na nejvyšší úrovni

| Pole | Povinné | Význam |
|------|---------|--------|
| `id` | ano | Číslo levelu (unikátní napříč všemi soubory). |
| `type` | ano | `"action"` (běžné, řízené `timeline`). `"custom"` existuje v typech, ale **runtime plugin systém není dokončený** — pro obsah používej `action`. |
| `title` | ne | Krátký název (jen pro orientaci). |
| `description` | ne | Popis pro autory. |
| `assets` | doporučeno | Soubory k přednačtení: `{ "voices": [], "music": [], "sounds": [] }`. |
| `rules` | ne | Výchozí režim vstupů (viz §4). |
| `end` | doporučeno | `{ "type": "timer", "time": <sekundy> }`. Slouží pro odpočet v UI a pro podpis. **Sám o sobě level neukončí** — konec musí přijít z `timeline` / pasti / Karrela. |
| `ending` | ne | Závěrečná Karrelova hláška po konci levelu (viz §8). |
| `karrel` | ne | Reakce Karrela na vstup mimo timeline (viz §7). |
| `timeline` | ano (u `action`) | Seřazené kroky časové osy (viz §3). |

---

## 3. Timeline (časová osa)

`timeline` je pole **kroků**. Engine je vykonává shora dolů; každý krok může mít:

- **`at`** — kdy se spustí od startu levelu: `"0s"`, `"1.5s"`, `"500ms"`. Čas v minulosti = provede se hned (catch-up). Stejné `at` = pořadí v poli.
- **`when`** — *blokující* čekání na podmínku (viz níže). Dokud není splněna, timeline stojí (ale **vstup a pasti běží dál**).
- **`do`** — akce k provedení (viz §5).
- **`label`** — pojmenované místo pro `flow.goto` / `flow.branch` / `flow.random`. Krok jen s `label` (bez `do`) je značka.

### `when` (blokující podmínka)

| Tvar | Splněno když |
|------|--------------|
| `{ "input": "click" }` | přijde kliknutí |
| `{ "input": "keyDown", "key": "Enter" }` | stisk konkrétní klávesy; `key` = DOM `event.code` (`"Enter"`, `"Space"`, `"Escape"`, `"KeyA"`, `"F12"`, …) |
| `{ "var": "x", "gte": 1 }` | proměnná `x` ≥ 1 |

> Pozn.: `when` blokuje *postup timeline*. Souběžné věci (Karrel `behaviors`, pasti, pravidla) běží nezávisle.

---

## 4. Pravidla vstupu (`rules`)

Pět vstupů: `click`, `mouseMove`, `keyboard`, `scroll`, `touch`. Každý může být:

| Režim | Chování |
|-------|---------|
| `"allowed"` | vstup je v pořádku, nic se neděje |
| `"forbidden"` | vstup **okamžitě ukončí level neúspěchem** (engine použije obecnou hlášku, např. „Pohnul jsi myší. Hra skončila.") |
| `"required"` | rezervováno; engine sám **nevynucuje** (žádný auto-fail). Pokud chceš „aktivita = výhra", řeš to přes Karrel `behaviors` nebo past. |

Pravidla lze měnit za běhu přes `rules.set` (viz §5).

> **Tip na tón:** `forbidden` dává neutrální systémovou hlášku. Když chceš, aby fail zněl Karrelovým hlasem, nech `allowed` a fail vyřeš přes `karrel.behaviors` s `level.end` + vlastním `reason` (viz §7, §10).

---

## 5. Akce (`do`) — kompletní referenční seznam

Validátor zná tyto akce: `text.set`, `audio.play`, `audio.stop`, `ui.layer`, `effect.start`, `effect.stop`, `rules.set`, `trap.set`, `state.set`, `state.add`, `flow.goto`, `flow.branch`, `flow.random`, `level.end`, `game.input.enable`, `game.input.disable`.

> `hook.run` existuje v kódu enginu, ale **není ve validátoru** (nahlásí „unknown action") a v datových levelech ho **nepoužívej**.

### `text.set` — text na obrazovce
```json
{ "do": "text.set", "slot": "subtitle", "text": "Nedělej nic." }
```
- `slot`: `"subtitle"` (hlavní řádek) nebo `"caption"` (menší kurzíva, „systémové" hlášky v hranatých závorkách).
- Prázdný `text: ""` slot vyčistí.

### `audio.play` / `audio.stop` — zvuk
```json
{ "do": "audio.play", "kind": "voice", "file": "2-1.mp3", "id": "v1", "loop": false, "volume": 1 }
{ "do": "audio.stop", "id": "v1" }
{ "do": "audio.stop", "kind": "music" }
```
- `kind`: `"voice"` | `"music"` | `"sound"` → cesty `/assets/voices|music|sounds/<file>`.
- `id` (volitelné): pojmenuje přehrávání, aby šlo cíleně zastavit (`audio.stop` s `id`).
- `loop`, `volume` (0–1). Soubor **musí být v `assets`** (jinak se nepřednačte; chybějící soubor = tichý no-op + log, engine nespadne).

### `ui.layer` — UI vrstva (toast / tlačítko / obrázek …)
```json
{ "do": "ui.layer", "op": "add", "id": "warn1", "type": "toast",
  "props": { "text": "Varování.", "position": "top", "interactive": true,
             "variant": "warning", "z": 30, "freezeTimeline": true, "dismissAfterMs": 4000 } }
{ "do": "ui.layer", "op": "update", "id": "warn1", "type": "toast", "props": { "text": "Nový text" } }
{ "do": "ui.layer", "op": "remove", "id": "warn1", "type": "toast" }
```
- `op`: `add` | `update` | `remove`.
- `type`: `toast | modal | button | overlay | hud | noise | cursor | image`. **Renderer kreslí všechny typy jako stylovaný box s `props.text`**; typ `image` dostane navíc **velkou čtvercovou dlaždici** (vhodné pro captcha — viz §10).
- `props.position`: `center | top | topRight | topLeft | bottom | bottomRight | bottomLeft` (7 pevných pozic; mřížku 3×2 složíš z rohů + `top`/`bottom`).
- `props.interactive: true` → vrstva je klikatelná a klik na ni nese `targetLayerId` (chytá ji past `uiTarget`).
- `props.z`: pořadí překryvu.
- `props.variant` (`neutral|warning|danger|success`) se ukládá, ale **současný renderer podle něj zatím nemění barvu**.
- **Zmrazení času (`freezeTimeline`)** — viz §6.

### `effect.start` / `effect.stop` — vizuální efekt
```json
{ "do": "effect.start", "type": "glitch", "intensity": 0.5 }
{ "do": "effect.stop", "type": "glitch" }
```
- `type`: `glitch | blur | invert | flash | shake | jitter`.
- **Renderer aktuálně vykresluje jen `invert`, `blur`, `glitch`** (ostatní se uloží do stavu, ale nemají vizuál).

### `rules.set` — změna pravidel za běhu
```json
{ "do": "rules.set", "rules": { "click": "allowed", "mouseMove": "forbidden" } }
```

### `trap.set` — past na vstup
```json
{ "do": "trap.set", "id": "t1", "enabled": true, "kind": "uiTarget",
  "match": { "layerId": "btn", "action": "click" },
  "result": { "type": "fail", "reason": "Klik na návnadu." } }
```
- `result.type`: `"fail"` (konec neúspěchem, volitelně `reason`) | `"success"` (konec výhrou) | `"setVar"` (nastaví `key` na `value`).
- `kind`:
  - **`uiTarget`** (jen klik): `match: { "layerId": "<id vrstvy>", "action": "click" }`.
  - **`inputPattern`**: `match: { "sequence": ["click","click"], "withinMs": 1500 }`. Token je `click` nebo `event.code` u kláves.
  - **`timeWindow`**: `match: { "start": "6s", "end": "8s", "input": "click" }` — když daný typ vstupu přijde v okně.

### `state.set` / `state.add` — proměnné stavu
```json
{ "do": "state.set", "key": "score", "value": 0 }
{ "do": "state.add", "key": "score", "delta": 1 }
```
- Hodnota je číslo nebo string. Proměnné čte `flow.branch`, `when {var,gte}` i Karrel `whenVar`.

### `flow.goto` / `flow.branch` / `flow.random` — větvení
```json
{ "do": "flow.goto", "label": "konec" }

{ "do": "flow.branch", "if": { "var": "score", "op": "gte", "value": 3 },
  "then": "OK", "else": "BAD" }

{ "do": "flow.random", "choices": ["vetev_a", "vetev_b"], "seedKey": "x" }
```
- `flow.branch.if.op`: `eq | gte | lte`. `then`/`else` jsou **názvy labelů**.
- `flow.random.choices` jsou **názvy labelů**; výběr je deterministický podle `id` levelu + `seedKey`.
- Limit skoků na level je 20 → pak `fail` („loop limit exceeded"). Hlídej, ať nevznikne nekonečná smyčka.

### `level.end` — ukončení levelu
```json
{ "do": "level.end", "result": "success" }
{ "do": "level.end", "result": "fail", "reason": "Aktivita detekována." }
```
- `reason` se u `fail` ukáže hráči v koncovém okně (pokud není přebito sekcí `ending`).

### `game.input.enable` / `game.input.disable`
```json
{ "do": "game.input.disable" }
{ "do": "game.input.enable" }
```
- Vypne/zapne předávání vstupů do scheduleru (pasti, `forbidden` pravidla) **i do Karrela**. Po startu levelu je zapnuto.
- **Typický vzor:** během úvodních „keců" `disable`, aby hráč nemohl předčasně prohrát/vyhrát; v ostré části `enable`; v závěru zase `disable`.

---

## 6. Alert s pozastavením času (`freezeTimeline`)

U `ui.layer` `op: add` lze v `props`:

- **`freezeTimeline: true`** — zastaví herní čas i timeline a ztiší přehrávané audio (bez resetu pozice).
- **`dismissAfterMs`** — po tolika ms alert sám zmizí a čas pokračuje.
- **`interactive: true`** — hráč alert zavře **klikem na vrstvu** (stejné `id`).

Když není ani interaktivní klik, ani kladné `dismissAfterMs`, použije se rozumný výchozí čas (5 s). **Pořadí v `then`:** nejdřív text + `audio.play`, **nakonec** `ui.layer` s `freezeTimeline` (zmrazení až po hlášce). Po skončení alertu vrstva zmizí a timeline běží dál.

---

## 7. Karrel — reakce na vstup (`karrel`)

Sekce `karrel` reaguje na vstupy **paralelně** k timeline (nečeká na časové značky).

```json
"karrel": {
  "memoryDefaults": { "presence": "quiet", "activity_phase": 0 },
  "behaviors": [
    {
      "whenAny": ["click", "mouseMove", "keyboard", "scroll", "touch"],
      "whenVar": { "key": "karrel.activity_phase", "op": "eq", "value": 0 },
      "onceGroup": "prvni_varovani",
      "then": [
        { "do": "state.set", "key": "karrel.activity_phase", "value": 1 },
        { "do": "text.set", "slot": "subtitle", "text": "Lidé mívají problém nedělat nic." },
        { "do": "ui.layer", "op": "add", "id": "w1", "type": "toast",
          "props": { "text": "První chyba.", "interactive": true, "freezeTimeline": true, "dismissAfterMs": 5000 } }
      ]
    }
  ]
}
```

**Pravidla enginu:**

- **Na jeden vstup se provede nejvýše jedno chování** — první v pořadí, které sedí na podmínky. Proto piš bloky **od nejnižší fáze po nejvyšší**.
- `whenAny`: pole typů vstupu (`click`, `mouseMove`, `keyboard`, `scroll`, `touch`). Alternativa `when: { "input": "keyboard", "keyCode": "F12" }`.
- `whenVar` (volitelné): `{ "key", "op": "eq"|"gte"|"lte", "value" }`. Klíče bývají `karrel.*` (díky `memoryDefaults`), ale **může to být jakákoli proměnná, včetně `karma`** (viz §9).
- `onceGroup` (volitelné): daný blok se spustí jen jednou za level.
- `then`: seznam akcí (stejné `do` jako v timeline). Pokud `then` obsahuje `level.end`, Karrel ukončí level.
- `memoryDefaults`: výchozí čísla/stringy; uloží se jako `karrel.<key>`.

> Karrel může level **ukončit výhrou i prohrou** přes `level.end` ve `then` — tím se dělají mechaniky „aktivita vyhrává" (level 6) nebo „pohyb prohrává" (level 11).

---

## 8. Závěrečná hláška Karrela (`ending`)

Po skončení levelu (výhra/prohra) engine **ještě na herní obrazovce** přehraje krátkou závěrečnou hlášku a teprve potom se objeví okno s tlačítkem **Pokračovat**.

```json
"ending": {
  "success": { "caption": "[Blok uzavřen]", "subtitle": "Záznam je čistý.", "voice": "x-close-win.mp3", "holdMs": 4500 },
  "fail":    { "caption": "[Blok ukončen]", "subtitle": "Aktivita uzavřela blok.", "voice": "x-close-fail.mp3", "holdMs": 4500 }
}
```

- `success` / `fail` jsou samostatné „beaty" — můžeš mít jen jeden (např. levely, které nemůžou prohrát, mají jen `success`).
- Pole: `caption?`, `subtitle?`, `voice?` (musí být v `assets.voices`), `holdMs?` (jak dlouho držet hlášku, výchozí 4500 ms).
- Při zobrazení závěru engine **smaže UI vrstvy z levelu** (zmizí captcha dlaždice, toasty…), takže zůstane jen čistá hláška.
- Když `ending` chybí, level jde rovnou do koncového okna (jako prolog a level 2).

---

## 9. Karmický systém (`karma`)

Hra vede **lokální karmické skóre** (`client/src/services/karma.ts`, ukládá se do `localStorage` per uživatel):

- **výhra levelu = +1**, **prohra = −1**.
- Aktuální skóre se na začátku každého levelu **nahraje do enginu jako proměnná `karma`**.

Díky tomu může level **měnit odpovědi Karrela podle skóre** — přes `flow.branch` (v timeline) nebo Karrel `whenVar` (na vstup). Když to v levelu nepoužiješ, jede vše čistě podle scénáře.

**Příklad: tři varianty hlášky podle karmy (timeline)**
```json
{ "at": "6s", "do": "flow.branch", "if": { "var": "karma", "op": "gte", "value": 2 }, "then": "k_high", "else": "k_check_low" },

{ "label": "k_check_low" },
{ "do": "flow.branch", "if": { "var": "karma", "op": "lte", "value": -2 }, "then": "k_low", "else": "k_neutral" },

{ "label": "k_high" },
{ "do": "text.set", "slot": "subtitle", "text": "Tvá disciplína je nadprůměrná." },
{ "do": "flow.goto", "label": "k_done" },

{ "label": "k_low" },
{ "do": "text.set", "slot": "subtitle", "text": "Tvá data vykazují opakovaný neklid." },
{ "do": "flow.goto", "label": "k_done" },

{ "label": "k_neutral" },
{ "do": "text.set", "slot": "subtitle", "text": "Tvá data jsou zatím nevýrazná." },
{ "do": "flow.goto", "label": "k_done" },

{ "label": "k_done" }
```

**Příklad: karma v Karrel reakci (na vstup)**
```json
{ "whenAny": ["mouseMove"], "whenVar": { "key": "karma", "op": "lte", "value": -3 },
  "then": [ { "do": "text.set", "slot": "subtitle", "text": "Zase ty." } ] }
```

Reálné ukázky: `levels/tests/08_monologue.json` a `levels/tests/12_cutscene.json`.

---

## 10. Recepty na mechaniky

### A) Čekání s tolerancí chyb (chyba = jen poznámka, neprohraje)
Karrel `behaviors` s fázemi, které jen zobrazí neutrální toast (`freezeTimeline`) a navýší fázi. Žádný `level.end fail`. Timeline končí `level.end success` na čase. → `03_tolerance.json`.

### B) Nulová tolerance (jakákoli aktivita = prohra)
Buď `rules` vše `forbidden`, nebo (pro Karrelův tón) `allowed` + jedno `behaviors` `whenAny` → `level.end fail` s vlastním `reason`. → `04_zero_tolerance.json`.

### C) Aktivita vyhrává / pohyb prohrává
`behaviors` `whenAny` (nebo jen `["mouseMove"]`) → `level.end success`/`fail`; timeline na konci dá opačný výsledek. Během úvodu `game.input.disable`. → `06_activity.json`, `11_inverted.json`.

### D) Časové okno (klik jen mezi X a Y s)
`trap.set` `timeWindow` + `state.set`/`setVar`, na konci `flow.branch`. → vzor `19_opposite_rules.json`.

### E) Hudba / zvukový podnět (vydržet bez pohybu)
`assets.music` s více stopami, `flow.random` vybere stopu, `audio.play` (loop), reakce na vstup přes `behaviors` → `fail`. → `07_sound_provocation.json`.

### F) Captcha „klikni na obrázek s motorkou"
Mřížka `ui.layer type:"image"` (emoji v `text`, `interactive:true`) na 6 pozicích (rohy + `top`/`bottom`). Pasti `uiTarget`: na motorku `result.success`, na ostatní `result.fail`. Timeout = `level.end fail` na čase. → `09_captcha.json`.

### G) Monolog / cutscéna (postup bez ohledu na výsledek)
`game.input.disable` po celou dobu, jen `text.set` + `audio.play`, na konci `level.end success`. → `08_monologue.json`, `12_cutscene.json`.

---

## 11. Jak vzniká výhra / prohra (souhrn)

Level **nikdy nekončí sám od `end.time`** — konec musí přijít z jednoho z:

| Zdroj | Výhra | Prohra |
|-------|-------|--------|
| timeline `level.end` | `result: "success"` | `result: "fail"` |
| `trap.set` | `result.type: "success"` | `result.type: "fail"` |
| Karrel `behaviors` → `then` | `level.end success` | `level.end fail` |
| `rules` | — | vstup v režimu `forbidden` |

`end.time` jen pohání odpočet v UI a vstupuje do podpisu — typicky mu odpovídá poslední `level.end` v timeline.

---

## 12. Co se stane po konci levelu (flow)

1. Engine ukončí běh, smaže UI vrstvy.
2. Pokud má level `ending[result]`, přehraje **závěrečnou Karrelovu hlášku** (titulky + hlas) po dobu `holdMs`.
3. Aktualizuje **karmu** (+1 / −1) a odešle `POST /result` (server posune `user.level`).
4. Ukáže **koncové okno** s tlačítkem **Pokračovat** → načte `id + 1` (po výhře i prohře). DEV/ADMIN má navíc restart/skok na level.

---

## 13. Kam dát soubory

| Typ | Složka (Vite `public`) | URL v běhu |
|-----|------------------------|------------|
| Hlas | `client/public/assets/voices/` | `/assets/voices/<file>` |
| Hudba | `client/public/assets/music/` | `/assets/music/<file>` |
| Zvuk | `client/public/assets/sounds/` | `/assets/sounds/<file>` |

Hudba musí být **volná licence nebo originál**. Chybějící soubor build nezastaví — jen se v logu objeví warning a zvuk se nepřehraje.

---

## 14. Testování

1. Ulož soubor do `levels/tests/` s unikátním `id`.
2. Spusť `server/` a `client/` (`npm run dev` v každé složce).
3. Přihlas se jako DEV/ADMIN a přes pauzu (klávesa **X**) → „Načíst zvolený blok" skoč na `id`.
4. V pauze sleduj **Engine inspektor** (`pc`, `waiting`, `rules`, `traps`, `vars`) a **event log** (`validate.warn/error`, `flow.random`, `trap.*`, `level.ending`).

---

## 15. Kontrola před commitem

- Platný JSON, **unikátní `id`**, timeline má smysluplný konec (`level.end` nebo logika přes past).
- `flow.goto` / `flow.branch` / `flow.random` míří na **existující `label`**.
- Každý soubor z `assets` leží pod `client/public/assets/` (jinak jen warning).
- U Karrela: bloky řazené **od nejnižší fáze po nejvyšší**; `whenVar` / `onceGroup`, aby se kroky nepřeskakovaly.
- Pokud používáš `ending`, jsou `voice` soubory i v `assets.voices`.
- **Tón Karrela je důležitější než mechanika** — když dialog nezní jako Karrel, přepiš ho (viz `docs/NedelejNic_Master_Bible.docx`).

---

## 16. Když něco nesedí

- Neplatný JSON → validátor editoru.
- Špatný level se načítá → zkontroluj **duplicitní `id`** mezi soubory (`levels/` i `levels/tests/`).
- Karrel „skočí" rovnou na prohru při prvním vstupu → v jednom vstupu se smí spustit jen jeden blok; ověř pořadí `behaviors` a `whenVar` pro fáze.
- Level „visí" a nekončí → blokující `when` nikdy nedostane podmínku, nebo chybí `level.end`.

Úplný seznam vlastností a validace: `client/src/engine/newEngine/LevelValidator.ts` a typy v `client/src/engine/newEngine/types.ts`.
