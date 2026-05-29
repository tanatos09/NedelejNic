# Dokumentace — rejstřík

Krátký přehled, co který soubor řeší. **Aktuální stav implementace**: [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md).

| Soubor | Obsah |
|--------|--------|
| [**PROJECT_OVERVIEW.md**](./PROJECT_OVERVIEW.md) | Co projekt **opravdu** dělá (engine, server, levely, síť) — *doporučený vstup* |
| [**LEVEL_AUTHORING_GUIDE.md**](./LEVEL_AUTHORING_GUIDE.md) | **Kompletní průvodce tvorbou levelů** — všechny akce, Karrel, pasti, karma, závěrečné hlášky, recepty |
| [**LEVEL_FORMAT.md**](./LEVEL_FORMAT.md) | Rychlý přehled formátu JSON levelu (`action`, timeline, pravidla) |
| [**ARCHITECTURE.md**](./ARCHITECTURE.md) | Vrstvy aplikace, input, fáze GamePage, role |
| [**ENGINE_DESIGN.md**](./ENGINE_DESIGN.md) | Detailní spec akcí, scheduleru, chování (dlouhý) |
| [**ENGINE_HARDENING.MD**](./ENGINE_HARDENING.MD) | Neměnná runtime pravidla |
| [**ENGINE_DEBUG.md**](./ENGINE_DEBUG.md) | Validator levelu, DEV nástroje, inspektor |
| [**AI_PROJECT_CONTEXT.md**](./AI_PROJECT_CONTEXT.md) | Produktová vize, design, AI pravidla; sekce o implementaci doplněna tam |
| [**TASKS.md**](./TASKS.md) | Stav úkolů / backlog |
| [**ADMIN_API_CONTRACT.md**](./ADMIN_API_CONTRACT.md) | Kontrakt admin REST API |
| [**ADMIN_DASHBOARD_UX_FLOWS.md**](./ADMIN_DASHBOARD_UX_FLOWS.md) | UX admin rozhraní |
| [**SECURITY_AUDIT.md**](./SECURITY_AUDIT.md) | Bezpečnostní audit (dlouhý) |
| [**SECURITY_AUDIT_PRECISE.md**](./SECURITY_AUDIT_PRECISE.md) | Zkrácený / přesnější bezpečnostní přehled |

**Odstraněno jako zastaralé:** staré `ENGINE_ANALYSIS.md`, `BUG_ANALYSIS.md`, dodací admin „blueprint“ soubory — nahrazeno `PROJECT_OVERVIEW.md` a odkazy v kódu opraveny.
