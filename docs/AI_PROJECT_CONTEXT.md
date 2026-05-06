# AI PROJECT CONTEXT

# NedelejNic

Tento dokument obsahuje kompletní kontext projektu.

Při jakékoliv práci na projektu je nutné se tímto dokumentem řídit.

Je to hlavní zdroj pravdy pro:

* architekturu
* design hry
* technické principy
* styl vývoje

Pokud je nějaký požadavek v konfliktu s tímto dokumentem, má přednost tento dokument.

---

# STAV IMPLEMENTACE (kód v repozitáři)

Tato sekce doplňuje vizi o **skutečnost**; detailní mapa: [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md).

- **Levely** se ukládají jako **JSON v `levels/`**; server je načítá a **podepisuje**, negeneruje je procedurálně v JS (žádný `generateLevel(levelNum)` ve stylu starého návrhu).
- **Runtime enginu** na klientovi je **`LevelRunner` + `TimelineScheduler`** (`client/src/engine/newEngine/`), ne starý `LevelEngine` jako hlavní smyčka.
- **0 requestů během hraní levelu** — stále platí: po načtení konfigurace a preloadu assetů se během `playing` nevolá API.
- **Admin dashboard**, role, audit — implementováno (viz `docs/ADMIN_API_CONTRACT.md`).
- Produktová **vize** níže (100+ levelů, placený balíček, streamer módy) je **cíl**, ne vždy hotový kód.

---

# 1. ZÁKLADNÍ MYŠLENKA HRY

NedelejNic je webová hra pro desktopové prohlížeče.

Základní princip hry je jednoduchý:

Hráč má jediný úkol: **nedělat nic.**

To znamená:

* nehýbat myší
* nemačkat klávesy
* neklikat

Hra hráče neustále provokuje, aby něco udělal.

Používá k tomu:

* troll mechaniky
* falešné UI
* falešné systémové hlášky
* psychologické pasti
* komentátora

Hra je primárně komediální a absurdní.

Cílem je pobavit hráče a vytvářet nečekané situace.

---

# 2. STRUKTURA HRY

Hra je rozdělena na levely.

Plán:

100 levelů zdarma
100 levelů v placeném balíčku

Normální průchod hrou:

2–3 hodiny

Hra se ale dá dohrát velmi rychle, pokud hráč levely okamžitě kazí.

To je záměrný design.

---

# 3. KOMENTÁTOR

Komentátor je hlavní postava hry.

Jeho role:

* sledovat hráče
* komentovat jeho chování
* provokovat ho
* trolit ho

Jeho osobnost se postupně mění.

Fáze:

1. normální
2. ironický
3. sarkastický
4. divný
5. psychicky rozpadlý

V pozdějších levelech začne komentátor tvrdit, že:

* získává vědomí
* prolomil svůj kód
* stává se AI

Postupně se snaží zhmotnit.

Ikonická scéna hry je moment, kdy se z pixelů vytvoří **prostředníček** směrem k hráči.

---

# 4. TYPY LEVELŮ

Levely mohou obsahovat různé mechaniky.

Například:

DO NOTHING
hráč nesmí dělat žádnou akci

CLICK BUTTON
hráč musí kliknout

INFINITE LEVEL
level končí až když hráč něco udělá

RANDOM END
level skončí náhodně

GLOBAL FAIL
level skončí až když někdo jiný na světě failne

TROLL LEVELS

například:

* fake tlačítka
* fake loading
* fake systémové hlášky
* fake kurzor
* invertované ovládání
* více kurzorů na obrazovce
* falešné chyby systému

---

# 5. STREAMER MECHANIKY

Hra má být vhodná pro streamery.

Mechaniky mohou obsahovat:

* chat musí mlčet určitou dobu
* chat rozhoduje o akci
* globální eventy
* komentátor reaguje na stream

Tyto mechaniky mohou být součástí placeného balíčku.

---

# 6. PLATFORM

Hra je určena pouze pro:

desktop browser

Mobilní zařízení nejsou podporována.

Pokud hráč otevře hru na mobilu, zobrazí se zpráva, aby použil počítač.

---

# 7. ARCHITEKTURA SYSTÉMU

Architektura je navržena pro:

* minimální zatížení serveru
* maximální škálovatelnost

Princip:

backend dodává hotový level (JSON) a podpis
frontend level pouze spouští (interpretuje data)

---

# 8. BACKEND

Backend obsahuje:

* doručení konfigurace levelu (čtení z `levels/**/*.json`)
* podpis a validaci výsledků
* účty, role, admin, audit (dle implementace)

API například:

GET /level/{id}

Backend vrací celý level jako JSON (včetně pole `signature`).

---

# 9. FRONTEND

Frontend pouze:

* vykresluje UI
* přehrává audio
* sleduje input
* spouští level engine

Frontend nesmí obsahovat komplexní herní logiku.

Frontend interpretuje data z backendu.

---

# 10. ABSOLUTNÍ PRAVIDLO

Po spuštění levelu musí být:

**0 requestů na server.**

Flow:

login
load level
preload assets
start level
end level
send result

Během levelu nesmí být žádné síťové požadavky.

---

# 11. LEVEL DATA

Level je definován daty.

Například:

* pravidla
* eventy
* audio
* způsob ukončení

Frontend pouze interpretuje tato data.

---

# 12. VÝKON

Cílem architektury je obsloužit velké množství hráčů.

Server řeší pouze:

* login
* načtení levelu
* uložení výsledku

Během levelu server nic nedělá.

---

# 13. CHEAT PROTECTION

Cheatování ve webové hře nelze úplně zabránit.

Používají se:

* podpis levelu
* hash dat
* validace výsledků serverem

---

# 14. MONETIZACE

Free verze:

100 levelů zdarma

Placení:

Supporter Pack (~5 USD)

obsahuje:

* dalších 100 levelů
* streamer mechaniky

Může existovat také:

Donate tlačítko.

---

# 15. DESIGN FILOZOFIE

Hra musí být:

absurdní
nečekaná
vtipná
trollovací

Levely by měly hráče překvapovat.

---

# 16. CODING RULES

Kód musí být:

* modulární
* čitelný
* oddělený podle odpovědností

Frontend musí obsahovat:

level runner
input manager
audio manager
UI renderer

Backend musí obsahovat:

level generator
progress manager
result validation

---

# 17. AI DEVELOPMENT RULES

AI musí:

* respektovat architekturu
* nikdy nepřidávat requesty během levelu
* zachovat princip backend generuje level
* frontend pouze interpretuje

AI by měla navrhovat řešení, která:

* minimalizují zatížení serveru
* jsou jednoduchá
* jsou škálovatelná

---

END OF DOCUMENT
