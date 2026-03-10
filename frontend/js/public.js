/**
 * Eolite Public Website JS
 * -------------------------
 * - i18n: CZ/EN, localStorage, fallback CZ
 * - SPA routing: reads window.location.pathname, renders accordingly
 * - Safe Fetch Pattern on all API calls
 * - Dropdown navigation (hover CSS + mobile JS toggle)
 * - Inquiry form with anti-bot (honeypot + time check)
 * - Reference categories dynamically loaded into nav dropdown
 */

// ============================================================
// i18n UI texts
// ============================================================
const UI = {
  cz: {
    nav: {
      home: 'Úvod', about: 'O nás', services: 'Služby',
      reference: 'Reference', allRef: 'Všechny reference', magazine: 'Magazín', contact: 'Kontakt',
      inquiry: 'Poptat'
    },
    hero: {
      title: 'Kvalitní práce, která vydrží',
      subtitle: 'Profesionální řešení pro váš projekt.',
      cta: 'Naše reference', ctaInquiry: 'Poptat projekt'
    },
    about: { heading: 'O nás' },
    services: { heading: 'Služby' },
    reference: { heading: 'Reference', categories: 'Kategorie', all: 'Všechny reference', back: '← Zpět', featured: '⭐ Doporučená', noContent: 'Žádné reference v této kategorii.' },
    magazine: { heading: 'Magazín', readMore: 'Číst více', noContent: 'Žádné články.' },
    contact: {
      heading: 'Kontakt',
      formTitle: 'Poptávkový formulář',
      name: 'Jméno *', email: 'E-mail *', phone: 'Telefon', message: 'Zpráva *',
      submit: 'Odeslat poptávku', sending: 'Odesílám...',
      success: 'Děkujeme! Vaši poptávku jsme obdrželi a brzy vás kontaktujeme.',
      error: 'Chyba při odesílání. Zkuste to prosím znovu.'
    },
    footer: '© 2025 Eolite. Všechna práva vyhrazena.',
    loading: 'Načítám...',
    error: 'Chyba při načítání dat.'
  },
  en: {
    nav: {
      home: 'Home', about: 'About Us', services: 'Services',
      reference: 'References', allRef: 'All references', magazine: 'Magazine', contact: 'Contact',
      inquiry: 'Request'
    },
    hero: {
      title: 'Quality work that lasts',
      subtitle: 'Professional solutions for your project.',
      cta: 'Our references', ctaInquiry: 'Request a project'
    },
    about: { heading: 'About Us' },
    services: { heading: 'Services' },
    reference: { heading: 'References', categories: 'Categories', all: 'All references', back: '← Back', featured: '⭐ Featured', noContent: 'No references in this category.' },
    magazine: { heading: 'Magazine', readMore: 'Read more', noContent: 'No articles.' },
    contact: {
      heading: 'Contact',
      formTitle: 'Inquiry Form',
      name: 'Name *', email: 'E-mail *', phone: 'Phone', message: 'Message *',
      submit: 'Send Inquiry', sending: 'Sending...',
      success: 'Thank you! We received your inquiry and will contact you shortly.',
      error: 'Error sending. Please try again.'
    },
    footer: '© 2025 Eolite. All rights reserved.',
    loading: 'Loading...',
    error: 'Error loading data.'
  }
};

