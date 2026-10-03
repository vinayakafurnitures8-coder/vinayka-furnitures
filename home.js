import './shared.js';
import { productCard, materialCard, setupModal } from './ui.js';
import { db, firebaseReady } from './firebase.js';
import { DEFAULT_SETTINGS, normalizeSettings, subscribeSiteSettings, applyPublicSettings } from './site-settings.js';
import {
  ref,
  onValue
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const $ = (s) => document.querySelector(s);

let products = [];
let settings = normalizeSettings();

function renderProducts() {
  const newest = products
    .filter((p) => !p.hidden)
    .sort(
      (a, b) =>
        Number(b.createdAt || b.created_at || b.timestamp || 0) -
        Number(a.createdAt || a.created_at || a.timestamp || 0)
    );

  const featured = newest
    .filter(
      (p) =>
        p.featured === true ||
        p.featured === 'true' ||
        p.isFeatured
    )
    .slice(0, 8);

  const container = $('#featured-products');

  if (!container) return;

  container.innerHTML = (
    featured.length ? featured : newest.slice(0, 8)
  )
    .map((p) => productCard(p, settings.contact.whatsapp, settings.company.name))
    .join('');

  setupModal(products, settings.contact.whatsapp, settings.company.name);
}

function renderMaterials(items = []) {
  const container = $('#materials-grid');

  if (!container) return;

  container.innerHTML = items
    .filter((item) => !item.hidden)
    .map(materialCard)
    .join('');
}

/*
 * IMPORTANT:
 * No demo products are rendered here.
 * Products are loaded from Firebase first.
 */

if (firebaseReady) {
  subscribeSiteSettings(db, (value) => {
    settings = value;
    applyPublicSettings(settings, 'home');
    renderProducts();
  }, () => applyPublicSettings(settings, 'home'));

  onValue(ref(db, 'products'), (snapshot) => {
    const data = snapshot.val() || {};

    products = Object.entries(data).map(([id, p]) => ({
      ...p,
      id: p.id || id
    }));

    renderProducts();
  });

  onValue(ref(db, 'materials'), (snapshot) => {
    const data = snapshot.val() || {};

    renderMaterials(
      Object.values(data)
    );
  });

} else {
  /*
   * Firebase is not ready.
   * Do not display old/demo products.
   */
  renderProducts();
  renderMaterials([]);
  applyPublicSettings(settings, 'home');
}
