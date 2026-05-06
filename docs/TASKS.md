# Úkoly a backlog

## Hotovo (MVP + infrastruktura)

- [x] Přihlášení / JWT / role (PLAYER, DEV, ADMIN)
- [x] Načítání levelu z API (`GET /level`) — JSON ze `levels/**/*.json` + podpis
- [x] Action-based engine (`LevelRunner`, časová osa, akce, pasti, audio preload)
- [x] Vstup řízený fází hry + `InputManager` + `data-no-game-input`
- [x] Odeslání výsledku `POST /result` s validací podpisu
- [x] Admin dashboard (uživatelé, role, ban, úroveň, audit, stránkování)
- [x] Mobilní klient odmítnut v `App.tsx`
- [x] Dokončení levelu: `finishLevel()` — výhra/neprohra bez rozbití stavu enginu

## Další směry (produkt / obsah)

- Obsah: dabing / komentátor (audio soubory v `public/assets/voices/`)
- Další mechaniky dle nápadů v designu (falešné UI, kurzor, …) — mapovat na timeline akce
- Případně rozšířit podpis levelu o hash timeline (silnější server-side vazba dat)
- Průběžně udržovat `docs/PROJECT_OVERVIEW.md` při změnách architektury
