# Feedback nástroj

Jednoduchá samostatná webová aplikácia (podobná BugHerd / Marker.io), ktorá umožňuje
klientom pridávať pripomienky priamo na webovú stránku cez vložený JS widget, a
adminovi spravovať klientov, projekty a feedback v dashboarde.

## Funkcie

- **Admin dashboard** – správa klientov a projektov, generovanie embed snippetu,
  zoznam a detail všetkých pripomienok, zmena stavov, export PDF, e-mailové
  notifikácie pri odoslaní pripomienok.
- **Klientský portál** – klient vidí len svoj projekt, môže otvoriť svoj web a
  pripomienkovať ho, sleduje stav vlastných pripomienok a stiahne PDF reporty.
- **Embeddable widget (`widget.js`)** – plávajúce tlačidlo "Feedback" na stránke
  klienta. Klient klikne na miesto na stránke, napíše poznámku (voliteľne so
  screenshotom), poznámky sa ukladajú ako koncepty (draft) a naraz sa odošlú
  tlačidlom "Odoslať všetky poznámky".

### Tok odosielania pripomienok

1. Klient pridáva poznámky cez widget – každá sa uloží ako **draft** (bez e-mailu).
2. Po kliknutí na **"Odoslať všetky poznámky"** sa všetky drafty prepnú na stav
   `new`, vytvorí sa `FeedbackBatch`, vygeneruje sa PDF report a **adminovi sa
   pošle jeden súhrnný e-mail**.
3. Klient uvidí potvrdenie: *"Ďakujeme za spätnú väzbu. Vaše pripomienky sme
   prijali a čoskoro sa vám ozveme."*

## Technologický stack

- Node.js 22 + TypeScript + Express 4
- Prisma ORM + SQLite (`prisma/dev.db`)
- EJS + `express-ejs-layouts` (server-rendered dashboard)
- `express-session` + `session-file-store` (session perzistencia v `storage/sessions`)
- `bcryptjs` (heslá), `zod` (validácia vstupov), `multer` (upload + magic-byte kontrola typu súboru)
- `pdfkit` (PDF reporty), `nodemailer` (e-mailové notifikácie)
- `helmet`, `cors`, `express-rate-limit`, vlastný session CSRF middleware
- `vitest` + `supertest` (testy)
- Widget: čistý vanilla JS/CSS (žiadny build krok), `html2canvas` (vlastná kopia v `public/vendor/`, lazy-loaded) pre screenshoty

## Inštalácia a spustenie (vývoj)

```bash
npm install
cp .env.example .env       # a uprav hodnoty podľa potreby (najmä SESSION_SECRET)
npx prisma migrate dev      # vytvorí prisma/dev.db a aplikuje migrácie
npm run seed                 # vytvorí demo admina, klienta, projekt a ukážkový feedback
npm run dev                  # spustí server na http://localhost:3000
```

Demo prihlásenia (po `npm run seed`):

| Rola   | Email                  | Heslo      |
| ------ | ---------------------- | ---------- |
| Admin  | `admin@example.com`    | `admin123` |
| Klient | `klient@example.com`   | `klient123`|

Demo projekt má pevný token `demo7f3a9c2e8b1d4f6a0c5e9b2d7f1a4c8e0b3d6f9a2c5` a
jeho URL ukazuje na `public/demo/index.html` – statickú ukážkovú stránku so
zabudovaným widgetom, na ktorej môžeš celý tok rovno vyskúšať
(`http://localhost:3000/demo/index.html`).

## Build a produkčné spustenie

```bash
npm run build     # skompiluje TypeScript do dist/
npm run start     # spustí dist/src/server.js
```

Pred prvým spustením v produkcii spusti `npx prisma migrate deploy` (aplikuje
migrácie bez interaktívnych promptov) a nastav reálne hodnoty v `.env`
(predovšetkým `SESSION_SECRET`, `APP_URL`, `ADMIN_NOTIFICATION_EMAIL`, SMTP
údaje a `NODE_ENV=production`).

## Konfigurácia (`.env`)

Pozri `.env.example` pre kompletný zoznam premenných:

