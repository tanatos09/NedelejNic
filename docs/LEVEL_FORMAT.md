# Formát dat levelu

Levely jsou **JSON soubory** v repozitáři (`levels/**/*.json`). Server je při `GET /level/:id` načte z disku, přidá **podpis** a vrátí klientovi.

---

## Primární formát: `type: "action"`

Hlavní používaný tvar (viz `levels/tests/`, `server/src/levels.ts` typ `ActionLevelJson`):

```json
{
  "id": 1,
  "type": "action",
  "title": "01 Wait",
  "description": "…",
  "karrel": {
    "memoryDefaults": { "presence": "quiet" },
    "behaviors": []
  },
  "assets": {
    "voices": [],
    "music": [],
    "sounds": []
  },
  "rules": {
    "click": "forbidden",
    "mouseMove": "forbidden",
    "keyboard": "forbidden",
    "scroll": "forbidden",
    "touch": "forbidden"
  },
  "end": { "type": "timer", "time": 10 },
  "timeline": [
    { "at": "0s", "do": "text.set", "slot": "subtitle", "text": "…" },
    { "at": "10s", "do": "level.end", "result": "success" }
  ]
}
```

### Klíčová pole

| Pole | Význam |
|------|--------|
| `id` | Číslo levelu; musí odpovídat souboru vybranému serverem pro dané id. |
| `type` | `"action"` (běžné) nebo `"custom"` (modulární / rozšíření). |
| `rules` | Režim vstupů: `forbidden` \| `allowed` \| `required` pro `click`, `mouseMove`, `keyboard`, `scroll`, `touch`. |
| `end` | Typicky `{ "type": "timer", "time": <sekundy> }` — používá se v podpisu (`end.time`) a pro progress v UI. |
| `timeline` | Pole kroků; každý má `do` (akci), volitelně `at` (`"0s"`, `"1.5s"`, `"500ms"`), `when`, `label`. |
| `assets` | Seznam souborů pro preload: cesty v public assets (`voices` / `music` / `sounds`). |

Seznam podporovaných akcí a validace: `client/src/engine/newEngine/LevelValidator.ts`, typy v `client/src/engine/newEngine/types.ts`.

**Podpis:** server počítá `HMAC-SHA256` nad `userId:levelId:endTime`. Klient posílá stejný podpis zpět u `POST /result`.

---

## Legacy formát: `events[]` (LevelEngine)

Starší engine (`client/src/engine/LevelEngine.ts`) očekával:

- `rules` jako booleany (ne `forbidden`/`allowed`).
- `events[]` s `time`, `type`: `subtitle` \| `clear` \| `voice`, volitelně `text` / `audio`.

`LevelRunner` při načtení legacy použije `adaptLegacyLevelConfig()` (`types.ts`) a převede to na timeline. **Nové levely piš jako `action` + `timeline`.**

---

## Kam dát statické soubory

| Typ | Složka (Vite `public`) | URL v běhu |
|-----|------------------------|------------|
| Hlas | `client/public/assets/voices/` | `/assets/voices/<file>` |
| Hudba | `client/public/assets/music/` | `/assets/music/<file>` |
| Zvuk | `client/public/assets/sounds/` | `/assets/sounds/<file>` |

---

## Reference

- Přehled implementace: [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md)
- Detail akcí: [`ENGINE_DESIGN.md`](./ENGINE_DESIGN.md)
