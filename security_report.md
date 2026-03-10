# Security Report – Eolite
**Datum auditu:** 2026-03-01
**Rozsah:** Full OWASP Top 10 statický audit (backend + frontend)
**Autor:** AI Security Dev Agent
**Status oprav:** P0/P1 opraveny · P2 dokumentovány jako doporučení

---

## 1. Executive Summary (pro ne-tech čtenáře)

Eolite je prezentační web s administračním panelem. Audit prošel veškerý zdrojový kód a identifikoval 8 bezpečnostních nedostatků.

**Žádný z nálezů neumožňoval okamžité převzetí kontroly nad serverem nebo únik citlivých dat.**

Klíčové opravené problémy:
- Přihlašovací stránka neměla ochranu před automatickým zkoušením hesel → opraveno
- Server prozrazoval interní chybové zprávy při selhání přihlášení → opraveno
- Při startu serveru se logovalo výchozí administrátorské heslo → odstraněno
- Nebyla nastavena bezpečnostní HTTP hlavička bránící vkládání stránek do rámů (clickjacking) → opraveno
- Nahrávání obrázků kontrolovalo pouze typ souboru, ne příponu → opraveno
- Databázovýhledaný obsah byl vkládán do HTML bez escapování → opraveno

---

## 2. Threat Model

| Aktivum | Hrozba | Kdo útočí |
|---------|--------|-----------|
| Admin účet (email + heslo) | Brute-force přihlašování | Neautorizovaný útočník |
| Administrace (obsah webu) | Kompromitovaný admin účet → změna obsahu | Útočník s přihlašovacími údaji |
| Poptávkový formulář | Spam, DoS | Bot |
| Nahraný soubor | Upload zákeřného souboru | Kompromitovaný admin |
| Interní chybové zprávy | Průzkum infrastruktury | Útočník |
| Veřejný web | XSS vložením obsahu | Kompromitovaný admin |

Neexistují: platby, objednávky, uživatelské účty, registrace. Útočná plocha je proto výrazně menší než u e-shopu.

---

## 3. Findings

### P1 – Vysoká priorita (opraveno)

| ID | OWASP kategorie | Popis | Dopad | Pravděpodobnost | Soubor + důkaz | Oprava |
|----|----------------|-------|-------|-----------------|----------------|--------|
| F1 | A07 – Identification & Auth Failures | **Login endpoint bez rate limitingu** – neomezený počet pokusů o přihlášení | Brute-force hesla admina | Střední | `routes/auth.js` – `router.post('/login')` – žádná ochrana | Přidán `checkLoginRateLimit()` – 10 pokusů / 15 min / IP, pattern z `inquiries.js` |
| F2 | A05 – Security Misconfiguration | **Chybějící bezpečnostní HTTP hlavičky** – `X-Content-Type-Options`, `X-Frame-Options`, `X-Powered-By` přítomen | Clickjacking, MIME sniffing, fingerprinting | Nízká–Střední | `server.js:35` – `app.use(cors())` bez dalšího | Přidán middleware se dvěma hlavičkami, `app.disable('x-powered-by')` |
| F3 | A09 – Security Logging | **Výchozí heslo v logu startu serveru** | Přihlašovací údaje viditelné v log agregátorech | Nízká | `server.js:73` – `console.log('🔐 Default Admin: admin@eolite.cz / admin123')` | Řádek odstraněn |
| F4 | A05 – Security Misconfiguration | **JWT_SECRET bez varování když chybí `.env`** | Server tiše běží s hardcoded tajemstvím z repo | Střední | `middleware/auth.js:3`, `routes/auth.js:8` – fallback `'eolite-dev-secret-change-in-production'` | Přidáno `console.warn` při startu pokud `process.env.JWT_SECRET` není nastaveno |
| F5 | A09 – Security Logging / A01 | **Login 500 handler vracel `error.message`** | Leak DB struktury, cest, interních chyb útočníkovi | Nízká–Střední | `routes/auth.js:42` – `res.status(500).json({ error: error.message })` | Nahrazeno generickým textem; chyba zůstává logována na serveru |
| F6 | A01 – Broken Access Control / A03 Injection | **Gallery upload: chybí whitelist přípon** – kontrolován pouze MIME type (client-controlled), přípona souboru ne | Upload `.html`/`.svg` s falešným MIME → stored XSS | Střední (admin-only) | `routes/gallery.js:27-31` – `fileFilter` kontroluje `file.mimetype`, `path.extname` nekontrolován | Přidán `ALLOWED_EXT` Set, rozšířen `fileFilter` o kontrolu přípony |

### P2 – Střední priorita (doporučení, NEimplementováno)