- `PORT`, `APP_URL` – port servera a verejná URL (používa sa v e-mailoch a odkazoch)
- `DATABASE_URL` – cesta k SQLite databáze, **relatívna k `prisma/schema.prisma`**
  (`file:./dev.db` → výsledný súbor `prisma/dev.db`)
- `SESSION_SECRET` – dlhý náhodný reťazec (`openssl rand -hex 32`)
- `ADMIN_NOTIFICATION_EMAIL` – kam chodí súhrnný e-mail po odoslaní pripomienok
- `SMTP_*` – SMTP server pre odosielanie e-mailov. Ak je `SMTP_HOST` prázdny,
  e-mail sa iba vypíše do konzoly (vhodné pre lokálny vývoj)
- `WIDGET_CORS_ORIGIN` – povolené originy pre `/api/widget/*` (`*` alebo zoznam
  domén oddelený čiarkou)
- `MAX_UPLOAD_SIZE_MB` – limit veľkosti súboru pre screenshot/prílohu

## Vloženie widgetu na klientsky web

V admin dashboarde (Projekty → detail projektu) sa pre každý projekt vygeneruje
unikátny snippet:

```html
<script src="https://feedback.example.sk/widget.js" data-project="<TOKEN_PROJEKTU>"></script>
```

Tento `<script>` tag sa vloží na koniec `<body>` stránky klienta. Widget je
izolovaný (vlastné CSS triedy s prefixom `fbw-`, vysoký `z-index`), takže by
nemal ovplyvniť vzhľad existujúcej stránky.

## Projektová štruktúra

```
src/
├── app.ts, server.ts        # Express app / HTTP server
├── config/env.ts             # konfigurácia z .env
├── lib/                       # prisma klient, csrf, upload, tokeny, flash
├── middleware/                # auth, rate-limit, error handler
├── routes/, controllers/      # auth, admin, klient, widget API
├── services/                  # pdf.service.ts, email.service.ts
├── validation/schemas.ts      # zod schémy
└── views/                      # EJS šablóny (admin, klient, auth)
public/
├── widget.js, widget.css      # embeddable widget
├── demo/index.html            # ukážková klientská stránka so snippetom
└── css/, js/                   # dashboard štýly a skripty
prisma/
├── schema.prisma, migrations/ # databázová schéma
└── seed.ts                     # demo dáta
storage/
├── uploads/{screenshots,attachments}/  # nahraté súbory (UUID názvy)
└── reports/                              # vygenerované PDF reporty
tests/                          # vitest + supertest
```

## Bezpečnosť

- Session auth (`express-session`), heslá hashované cez `bcryptjs`,
  `requireAuth`/`requireRole` middleware na všetkých `/admin/*` a `/client/*` routách.
- Vlastný CSRF token (session-bound, skryté pole `_csrf`) na všetkých
  session-autentifikovaných POST formulároch.
- Widget API je verejné, ale prísne scoped cez náhodný `project.token` –
  nikdy nevracia ani neumožňuje upraviť dáta iného projektu.
- Validácia vstupov pomocou `zod` (admin formuláre i widget API).
- Upload súborov: kontrola skutočného typu podľa "magic bytes" (PNG/JPEG/WEBP),
  limit veľkosti, náhodné UUID názvy súborov.
- `helmet` security headers, `express-rate-limit` na `/login` a `/api/widget/*`.
- CORS (`Access-Control-Allow-Origin`) je povolený len pre `/api/widget/*`.

## Testy

```bash
npm test
```

Testy (vitest + supertest) bežia proti samostatnej SQLite databáze
(`prisma/test.db`, automaticky vytvorená a migrovaná pred behom testov) a kryjú:

- prihlásenie/odhlásenie, presmerovania a oddelenie admin/klient sekcií, CSRF ochranu (`tests/auth.test.ts`)
- widget API – vytváranie/mazanie draftov, upload screenshotu, scoping cez token (`tests/widget-api.test.ts`)
- celý tok "Odoslať všetky poznámky" – zmena stavov, vytvorenie batchu, generovanie PDF (`tests/feedback-submit.test.ts`)
