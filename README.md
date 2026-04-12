# NedelejNic

Psychologická webová hra. Pravidlo je jedno — **nedělej nic**.

## Požadavky

- Node.js 18+
- PostgreSQL 14+
- npm

---

## Instalace a spuštění

### 1. Naklonuj repozitář a nainstaluj závislosti

```bash
# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

### 2. Nastav prostředí

```bash
cd server
cp ../.env.example .env
```

Uprav `.env`:
- `DATABASE_URL` — připojení k tvé PostgreSQL databázi
- `SESSION_SECRET` — náhodný řetězec min. 32 znaků (např. vygeneruj přes `openssl rand -hex 32`)

### 3. Inicializuj databázi

```bash
cd server
npx prisma migrate dev --name init
```

### 4. Spusť backend a frontend

V jednom terminálu:
```bash
cd server
npm run dev
```

Ve druhém terminálu:
```bash
cd client
npm run dev
```

Aplikace běží na: **http://localhost:5173**

---

## Struktura projektu

```
nedelejnic/
├── client/               # React + Vite + TypeScript
│   └── src/
│       ├── components/   # UI komponenty, admin komponenty
│       ├── engine/       # LevelEngine, InputSystem
│       ├── hooks/        # useAuthGuard, useAdminQueries
│       ├── pages/        # AuthPage, GamePage, AdminDashboard, UsersPage
│       ├── services/     # API volání (api, adminApi, httpClient)
│       ├── store/        # Zustand (adminStore)
│       └── types/        # TypeScript definice
├── server/               # Node.js + Express + TypeScript
│   ├── prisma/           # Prisma schema + migrace
│   └── src/
│       ├── controllers/  # auth, game, admin
│       ├── middleware/    # Auth, role check, rate limit
│       ├── routes/       # Express routery
│       ├── levels.ts     # Konfigurace levelů
│       └── app.ts        # Express aplikace
└── docs/                 # Dokumentace projektu
```

---

## Role

| Role   | Popis                                                                 |
|--------|-----------------------------------------------------------------------|
| PLAYER | Normální hráč — automatická progrese, auto-logout po levelu          |
| DEV    | Debug režim — pause/resume, step mode, jump level, event log         |
| ADMIN  | Plný přístup — admin dashboard + vše co DEV                         |

Nový uživatel má vždy roli `PLAYER`. Role se mění přes admin dashboard (pouze ADMIN).

---

## API endpointy

### Autentizace

| Metoda | Cesta             | Popis                              |
|--------|-------------------|------------------------------------|
| POST   | /auth/register    | Registrace nového hráče            |
| POST   | /auth/login       | Přihlášení                         |
| POST   | /auth/logout      | Odhlášení                          |
| GET    | /auth/me          | Aktuální přihlášený hráč           |

### Hra

| Metoda | Cesta             | Popis                              |
|--------|-------------------|------------------------------------|
| GET    | /level/:id        | Konfigurace levelu                 |
| POST   | /result           | Odeslání výsledku (success / fail) |

### Admin (vyžaduje ADMIN nebo DEV roli)

| Metoda | Cesta                              | Popis                          |
|--------|------------------------------------|---------------------------------|
| GET    | /admin/users                       | Seznam uživatelů (paginated)   |
| GET    | /admin/users/:userId               | Detail uživatele + audit log   |
| PUT    | /admin/users/:userId/role          | Změna role (pouze ADMIN)       |
| PUT    | /admin/users/:userId/ban           | Ban/unban (pouze ADMIN)        |
| PUT    | /admin/users/:userId/level         | Nastavení levelu               |
| POST   | /admin/users/:userId/reset-progress| Reset progresu na level 1      |
| POST   | /admin/users/:userId/invalidate-session | Nucené odhlášení          |
| GET    | /admin/audit                       | Audit log (paginated)          |

---

## Level systém

Prvních 10 levelů je ručně napsaných s originálními texty. Každý další level se generuje procedurálně — delší trvání, více akcí k detekci.

Detekované akce podle levelu:
- Level 1–3: kliknutí, klávesnice
- Level 4–6: + scroll
- Level 7+: + pohyb myší
- Level 9+: + dotyk (mobile)

---

## Produkce

Před nasazením:
1. Nastav `NODE_ENV=production` v `.env`
2. Nastav `SESSION_SECRET` na silný náhodný řetězec
3. Nastav `CLIENT_URL` na doménu frontendu
4. Zvažte nahrazení MemoryStore persistentním session store (connect-pg-simple)
5. Spusť `npm run build` v `server/` a serv přes `npm start`