// ============================================================
// Safe Fetch helper
// ============================================================
async function safeFetch(url) {
  const response = await fetch(url);
  const contentType = response.headers.get('content-type');

  if (!response.ok) {
    const err = contentType?.includes('application/json')
      ? await response.json()
      : { error: await response.text() };
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  if (!contentType?.includes('application/json')) {
    throw new Error('Neplatná odpověď serveru');
  }

  return response.json();
}

// ============================================================
// Language helpers
// ============================================================
function getLang() {
  return localStorage.getItem('eolite_lang') || 'cz';
}

function setLang(lang) {
  localStorage.setItem('eolite_lang', lang);
}

function t(path) {
  const lang = getLang();
  const keys = path.split('.');
  let obj = UI[lang];
  for (const k of keys) {
    if (!obj) return path;
    obj = obj[k];
  }
  return obj || UI['cz'][path.split('.').reduce((o, k) => o?.[k], UI['cz'])] || path;
}

function pick(czVal, enVal) {
  const lang = getLang();
  if (lang === 'en' && enVal) return enVal;
  return czVal || enVal || '';
}

// HTML-escape helper for DB-sourced values inserted into innerHTML templates.
// Use for structural fields (titles, names, tags, URLs in attributes).
// Do NOT use for intentional rich-text content (page content, article body).
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ============================================================
// PublicApp
// ============================================================
class PublicApp {
  constructor() {
    this.lang = getLang();
    this.categories = [];
    this.formLoadedAt = Date.now();
  }

  async init() {
    this.updateLangButtons();
    this.setupLangSwitcher();
    this.setupMobileMenu();

    // Load categories for nav dropdown
    await this.loadCategoriesForNav();

    // Route to correct view
    this.route();

    // Update all i18n text in nav
    this.updateNavTexts();
  }

  // ============================================================
  // Routing
  // ============================================================
  route() {
    const path = window.location.pathname;

    if (path === '/' || path === '/index.html') {
      this.showView('homepage');
      this.loadHomepageContent();
    } else if (path === '/reference') {
      this.showView('reference-overview');
      this.loadReferenceOverview();
    } else if (/^\/reference\/[^/]+\/\d+$/.test(path)) {
      // /reference/:slug/:id
      const parts = path.split('/');
      const id = parts[parts.length - 1];
      const slug = parts[parts.length - 2];
      this.showView('reference-detail');
      this.loadReferenceDetail(slug, id);
    } else if (/^\/reference\/[^/]+$/.test(path)) {
      // /reference/:slug
      const slug = path.split('/').pop();
      this.showView('reference-category');
      this.loadReferenceCategory(slug);
    } else if (path === '/magazine') {
      this.showView('magazine-list');
      this.loadMagazineList();
    } else if (/^\/magazine\//.test(path)) {
      const slug = path.replace('/magazine/', '');
      this.showView('magazine-article');
      this.loadMagazineArticle(slug);
    } else {
      this.showView('homepage');
      this.loadHomepageContent();
    }
  }

  showView(viewId) {
    const main = document.getElementById('siteMain');
    if (!main) return;

    // Each view is a template rendered into siteMain
    // The homepage sections are in the DOM by default
    const allViews = main.querySelectorAll('[data-view]');
    allViews.forEach(v => v.style.display = 'none');

    const view = document.getElementById(`view-${viewId}`);
    if (view) {
      view.style.display = 'block';
    } else {
      // Dynamically create view containers for non-homepage views
      const div = document.createElement('div');
      div.id = `view-${viewId}`;
      div.setAttribute('data-view', viewId);
      div.innerHTML = `<div class="loading-spinner">${UI[this.lang].loading}</div>`;
      main.appendChild(div);
    }
  }

  // ============================================================
  // i18n
  // ============================================================
  setupLangSwitcher() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        setLang(lang);
        this.lang = lang;
        this.updateLangButtons();
        this.updateNavTexts();
        this.route();
      });
    });
  }

  updateLangButtons() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === getLang());
    });
  }

  updateNavTexts() {
    const u = UI[this.lang].nav;
    const el = (id) => document.getElementById(id);

    const setText = (id, text) => { const e = el(id); if (e) e.textContent = text; };

    setText('navHome', u.home);
    setText('navAbout', u.about);
    setText('navServices', u.services);
    setText('navReference', u.reference);
    setText('navAllRef', u.allRef);
    setText('navMagazine', u.magazine);
    setText('navContact', u.contact);
    setText('navInquiry', u.inquiry);
    setText('footerText', UI[this.lang].footer);
  }

  // ============================================================
  // Mobile menu
  // ============================================================
  setupMobileMenu() {
    const toggle = document.getElementById('mobileMenuToggle');
    const nav = document.getElementById('mainNav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', () => {
      nav.classList.toggle('mobile-open');
    });

    // Toggle sub-dropdowns on mobile (click on parent link)
    nav.querySelectorAll('li.has-dropdown > a').forEach(link => {
      link.addEventListener('click', (e) => {
        if (window.innerWidth > 768) return; // desktop uses CSS :hover
        const li = link.closest('li.has-dropdown');
        const isOpen = li.classList.contains('dropdown-open');
        nav.querySelectorAll('li.has-dropdown.dropdown-open').forEach(el => el.classList.remove('dropdown-open'));
        if (!isOpen) {
          li.classList.add('dropdown-open');
          e.preventDefault();
        }
      });
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!nav.contains(e.target) && !toggle.contains(e.target)) {
        nav.classList.remove('mobile-open');
        nav.querySelectorAll('li.has-dropdown.dropdown-open').forEach(el => el.classList.remove('dropdown-open'));
      }
    });
  }

  // ============================================================
  // Categories → nav dropdown
  // ============================================================
  async loadCategoriesForNav() {
    try {
      this.categories = await safeFetch('/api/references/categories');
      const dropdown = document.getElementById('referenceDropdown');
      if (!dropdown) return;

      const lang = getLang();
      const catLinks = this.categories.map(cat => {
        const name = esc(pick(cat.name_cz, cat.name_en));
        // slug is server-validated [a-z0-9-]+ so no escaping needed there
        return `<li><a href="/reference/${cat.slug}" onclick="app.navigate('/reference/${cat.slug}');return false;">${name}</a></li>`;
      }).join('');

      dropdown.innerHTML =
        `<li><a href="/reference" id="navAllRef" onclick="app.navigate('/reference');return false;">${UI[lang].nav.allRef}</a></li>` +
        catLinks;
    } catch (error) {
      // Non-critical – nav still works without categories
      console.warn('Could not load categories for nav:', error.message);
    }
  }

  navigate(path) {
    window.history.pushState({}, '', path);
    this.route();
    // Scroll to top
    window.scrollTo(0, 0);
    // Close mobile menu
    document.getElementById('mainNav')?.classList.remove('mobile-open');
  }

  // ============================================================
  // HOMEPAGE
  // ============================================================
  async loadHomepageContent() {
    const view = document.getElementById('view-homepage');
    if (!view) return;

    const lang = this.lang;
    const u = UI[lang];

    view.style.display = 'block';

    // Update hero texts from UI strings (static fallback)
    const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    const setHTML = (id, val) => { const e = document.getElementById(id); if (e) e.innerHTML = val; };

    setEl('heroTitle', u.hero.title);
    setEl('heroSubtitle', u.hero.subtitle);
    setEl('heroCta', u.hero.cta);
    setEl('heroCtaInquiry', u.hero.ctaInquiry);
    setEl('aboutHeading', u.about.heading);
    setEl('servicesHeading', u.services.heading);
    setEl('magazinePreviewHeading', u.magazine.heading);
    setEl('contactHeading', u.contact.heading);
    setEl('formTitle', u.contact.formTitle);
    setEl('formNameLabel', u.contact.name);
    setEl('formEmailLabel', u.contact.email);
    setEl('formPhoneLabel', u.contact.phone);
    setEl('formMessageLabel', u.contact.message);
    setEl('inquirySubmitBtn', u.contact.submit);

    // Load page content from DB
    try {
      const sections = await safeFetch('/api/pages');
      sections.forEach(s => {
        const content = pick(s.content_cz, s.content_en);
        const target = document.getElementById(`pageContent_${s.section_key}`);
        if (target && content) target.innerHTML = content.replace(/\n/g, '<br>');
      });
    } catch (err) {
      console.warn('Could not load page content:', err.message);
    }

    // Load magazine preview (latest 3 posts)
    this.loadMagazinePreview();

    // Setup inquiry form
    this.setupInquiryForm();
    this.formLoadedAt = Date.now();
  }

  // ============================================================
  // REFERENCE OVERVIEW
  // ============================================================
  async loadReferenceOverview() {
    const viewId = 'view-reference-overview';
    const lang = this.lang;
    const u = UI[lang].reference;

    let view = document.getElementById(viewId);
    if (!view) {
      view = document.createElement('div');
      view.id = viewId;
      view.setAttribute('data-view', 'reference-overview');
      document.getElementById('siteMain').appendChild(view);
    }
    view.style.display = 'block';

    view.innerHTML = `
      <div class="ref-category-header">
        <div class="section-container">
          <h1 class="section-title">${u.heading}</h1>
          <p class="section-subtitle">${u.categories}</p>
        </div>
      </div>
      <div class="section-block">
        <div class="section-container">
          <div id="catGrid" class="card-grid"><div class="loading-spinner">${UI[lang].loading}</div></div>
        </div>
      </div>
    `;

    try {
      const cats = await safeFetch('/api/references/categories');
      const grid = document.getElementById('catGrid');
      if (!grid) return;

      if (!cats.length) {
        grid.innerHTML = `<p class="empty-message">${u.noContent}</p>`;
        return;
      }

      grid.innerHTML = cats.map(cat => {
        const name = esc(pick(cat.name_cz, cat.name_en));
        return `
          <div class="card" style="cursor:pointer" onclick="app.navigate('/reference/${cat.slug}')">
            <div class="card-body">
              ${cat.tag ? `<span class="card-tag">${esc(cat.tag)}</span>` : ''}
              <h2 class="card-title">${name}</h2>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      const grid = document.getElementById('catGrid');
      if (grid) grid.innerHTML = `<p class="empty-message">${UI[lang].error}</p>`;
    }
  }

  // ============================================================
  // REFERENCE CATEGORY (list of refs in a category)
  // ============================================================
  async loadReferenceCategory(slug) {
    const viewId = 'view-reference-category';
    const lang = this.lang;
    const u = UI[lang].reference;

    let view = document.getElementById(viewId);
    if (!view) {
      view = document.createElement('div');
      view.id = viewId;
      view.setAttribute('data-view', 'reference-category');
      document.getElementById('siteMain').appendChild(view);
    }
    view.style.display = 'block';
    view.innerHTML = `<div class="loading-spinner">${UI[lang].loading}</div>`;

    try {
      const [cat, refs] = await Promise.all([
        safeFetch(`/api/references/categories/${slug}`),
        safeFetch(`/api/references?category=${slug}`)
      ]);

      const catName = esc(pick(cat.name_cz, cat.name_en));

      view.innerHTML = `
        <div class="ref-category-header">
          <div class="section-container">
            <div class="ref-breadcrumb">
              <a href="/reference" onclick="app.navigate('/reference');return false;">${u.heading}</a>
              <span>›</span> ${catName}
            </div>
            <h1 class="section-title">${catName}</h1>
            ${cat.tag ? `<p class="section-subtitle">${esc(cat.tag)}</p>` : ''}
          </div>
        </div>
        <div class="section-block">
          <div class="section-container">
            <div class="card-grid" id="refList">
              ${refs.length ? refs.map(ref => this.renderRefCard(ref, slug)).join('') : `<p class="empty-message">${u.noContent}</p>`}
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      view.innerHTML = `<div class="section-block"><div class="section-container"><p class="empty-message">${UI[lang].error}</p></div></div>`;
    }
  }

  renderRefCard(ref, slug) {
    const lang = this.lang;
    const u = UI[lang].reference;
    const title = esc(pick(ref.title_cz, ref.title_en));
    const desc  = esc(pick(ref.description_cz, ref.description_en));
    const catSlug = slug || ref.category_slug; // server-validated slug

    return `
      <div class="card" style="cursor:pointer" onclick="app.navigate('/reference/${catSlug}/${ref.id}')">
        ${ref.cover_image
          ? `<img src="${esc(ref.cover_image)}" alt="${title}" class="card-img">`
          : `<div class="card-img-placeholder">🏗</div>`
        }
        <div class="card-body">
          ${ref.is_featured ? `<span class="card-tag featured">${u.featured}</span>` : ''}
          <h3 class="card-title">${title}</h3>
          ${desc ? `<p class="card-text">${desc}</p>` : ''}
        </div>
      </div>
    `;
  }

  // ============================================================
  // REFERENCE DETAIL
  // ============================================================
  async loadReferenceDetail(slug, id) {
    const viewId = 'view-reference-detail';
    const lang = this.lang;
    const u = UI[lang].reference;

    let view = document.getElementById(viewId);
    if (!view) {
      view = document.createElement('div');
      view.id = viewId;
      view.setAttribute('data-view', 'reference-detail');
      document.getElementById('siteMain').appendChild(view);
    }
    view.style.display = 'block';
    view.innerHTML = `<div class="loading-spinner">${UI[lang].loading}</div>`;

    try {
      const ref = await safeFetch(`/api/references/${id}`);
      const title   = esc(pick(ref.title_cz, ref.title_en));
      const descRaw = pick(ref.description_cz, ref.description_en);
      const catName = esc(pick(ref.category_name_cz, ref.category_name_en));
      // Description: escape HTML entities first, then convert newlines to <br>
      const desc = descRaw ? esc(descRaw).replace(/\n/g, '<br>') : '';

      let galleryHTML = '';
      if (ref.gallery_json) {
        try {
          const imgs = JSON.parse(ref.gallery_json);
          if (imgs.length) {
            galleryHTML = `
              <h3 class="ref-gallery-heading">Galerie</h3>
              <div class="ref-carousel">
                <div class="ref-carousel-viewport">
                  <div class="ref-carousel-track">
                    ${imgs.map((src, i) => `
                      <div class="ref-carousel-slide" data-src="${esc(src)}">
                        <img src="${esc(src)}" alt="${title}" loading="${i === 0 ? 'eager' : 'lazy'}">
                      </div>
                    `).join('')}
                  </div>
                </div>
                ${imgs.length > 1 ? `
                  <button class="ref-carousel-btn ref-carousel-prev" aria-label="Předchozí">&#8249;</button>
                  <button class="ref-carousel-btn ref-carousel-next" aria-label="Další">&#8250;</button>
                  <div class="ref-carousel-footer">
                    <div class="ref-carousel-dots">
                      ${imgs.map((_, i) => `<span class="ref-carousel-dot${i === 0 ? ' active' : ''}" data-index="${i}"></span>`).join('')}
                    </div>
                    <span class="ref-carousel-counter">1 / ${imgs.length}</span>
                  </div>
                ` : ''}
              </div>
            `;
          }
        } catch {}
      }

      view.innerHTML = `
        <div class="section-block">
          <div class="section-container">
            <div class="ref-breadcrumb">
              <a href="/reference" onclick="app.navigate('/reference');return false;">${u.heading}</a>
              <span>›</span>
              <a href="/reference/${ref.category_slug}" onclick="app.navigate('/reference/${ref.category_slug}');return false;">${catName}</a>
              <span>›</span> ${title}
            </div>
            <div class="ref-detail">
              ${ref.cover_image ? `<div class="ref-detail-cover"><img src="${esc(ref.cover_image)}" alt="${title}"></div>` : ''}
              <div class="ref-detail-content">
                ${ref.is_featured ? `<span class="ref-featured-badge">${u.featured}</span>` : ''}
                <h1>${title}</h1>
                ${desc ? `<p>${desc}</p>` : ''}
              </div>
              ${galleryHTML}
            </div>
          </div>
        </div>
      `;
      initCarousel(view.querySelector('.ref-carousel'));
    } catch (err) {
      view.innerHTML = `<div class="section-block"><div class="section-container"><p class="empty-message">${UI[lang].error}</p></div></div>`;
    }
  }

  // ============================================================
  // MAGAZINE LIST
  // ============================================================
  async loadMagazineList() {
    const viewId = 'view-magazine-list';
    const lang = this.lang;
    const u = UI[lang].magazine;

    let view = document.getElementById(viewId);
    if (!view) {
      view = document.createElement('div');
      view.id = viewId;
      view.setAttribute('data-view', 'magazine-list');
      document.getElementById('siteMain').appendChild(view);
    }
    view.style.display = 'block';
    view.innerHTML = `
      <div class="ref-category-header">
        <div class="section-container"><h1 class="section-title">${u.heading}</h1></div>
      </div>
      <div class="section-block">
        <div class="section-container">
          <div class="card-grid" id="magazineGrid"><div class="loading-spinner">${UI[lang].loading}</div></div>
        </div>
      </div>
    `;

    try {
      const posts = await safeFetch('/api/magazine');
      const grid = document.getElementById('magazineGrid');
      if (!grid) return;

      if (!posts.length) {
        grid.innerHTML = `<p class="empty-message">${u.noContent}</p>`;
        return;
      }

      grid.innerHTML = posts.map(p => {
        const title   = esc(pick(p.title_cz, p.title_en));
        const excerpt = esc(pick(p.excerpt_cz, p.excerpt_en));
        // date comes from toLocaleDateString – always safe, no escaping needed
        const date = p.published_at ? new Date(p.published_at).toLocaleDateString(lang === 'cz' ? 'cs-CZ' : 'en-GB') : '';
        return `
          <div class="card" style="cursor:pointer" onclick="app.navigate('/magazine/${p.slug}')">
            ${p.cover_image ? `<img src="${esc(p.cover_image)}" alt="${title}" class="card-img">` : ''}
            <div class="card-body">
              ${date ? `<p style="font-size:0.78em;color:var(--color-text-lt);margin-bottom:0.35rem">${date}</p>` : ''}
              <h3 class="card-title">${title}</h3>
              ${excerpt ? `<p class="card-text">${excerpt}</p>` : ''}
            </div>
            <div class="card-footer">
              <span style="font-size:0.875em;color:var(--color-accent);font-weight:500">${u.readMore} →</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      const grid = document.getElementById('magazineGrid');
      if (grid) grid.innerHTML = `<p class="empty-message">${UI[lang].error}</p>`;
    }
  }

  async loadMagazinePreview() {
    const lang = this.lang;
    const container = document.getElementById('magazinePreviewGrid');
    if (!container) return;

    try {
      const posts = await safeFetch('/api/magazine');
      const latest = posts.slice(0, 3);

      if (!latest.length) {
        container.style.display = 'none';
        return;
      }

      container.innerHTML = latest.map(p => {
        const title   = esc(pick(p.title_cz, p.title_en));
        const excerpt = esc(pick(p.excerpt_cz, p.excerpt_en));
        return `
          <div class="card" style="cursor:pointer" onclick="app.navigate('/magazine/${p.slug}')">
            ${p.cover_image ? `<img src="${esc(p.cover_image)}" alt="${title}" class="card-img">` : ''}
            <div class="card-body">
              <h3 class="card-title">${title}</h3>
              ${excerpt ? `<p class="card-text">${excerpt}</p>` : ''}
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.warn('Could not load magazine preview:', err.message);
    }
  }

  // ============================================================
  // MAGAZINE ARTICLE
  // ============================================================
  async loadMagazineArticle(slug) {
    const viewId = 'view-magazine-article';
    const lang = this.lang;

    let view = document.getElementById(viewId);
    if (!view) {
      view = document.createElement('div');
      view.id = viewId;
      view.setAttribute('data-view', 'magazine-article');
      document.getElementById('siteMain').appendChild(view);
    }
    view.style.display = 'block';
    view.innerHTML = `<div class="loading-spinner">${UI[lang].loading}</div>`;

    try {
      const post = await safeFetch(`/api/magazine/${slug}`);
      const title   = esc(pick(post.title_cz, post.title_en));
      const content = pick(post.content_cz, post.content_en); // intentional rich-text, not escaped
      const date = post.published_at ? new Date(post.published_at).toLocaleDateString(lang === 'cz' ? 'cs-CZ' : 'en-GB') : '';

      view.innerHTML = `
        <div class="magazine-article">
          <a href="/magazine" class="back-link" onclick="app.navigate('/magazine');return false;">← ${UI[lang].magazine.heading}</a>
          ${post.cover_image ? `<div class="article-cover"><img src="${esc(post.cover_image)}" alt="${title}"></div>` : ''}
          <h1 style="font-size:2rem;font-weight:700;color:var(--color-primary);margin-bottom:0.75rem">${title}</h1>
          ${date ? `<p class="article-meta">${date}</p>` : ''}
          <div class="article-content">${content ? content.replace(/\n/g, '<br>') : ''}</div>
        </div>
      `;
    } catch (err) {
      view.innerHTML = `<div class="section-block"><div class="section-container"><p class="empty-message">${UI[lang].error}</p></div></div>`;
    }
  }

  // ============================================================
  // INQUIRY FORM
  // ============================================================
  setupInquiryForm() {
    const form = document.getElementById('inquiryForm');
    if (!form) return;

    this.formLoadedAt = Date.now();

    // Guard: only attach listener once across all navigate() calls
    if (form.dataset.bound) return;
    form.dataset.bound = '1';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.submitInquiry(form);
    });
  }

  async submitInquiry(form) {
    const lang = this.lang;
    const u = UI[lang].contact;
    const submitBtn = document.getElementById('inquirySubmitBtn');
    const feedback = document.getElementById('inquiryFeedback');

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = u.sending; }
    if (feedback) { feedback.className = 'form-feedback'; feedback.textContent = ''; }

    try {
      const data = {
        name: document.getElementById('inquiryName')?.value.trim(),
        email: document.getElementById('inquiryEmail')?.value.trim(),
        phone: document.getElementById('inquiryPhone')?.value.trim(),
        message: document.getElementById('inquiryMessage')?.value.trim(),
        // Honeypot
        website: document.getElementById('inquiryHoneypot')?.value || '',
        // Time check
        form_loaded_at: this.formLoadedAt
      };

      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const err = contentType?.includes('application/json') ? await response.json() : { error: await response.text() };
        throw new Error(err.error || u.error);
      }

      if (feedback) {
        feedback.className = 'form-feedback success';
        feedback.textContent = u.success;
      }

      form.reset();
      this.formLoadedAt = Date.now();
    } catch (error) {
      if (feedback) {
        feedback.className = 'form-feedback error';
        feedback.textContent = error.message || u.error;
      }
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = u.submit; }
    }
  }
}

