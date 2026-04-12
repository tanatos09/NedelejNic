# BEZPEČNOSTNÍ AUDIT - NedelejNic (Existující Systém)

**Rozsah:** JWT auth + role-based access + frontend + backend  
**Metoda:** Analýza popsané architektury (bez penetračního testu)  
**Datum:** 2026-04-12

---

## HROZBY + OPATŘENÍ

### 1. XSS → localStorage Token Theft

**Hrozba:**
- Pokud je XSS vulnerabilita v aplikaci, JavaScript může přistupovat k localStorage
- `localStorage.getItem('nedelejnic_token')` → token ukradený
- Útočník postaví legitímní API call s украденým tokenem

**Opatření:**
- Content Security Policy (CSP) header v backend response
- HttpOnly + Secure cookies místo localStorage (alternativa)
- DOMPurify nebo React sanitizace pro user-supplied data

**Vysvětlení:**
CSP header zakazuje inline skripty a externí skripty, čímž se brání vsunutí kódu. HttpOnly cookies nejsou dostupné JavaScriptu. Je to vrstva ochrany - i když by byla XSS, token zůstane chráněný.

---

### 2. Brute Force útok na /auth/login

**Hrozba:**
- Endpoint `/auth/login` nemá zmíněny rate limiting
- Útočník automation: 1000 pokusů za sekundu bez omezení
- Po dostatku pokusů: heslo je rozlomeno

**Opatření:**
- Rate limiting middleware na `/auth/login`
- Limit: 5 pokusů na IP adresu za 15 minut
- Alternativa: Account lockout po 3-5 neúspěšných pokusech

**Vysvětlení:**
Bez rate limitingu je login endpoint dostupný pro brute force. Rate limiting zpomaluje útok na neproveditelné časy (95% hesel = 24+ hodin @ 1 req/min).

---

### 3. CORS není nakonfigurován

**Hrozba:**
- Pokud server nemá `Access-Control-Allow-Origin` nastaveno, všechny origins mohou volat API
- Útočníkův webů na attacker.com → fetch na localhost:3001/api/admin/users
- Backend vrátí data bez CORS blokace (pokud není CORS zaškrtnuto)

**Opatření:**
- Konfigurovat CORS middleware
- Whitelist origins: `['http://localhost:5176', 'https://nedelejnic.com']`
- Ostatní origins = automatická CORS failure

**Vysvětlení:**
CORS je browser protection. Bez konfiguraci mohou ostatní weby volat API. S CORS whitelist jenom definované origins (frontend + production) mohou volat API.

---

### 4. Chybí Security Headers

**Hrozba:**
- `Strict-Transport-Security` (HSTS) - není zmíněno → možný downgrade na HTTP
- `X-Frame-Options` - není zmíněno → clickjacking útoky
- `X-Content-Type-Options` - není zmíněno → MIME sniffing
- `Content-Security-Policy` - viz bod 1

**Opatření:**
- Přidat HTTP response headers:
  ```
  Strict-Transport-Security: max-age=31536000
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Content-Security-Policy: default-src 'self'
  ```

**Vysvětlení:**
Security headers instruují browser jak se má chovat. HSTS nutí HTTPS. X-Frame-Options zabraňuje embedování v iframe (clickjacking). X-Content-Type-Options zabraňuje MIME sniffingu. Bez nich je aplikace zranitelnější.

---

### 5. JWT expiry = 7 dní

**Hrozba:**
- Token je lungo-lived (7 dní)
- Pokud je token ukradený (XSS), útočník má 7 dní na exploitaci
- Útočník se může vrátit každý den bez nového přihlášení

**Opatření:**
- Zkrátit JWT expiry: 1 hodina (access token)
- Přidat refresh token mechanism (7 dní, HttpOnly cookie)
- Frontend automaticky refreshuje access token na expiraci

**Vysvětlení:**
Kratší token = kratší attack window. Pokud token je na 1 hodinu, útočník má jen 1 hodinu na exploitaci. Refresh token je na HttpOnly cookie, útočník jej nemůže украst (XSS). Po expiraci access tokenu se refreshuje automaticky.

---

### 6. Error messages mohou leakovat informace

**Hrozba:**
- Backend endpoint vrátí: `"User with ID 123 not found"`
- Útočník ví: ID systém používá čísla, lze je enumerovat
- Nebo: `"Only admins can access this endpoint"` → útočník ví co je admin endpoint
- Nebo: `"Invalid email format"` → email validation existuje

