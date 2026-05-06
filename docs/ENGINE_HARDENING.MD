# ENGINE HARDENING SPEC – Nedělej nic

Tento dokument definuje pevná runtime pravidla pro Level Engine.

Je závazný pro implementaci a nesmí být porušen ani redesignem.

---

# 1. TIMELINE EXECUTION RULES

## 1.1 Catch-up execution
Pokud dojde k:
- flow.goto do labelu s časem v minulosti

→ engine MUSÍ okamžitě vykonat všechny vynechané akce v pořadí

---

## 1.2 Same-time execution
Pokud více eventů má stejné `at`:

→ vykonávají se v pořadí v poli (array order)

---

## 1.3 Blocking WHEN

`when` event je blocking bod:

- scheduler čeká na splnění podmínky
- ale:
  - trap systém běží dál
  - input systém běží dál

---

# 2. INPUT SYSTEM RULES

## 2.1 Input normalization

Click event MUSÍ být mapován přes:

closest('[data-layer-id]')

Pokud není nalezen:
→ event se ignoruje

---

## 2.2 Input event structure

InputEvent MUSÍ být normalizovaný objekt:

- type
- timestamp
- targetLayerId (pokud existuje)
- raw DOM event reference

---

# 3. TRAP SYSTEM

## 3.1 Lifecycle

- enabled: false → trap existuje, ale ignoruje input
- enabled: true → aktivní

## 3.2 Matching

- first match wins
- pokud více trapů matchne → použije se první definovaný

## 3.3 Override

stejné trap id:
→ přepisuje existující trap (replace)

---

# 4. STATE SYSTEM

## 4.1 Default state

state.vars MUSÍ být:

{}

## 4.2 Missing keys

- neexistující klíč = 0 (implicitně)
- žádná chyba nesmí být vyhozena

---

# 5. EFFECT SYSTEM

## 5.1 Instance limit

- max 1 aktivní instance na efekt type

Pokud se spustí nový:
→ starý se ukončí

## 5.2 Duration handling

- durationMs = interní timer
- po vypršení → auto stop

---

# 6. RANDOM SYSTEM

## 6.1 Deterministic seed

seed = levelId + seedKey

## 6.2 Logging

každá volba random MUST be logged (DEV mode support)

---

# 7. SCHEDULER SAFETY

## 7.1 Shutdown rule

po level.end:

- stop scheduler
- detach input listeners
- ignore všechny další timeline eventy

## 7.2 No post-end execution

žádná akce nesmí běžet po ukončení levelu

---

# 8. ASSET SYSTEM

## 8.1 Preload only

- všechny assety MUSÍ být načteny před startem levelu

## 8.2 Runtime rule

- během levelu = 0 network requests
- žádný lazy load

## 8.3 Missing asset

- no crash
- silent no-op
- log only (DEV)

---

# 9. GENERAL SAFETY RULES

- engine musí být deterministic
- žádná globální side-effect logika mimo StateStore
- žádné async behavior bez kontroly scheduleru
- žádné “hidden timers” mimo EffectSystem a Scheduler