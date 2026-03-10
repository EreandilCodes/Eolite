# TESTING.md – Security Hardening Smoke Test
**Datum:** 2026-03-01
**Scope:** Ověření funkčnosti po security opravách (P1 fixes)

---

## A) Backend Smoke Test

### Spuštění
```bash
npm run dev
# Očekávaný výstup:
# ✅ Database opened successfully
# ✅ Database initialization complete
# ⚠️  JWT_SECRET not set in .env – using insecure default...  ← nový warning (pokud .env neexistuje)
# ✅ Eolite Server running on http://localhost:3002
# ❌ NESMÍ být: "🔐 Default Admin: admin@eolite.cz / admin123"
```

### Route registration check
Ověř v konzoli, že se nespustí žádná `Error:` hláška při startu.

---

## B) Manual Test Checklist

### 1. Security headers (NOVÉ)
- [ ] Otevři DevTools → Network → libovolný request
- [ ] Ověř přítomnost: `X-Content-Type-Options: nosniff`
- [ ] Ověř přítomnost: `X-Frame-Options: SAMEORIGIN`
- [ ] Ověř nepřítomnost: `X-Powered-By` header

### 2. Login – normální tok
- [ ] Jdi na `http://localhost:3002/login`
- [ ] Zadej `admin@eolite.cz` / `admin123`
- [ ] Ověř přesměrování na `/admin`
- [ ] Admin panel se načte správně se všemi sekcemi v postranním panelu

### 3. Login – brute-force ochrana (NOVÉ)
- [ ] Odhlás se (nebo otevři incognito)
- [ ] Zkus odeslat přihlašovací formulář 11x za sebou se špatným heslem
- [ ] 11. pokus musí vrátit HTTP 429 a zprávu "Příliš mnoho pokusů..."
- [ ] Po 15 minutách (nebo restartu serveru) funguje přihlášení znovu

### 4. Login – generic 500 error (NOVÉ)
- [ ] Tento bod ověřuje chování při DB pádu – normálně netestovatelné bez zastavení DB
- [ ] Stačí ověřit, že při chybném hesle chodí `401` (ne 500) a správná hláška

### 5. Unauthorized access na admin endpointy
- [ ] Bez přihlášení zkus: `GET http://localhost:3002/api/references/admin/all`
- [ ] Musí vrátit `401 { "error": "Authentication required" }`
- [ ] Totéž pro: `/api/gallery/folders`, `/api/magazine/admin/all`, `/api/inquiries/admin/all`

### 6. Admin UI – všechny sekce
- [ ] Přihlas se jako admin
- [ ] Klikni na každou sekci v postranním panelu: Reference kategorie, Reference, Magazín, Poptávky, Stránky, Galerie, Nastavení
- [ ] Žádná sekce nesmí hodit JavaScript error v konzoli

### 7. Gallery upload – povolené typy (nezměněno)
- [ ] Admin → Galerie → Nahrát fotky
- [ ] Nahrát `.jpg` nebo `.png` soubor
- [ ] Musí se nahrát úspěšně a zobrazit v tabulce

### 8. Gallery upload – blokování nebezpečných přípon (NOVÉ)
- [ ] Zkus nahrát soubor s příponou `.html` (přejmenuj libovolný soubor)
- [ ] Multer MUSÍ odmítnout s HTTP 400 a chybovou zprávou o příponě
- [ ] Totéž pro `.svg`, `.js`, `.php`

### 9. Gallery upload – blokování nesprávného MIME
- [ ] Zkus nahrát soubor `.txt` přejmenovaný na `.jpg` (MIME bude `image/jpeg` od prohlížeče, přípona `.jpg`)
- [ ] Toto PROJDE (přípona i MIME jsou povoleny) – sharp ho odmítne nebo zpracuje jako prázdný obrázek, to je OK
- [ ] Pokud přípona je `.html` ale MIME je `image/jpeg` → musí být odmítnuto (extension check)

### 10. Veřejný web – homepage
- [ ] Jdi na `http://localhost:3002/`
- [ ] Stránka se načte
- [ ] Přepni CZ/EN – texty se změní, tlačítko "Odeslat poptávku" / "Send Inquiry" se přepne

### 11. XSS – escapování v kartách (NOVÉ – pokud máte testovací data)
- [ ] Pokud existuje kategorie nebo reference, jejíž název obsahuje HTML znaky (např. `<Test>` nebo `&amp;`),
  ověř, že se v prohlížeči zobrazí jako text, nikoli jako HTML element
- [ ] Lze otestovat: admin → Reference kategorie → přejmenovat na `Test<b>Bold</b>` →
  na veřejném webu musí být vidět literální text, ne tučný text

### 12. Poptávkový formulář – odeslání
- [ ] Na homepage vyplň formulář se jménem, emailem, zprávou
- [ ] Odešli
- [ ] Zobrazí se potvrzení "Děkujeme! Vaši poptávku jsme obdrželi..."
- [ ] V Admin → Poptávky se zobrazí nový záznam

### 13. Poptávkový formulář – rate limit
- [ ] Zkus odeslat formulář 6x rychle za sebou ze stejné IP
- [ ] 6. pokus musí být odmítnut s HTTP 429

### 14. Reference detail – carousel
- [ ] Pokud existuje reference s galerií obrázků
- [ ] Klikni na ni na veřejném webu
- [ ] Carousel musí fungovat (šipky, tečky, klik → lightbox)

### 15. Magazine – veřejný seznam a detail
- [ ] Jdi na `/magazine`
- [ ] Pokud existují publikované články, zobrazí se karty
- [ ] Klikni na článek → zobrazí se detail
- [ ] Zpět → funguje navigace

### 16. Logout
- [ ] V admin panelu klikni logout (nebo smaž eolite_token z localStorage)
- [ ] Přístup na `/admin` přesměruje na `/login`

---

## C) Výsledky testů (vyplnit ručně)

| # | Test | Status | Poznámka |
|---|------|--------|----------|
| 1 | Security headers | ✅ | X-Content-Type-Options, X-Frame-Options přítomny; X-Powered-By chybí |
| 2 | Login normální | ✅ | |
| 3 | Brute-force ochrana | ✅ | 429 na 11. pokusu |
| 4 | Generic 500 login | ✅ | |
| 5 | Unauthorized access | ✅ | 401 bez tokenu |
| 6 | Admin UI všechny sekce | ✅ | |
| 7 | Gallery upload povolené | ✅ | |
| 8 | Gallery upload blokování | ✅ | .html odmítnuto s 400 |
| 9 | MIME check | ✅ | |
| 10 | Homepage + i18n | ✅ | |
| 11 | XSS escapování | ✅ | |
| 12 | Poptávka odeslání | ✅ | |
| 13 | Poptávka rate limit | ✅ | |
| 14 | Reference carousel | ✅ | |
| 15 | Magazine | ✅ | |
| 16 | Logout | ✅ | |

---

## D) Regresní body

Po opravách NESMÍ nastat:
- Admin panel se nenačte (login broken)
- Upload obrázků přestane fungovat pro `.jpg/.png/.webp/.gif`
- Veřejný web nezobrazí obsah (XSS fix nesmí rozbít escapované tituly)
- Magazine article body se zobrazuje jako HTML text místo formátovaného obsahu
- Poptávkový formulář přestane fungovat
