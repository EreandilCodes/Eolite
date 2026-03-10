# Eolite – Manual Test Checklist

## Setup
- [ ] `npm install` completes without errors
- [ ] `npm run dev` starts server on port 3002
- [ ] Console shows "✅ Database initialization complete"
- [ ] Console shows "✅ Default admin created: admin@eolite.cz / admin123"

## Admin Login
- [ ] Visit http://localhost:3002/login
- [ ] Login with admin@eolite.cz / admin123 → redirects to /admin
- [ ] Invalid credentials → error message shown
- [ ] Visiting /admin without login → redirects to /login

## Admin – Reference Categories
- [ ] "Kategorie ref." section loads with empty table
- [ ] "Přidat" → modal opens
- [ ] Fill name_cz "Exteriéry", click Uložit → category appears in table
- [ ] Slug auto-generated as "exteriery"
- [ ] Edit category → form pre-fills
- [ ] ↑/↓ reorder buttons work (create 2+ categories first)
- [ ] Delete → confirmation → removed from list
- [ ] is_active toggle → badge changes

## Admin – References
- [ ] "Reference" section loads
- [ ] "Přidat" → modal opens with category dropdown populated
- [ ] Create reference with: category, title_cz, cover_image URL, gallery_json '["a.jpg","b.jpg"]'
- [ ] Reference appears in table with thumbnail
- [ ] is_featured → "⭐ Featured" badge shown
- [ ] Invalid gallery JSON → error notification
- [ ] Edit → form pre-fills all fields
- [ ] Delete → removed

## Admin – Magazín
- [ ] "Magazín" section loads
- [ ] "Přidat" → modal opens
- [ ] Create article, is_published unchecked → badge "Koncept"
- [ ] Create article, is_published checked → badge "Publikováno"
- [ ] Edit → form pre-fills
- [ ] Delete → removed

## Admin – Poptávky
- [ ] "Poptávky" section loads (empty or with test data)
- [ ] "Přidat" button hidden (no add for inquiries)
- [ ] Submit inquiry from public form (see Public tests) → appears here
- [ ] "✓" button marks as read (bold removed)
- [ ] Unread count badge visible if unread inquiries exist
- [ ] Delete → removed

## Admin – Obsah stránek
- [ ] "Obsah stránek" section loads with 6 default sections
- [ ] Edit "hero" → fill CZ content → save
- [ ] Public homepage shows updated content (reload /

## Public – Homepage
- [ ] Visit http://localhost:3002/
- [ ] All sections visible: hero, about, services, sales, magazine preview, contact
- [ ] CZ/EN language switcher works (texts change)
- [ ] Logo click → stays on homepage
- [ ] "Naše reference" button → navigates to /reference
- [ ] "Poptat projekt" → smooth scrolls to contact form
- [ ] Nav "Reference" dropdown shows categories (after creating some in admin)
- [ ] Magazine preview shows latest 3 posts (after publishing some)

## Public – Reference flow
- [ ] Visit /reference → categories grid shown
- [ ] Click category → /reference/:slug → references grid shown
- [ ] Breadcrumb: Reference › Category name
- [ ] Click reference → /reference/:slug/:id → detail shown
- [ ] Cover image displayed
- [ ] Gallery images shown in grid
- [ ] Click gallery image → lightbox opens
- [ ] Lightbox: click outside or ESC → closes
- [ ] Browser back button → goes to category list

## Public – Magazín
- [ ] Visit /magazine → article list
- [ ] Only published articles shown (not drafts)
- [ ] Click article → /magazine/:slug → full article
- [ ] Back link → returns to /magazine

## Public – Poptávkový formulář (Contact)
- [ ] Form visible on homepage #kontakt
- [ ] Submit empty form → validation prevents submission
- [ ] Submit without email → server error shown
- [ ] Submit valid form → "Děkujeme! Vaši poptávku..." success message
- [ ] Inquiry appears in admin panel
- [ ] Email mock log created in backend/logs/emails/

## Anti-bot
- [ ] Honeypot test: manually set inquiryHoneypot value in console → server returns 200 silently
- [ ] Time check: submit form immediately (< 2s) → "Formulář byl odeslán příliš rychle" error
- [ ] Rate limit: submit 6+ times in 5 min → 429 error

## i18n
- [ ] Switch to EN → hero title, nav, form labels all in English
- [ ] References with EN text → shows EN content
- [ ] References without EN text → shows CZ fallback
- [ ] Language preference persists after page reload

## Navigation
- [ ] All nav links work from both homepage and reference pages
- [ ] Mobile: hamburger icon visible on < 768px
- [ ] Mobile: tap hamburger → nav opens
- [ ] Mobile: tap outside → nav closes
- [ ] Dropdown menus work on hover (desktop)

## Email (Mock mode)
- [ ] Submit inquiry → check console for "📧 MOCK EMAIL"
- [ ] Check backend/logs/emails/ for JSON log file
- [ ] Log contains: to, subject, text with inquiry data
