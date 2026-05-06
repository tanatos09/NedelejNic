# NedělejNic

Psychologická webová hra. Pravidlo je jedno — **nedělej nic**.

Dokumentace v repozitáři: **[docs/README.md](docs/README.md)** — rejstřík + **[docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)** (aktuální stav engine a levelů).

## Požadavky

- Node.js 18+
- PostgreSQL 14+
- npm

---

## Instalace a spuštění

### 1. Naklonuj repozitář a nainstaluj závislosti

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Nastav prostředí

```bash
cd server
cp ../.env.example .env
```

Uprav `.env`: `DATABASE_URL`, `SESSION_SECRET` (min. 32 znaků), případně `LEVEL_SECRET` pro podpis levelů v produkci.

### 3. Inicializuj databázi

```bash
cd server
npx prisma migrate dev --name init
```

### 4. Spusť backend a frontend

```bash
cd server && npm run dev
```

```bash
cd client && npm run dev
```

Aplikace: **http://localhost:5173** (Vite proxy na API dle `client/vite.config.ts`).

---

## Struktura projektu

```
nedelejnic/
├── client/                 # React + Vite + TypeScript
│   ├── public/assets/     # statické audio (voices/music/sounds) → /assets/...
│   └── src/
│       ├── engine/
│       │   ├── core/       # EngineHost (LevelRunner + InputManager)
│       │   ├── newEngine/  # LevelRunner, TimelineScheduler, ActionDispatcher, …
│       │   └── input/      # InputManager
│       ├── pages/          # GamePage, AuthPage, AdminDashboard, …
│       ├── services/       # api, adminApi, httpClient
│       └── ...
├── server/                 # Express + Prisma
│   └── src/
│       ├── levels.ts       # načítání JSON z ../../levels
│       └── controllers/
├── levels/                 # Zdroj levelů (JSON na disku)
│   ├── tests/              # priorita při kolizi id — vývojové testovací levely
│   └── templates/
└── docs/                   # viz docs/README.md
```

---

## Role

| Role   | Popis |
|--------|--------|
| PLAYER | Běžná hra, postup podle `user.level`, po levelu odpočet k odhlášení |
| DEV    | Ladění: pauza, inspektor, skok mezi levely API, výsledek neposouvá level v DB |
| ADMIN  | Admin dashboard + chování jako DEV ve hře |

Změna rolí přes admin rozhraní.

---

## API (zjednodušeně)

| Oblast | Cesty |
|--------|--------|
| Auth   | `/auth/register`, `/auth/login`, `/auth/me` |
| Hra    | `GET /level/:id`, `POST /result` |
| Admin  | `/admin/*` — viz `docs/ADMIN_API_CONTRACT.md` |

---

## Levely

- Definují se jako **JSON** v adresáři **`levels/`** (viz **`docs/LEVEL_FORMAT.md`**).
- Server **nepřiděluje** úrovně procedurálním generátorem v kódu — obsah je soubory v repozitáři (nebo budoucí build pipeline).
- Klient po načtení levelu **neposílá požadavky na server během hraní**; po skončení jedno `POST /result` s podpisem.

Starší dokumentace o „procedurálních“ vyšších úrovních neplatí — aktuální pravda je v **`docs/PROJECT_OVERVIEW.md`**.

---

## Produkce

1. `NODE_ENV=production`, silné `SESSION_SECRET` / `LEVEL_SECRET`
2. `CLIENT_URL` = veřejná URL frontendu (CORS)
3. `npm run build` v `client/` a `server/`, server přes `npm start`