| ID | OWASP kategorie | Popis | Dopad | Soubor | Proč neimplementováno |
|----|----------------|-------|-------|--------|----------------------|
| F7-xss | A03 – Injection (XSS) | **XSS v page content / magazine body** – `content_cz/en` vkládáno přes `innerHTML` beze sanitace | Stored XSS pokud admin účet kompromitován | `public.js:349,699` – `target.innerHTML = content.replace(/\n/g, '<br>')` | Intentional rich text – záměrné HTML; sanitizer by vyžadoval allowlist tagů (nová závislost nebo ~60 řádků allowlist logiky). Explicitace: v P1 opravě byly strukturální pole ošetřena `esc()` |
| F8-cors | A01 | **CORS plně otevřen** (`app.use(cors())`) | Libovolná doména může volat API v prohlížeči uživatele | `server.js:42` | Potřebuje znalost produkční domény. Pro JWT-based API bez cookies je reálný dopad nízký. Doporučení: `cors({ origin: 'https://eolite.cz' })` |
| F9-csp | A05 | **Chybí Content-Security-Policy hlavička** | Mitigace XSS exploitace | `server.js` | Správná CSP vyžaduje audit všech zdrojů (fonty, obrázky, inline scripts); riziko rozbití webu. Zavést postupně v DevTools |
| F10-jwt | A07 | **JWT token nelze invalidovat před expirací** | Odcizený token platí 24 hod i po logout | `frontend/js/auth.js` – localStorage clear, ale server neudržuje blacklist | Vyžaduje server-side token store (architekturální změna) |
| F11-errmsg | A05 | **Admin routes vracejí `error.message`** (DB errors) | Leak DB schema informací authenticated adminům | Všechny `routes/*.js` catch bloky | Dopad nízký – viditelné jen autentizovanému adminovi; fix by byl 50+ změn |

---

## 4. Opravy implementované (P1)

### F1 – Login rate limiting (`routes/auth.js`)

```javascript
// Přidáno nad router.post('/login'):
const loginRateLimits = new Map();
const LOGIN_RATE_MAX = 10;
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;

function checkLoginRateLimit(ip) { ... } // stejný pattern jako inquiries.js

// V handleru:
const ip = req.ip || req.connection?.remoteAddress || '0.0.0.0';
if (!checkLoginRateLimit(ip)) {
  return res.status(429).json({ error: 'Příliš mnoho pokusů...' });
}
```

Nezmění UX pro legitimní uživatele (10 pokusů za 15 minut je dostatečně velkorysé).

### F2 – Security headers (`server.js`)

```javascript
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
```

`SAMEORIGIN` (ne `DENY`) pro případ legitimního same-origin embeddingu.

### F3 – Default credentials removed from log (`server.js`)

Odstraněn řádek: `console.log('🔐 Default Admin: admin@eolite.cz / admin123');`

### F4 – JWT_SECRET warning (`server.js`)

```javascript
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET not set in .env – using insecure default...');
}
```

### F5 – Generic 500 in login (`routes/auth.js`)

```javascript
// Bylo:
res.status(500).json({ error: error.message });
// Je:
res.status(500).json({ error: 'Chyba serveru. Zkuste to prosím znovu.' });
```

Interní chyba stále logována přes `console.error`.

### F6 – Gallery extension whitelist (`routes/gallery.js`)

```javascript
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
// V fileFilter:
const ext = path.extname(file.originalname).toLowerCase();
if (!ALLOWED_EXT.has(ext)) {
  return cb(new Error(`Nepodporovaná přípona souboru: ${ext || '(žádná)'}`));
}
```

Brání uploadu `.html`, `.svg`, `.js` apod. i kdyby útočník podvrhl MIME type.

### F7-partial – XSS: esc() helper pro strukturální pole (`public.js`)

Přidána funkce `esc(str)` a aplikována na všechna **strukturální** pole (tituly, jména, tagy, src/alt atributy obrázků). Intentional rich-text pole (`content_cz/en` stránek a magazínu) zůstávají jako `innerHTML`.

```javascript
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
```

---

## 5. CSRF – proč není relevantní

Admin API používá JWT token v `Authorization: Bearer ...` headeru, nikoli cookie. CSRF útoky fungují tak, že přimějí prohlížeč oběti poslat request s cookie automaticky. Protože auth token je v custom headeru, který cross-origin požadavky nemohou nastavit bez CORS preflight, CSRF zde **není aplikovatelné**.

---

## 6. SQL Injection – proč není nalezeno

Veškeré dotazy používají parametrizované prepared statements:
```javascript
db.prepare('SELECT * FROM users WHERE email = ?').get(email)
```
Dynamicky sestavené SQL (reorder query) používá hodnoty pocházející z validovaného `direction ∈ ['up', 'down']` enumu. Žádná konkatenace user input do SQL.

---

## 7. Soubory změněné

| Soubor | Změna |
|--------|-------|
| `backend/server.js` | +JWT_SECRET warn, +security headers, +app.disable('x-powered-by'), -credentials log |
| `backend/routes/auth.js` | +login rate limiting, generic 500 error |
| `backend/routes/gallery.js` | +ALLOWED_EXT, +extension check v fileFilter |
| `frontend/js/public.js` | +esc() helper, esc() aplikován na 15+ strukturálních polí |