**Opatření:**
- Generic error messages: `"Forbidden"`, `"Bad Request"`
- Specifické info jenom v server logs (admins vidí)
- Nikdy neodhali internals v API response

**Vysvětlení:**
Útočníci mohou zbytečně deducevat systémové detaily z error messages. Pouhá změna textu na generic "Forbidden" snižuje surface pro recon útok.

---

### 7. Session invalidation chybí

**Hrozba:**
- Pokud je admin token leaked, admin nemůže ho invalidate
- Token zůstane platný do expiraci (7 dní)
- Útočník má 7 dní na exploitaci

**Opatření:**
- Endpoint: `POST /api/admin/sessions/invalidate-all`
- Admin logout → invaliduje všechny tokeny
- Databáze: Track `user.sessionInvalidatedAt` timestamp
- Middleware: Check `if (token.iat < user.sessionInvalidatedAt) reject`

**Vysvětlení:**
Bez invalidace admin nemůže operativně zablokovat kompromitovaný token. S invalidací jenom váh kliknutí admina na "Logout all sessions" se všechny tokeny stanou neplatnými.

---

### 8. Admin heslo bez MFA

**Hrozba:**
- Admin má heslo: `"password123"`
- Brute force prolomí heslo (bez rate limitingu)
- Eller: heslo je v breached password databases
- Útočník login jako admin bez dalšího faktoru

**Opatření:**
- MFA (TOTP nebo SMS) pro admin accounts
- Login endpoint: require MFA code po hesle
- Non-admin users: MFA optional

**Vysvětlení:**
MFA znamená i když je heslo zkompromitováno, útočník potřebuje druhý faktor (TOTP app, SMS). Bez MFA je admin account jenom na hesle.

---

### 9. JWT token v localStorage + memory

**Hrozba:**
- Token je v localStorage (persistent, viditelný XSS)
- Token je také v memory (runtime store)
- Devtools → Storage tab → token je viditelný

**Opatření:**
- HttpOnly cookie místo localStorage (pokud je to možné)
- Pokud localStorage je nutný: CSP header + XSS mitigation
- Avoid logging token do console nebo error messages

**Vysvětlení:**
localStorage je persistent a viditelný. Devtools inspection = token viditelný. HttpOnly cookie je bezpečnější, ale localStorage je dev-friendly. Kompromis: localStorage + CSP.

---

### 10. Žádný audit log pro admin akce

**Hrozba:**
- Admin změní heslo uživateli bez auditnímu logu
- Admin banuje uživatele bez trace
- Kompromitovaný admin dělá neviditelné věci

**Opatření:**
- Audit log pro každou admin akci: `{ user, action, targetUser, timestamp, ip }`
- Strukturované logging: Winston, Pino
- Long-term storage: database nebo external service

**Vysvětlení:**
Bez auditu logů admins (zejména kompromitovaní) mohou dělat věci bez trace. Audit log umožňuje forensics a accountability.

---

## SHRNUTÍ

| # | Hrozba | Opatření | Kde |
|---|--------|----------|-----|
| 1 | XSS → token theft | CSP + HttpOnly | Backend |
| 2 | Brute force login | Rate limiting | Backend |
| 3 | CORS misconfiguration | Whitelist origins | Backend |
| 4 | Missing security headers | HSTS, X-Frame, CSP | Backend |
| 5 | Long token lifetime | 1h access + refresh token | Backend |
| 6 | Leaky error messages | Generic errors | Backend |
| 7 | No session invalidation | Logout all endpoint | Backend |
| 8 | Admin no MFA | TOTP/SMS | Backend |
| 9 | Token visibility | HttpOnly cookies | Backend/Frontend |
| 10 | No audit logs | Structured logging | Backend |

---

## POZNÁMKA

**Zatím nejsou zmíněny v popisu architektury:**
- Není jasné, zda CSP header existuje
- Není jasné, zda rate limiting existuje
- Není jasné, jak je CORS nakonfigurován
- Není jasné, zda security headers jsou nastaveny
- Není jasné, zda MFA existuje

**Předpokládám na základě "existující systém" popisu**, že následující tedy chybí:
- CSP, CORS, Security headers (nejsou explicitně zmíněny)
- Rate limiting (není zmíněno)
- Session invalidation (není zmíněno)
- MFA (není zmíněno)
- Audit logging (není zmíněno)

Ostatní prvky (backend JWT validace, role checks) jsou jasně implementovány podle popisu.
