import { AuthManager } from './auth.js';
import { RefCategoriesManager } from '../admin/ref-categories.js';
import { ReferencesManager } from '../admin/references.js';
import { MagazineManager } from '../admin/magazine.js';
import { InquiriesManager } from '../admin/inquiries.js';
import { PagesManager } from '../admin/pages.js';
import { GalleryManager } from '../admin/gallery.js';
import { SettingsManager } from '../admin/settings.js';

class AdminController {
  constructor() {
    this.auth = new AuthManager();
    this.refCategories = new RefCategoriesManager(this.auth);
    this.references = new ReferencesManager(this.auth);
    this.magazine = new MagazineManager(this.auth);
    this.inquiries = new InquiriesManager(this.auth);
    this.pages = new PagesManager(this.auth);
    this.gallery = new GalleryManager(this.auth);
    this.settings = new SettingsManager(this.auth);

    this.currentSection = 'refCategories';
    this.init();
  }

  async init() {
    const isAuthenticated = await this.auth.checkAuth();
    if (!isAuthenticated) return;

    this.setupNavigation();

    document.querySelector('.logout-btn').addEventListener('click', () => {
      this.auth.logout();
    });

    document.getElementById('addNewBtn').addEventListener('click', () => {
      this.handleAddNew();
    });

    // Default section
    this.loadSection('refCategories');
  }

  setupNavigation() {
    document.querySelectorAll('[data-section]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.loadSection(link.dataset.section);
      });
    });
  }

  async loadSection(section) {
    // Update active nav link
    document.querySelectorAll('[data-section]').forEach(link => {
      link.classList.toggle('active', link.dataset.section === section);
    });

    // Hide all sections
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));

    // Show selected section
    const sectionEl = document.getElementById(`${section}Section`);
    if (sectionEl) sectionEl.classList.add('active');

    this.currentSection = section;

    // Update title
    const titles = {
      refCategories: 'Kategorie referencí',
      references:    'Reference',
      magazine:      'Magazín',
      inquiries:     'Poptávky',
      pages:         'Obsah stránek',
      gallery:       'Galerie',
      settings:      'Nastavení'
    };
    document.getElementById('sectionTitle').textContent = titles[section] || section;

    // Show/hide Add New button
    const addBtn = document.getElementById('addNewBtn');
    addBtn.style.display = (section === 'inquiries' || section === 'settings') ? 'none' : 'inline-flex';
    addBtn.innerHTML = section === 'gallery' ? '+ Přidat fotku' : '<span>+</span> Přidat';

    // Load data
    switch (section) {
      case 'refCategories':
        await this.refCategories.init();
        break;
      case 'references':
        await this.references.init();
        break;
      case 'magazine':
        await this.magazine.init();
        break;
      case 'inquiries':
        await this.inquiries.init();
        break;
      case 'pages':
        await this.pages.init();
        break;
      case 'gallery':
        await this.gallery.init();
        break;
      case 'settings':
        await this.settings.init();
        break;
    }
  }

  handleAddNew() {
    switch (this.currentSection) {
      case 'refCategories':
        this.refCategories.showModal();
        break;
      case 'references':
        this.references.showModal();
        break;
      case 'magazine':
        this.magazine.showModal();
        break;
      case 'gallery':
        this.gallery.showModal();
        break;
    }
  }

  showNotification(message, type = 'success') {
    const el = document.getElementById('notification');
    if (!el) return;
    el.textContent = message;
    el.className = `${type} show`;
    setTimeout(() => { el.classList.remove('show'); }, 3500);
  }
}

// Global admin instance (accessed by manager onclick handlers)
window.admin = new AdminController();