// ============================================================
// Reference gallery carousel
// ============================================================
function initCarousel(el) {
  if (!el) return;
  const track = el.querySelector('.ref-carousel-track');
  const slides = el.querySelectorAll('.ref-carousel-slide');
  const prevBtn = el.querySelector('.ref-carousel-prev');
  const nextBtn = el.querySelector('.ref-carousel-next');
  const dots = el.querySelectorAll('.ref-carousel-dot');
  const counter = el.querySelector('.ref-carousel-counter');
  const count = slides.length;
  let current = 0;

  function goTo(index) {
    current = (index + count) % count;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
    if (counter) counter.textContent = `${current + 1} / ${count}`;
  }

  // Click slide → lightbox
  slides.forEach(slide => {
    slide.addEventListener('click', () => openLightbox(slide.dataset.src));
  });

  if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); goTo(current - 1); });
  if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); goTo(current + 1); });
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));

  // Keyboard navigation
  el.setAttribute('tabindex', '0');
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') goTo(current - 1);
    if (e.key === 'ArrowRight') goTo(current + 1);
  });

  // Touch swipe
  let touchStartX = 0;
  el.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) goTo(dx < 0 ? current + 1 : current - 1);
  }, { passive: true });
}

// ============================================================
// Lightbox for reference gallery
// ============================================================
function openLightbox(src) {
  const overlay = document.getElementById('lightboxOverlay');
  const img = document.getElementById('lightboxImg');
  if (!overlay || !img) return;
  img.src = src;
  overlay.classList.add('open');
}

function closeLightbox() {
  const overlay = document.getElementById('lightboxOverlay');
  if (overlay) overlay.classList.remove('open');
}

// ============================================================
// Handle browser back/forward
// ============================================================
window.addEventListener('popstate', () => {
  if (window.app) window.app.route();
});

// ============================================================
// Boot
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  window.app = new PublicApp();
  window.app.init();
  window.openLightbox = openLightbox;
  window.closeLightbox = closeLightbox;

  // Lightbox close
  document.getElementById('lightboxOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'lightboxOverlay') closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });
});
