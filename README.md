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
│       ├── pages/        # AuthPage, GamePage
│       ├── services/     # API volání
│       └── types.ts      # Sdílené typy
├── server/               # Node.js + Express + TypeScript
│   ├── prisma/           # Prisma schema
│   └── src/
│       ├── controllers/  # Logika endpointů
│       ├── middleware/   # Auth, rate limit
│       ├── routes/       # Express routery
│       ├── levels.ts     # Konfigurace levelů
│       └── app.ts        # Express aplikace
└── .env.example
```

---

## API endpointy

| Metoda | Cesta             | Popis                              |
|--------|-------------------|------------------------------------|
| POST   | /auth/register    | Registrace nového hráče            |
| POST   | /auth/login       | Přihlášení                         |
| POST   | /auth/logout      | Odhlášení                          |
| GET    | /auth/me          | Aktuální přihlášený hráč           |
| GET    | /level            | Konfigurace aktuálního levelu      |
| POST   | /result           | Odeslání výsledku (success / fail) |

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
