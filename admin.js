import { auth, db, firebaseReady } from '../js/firebase.js';
import { normalizeSettings } from '../js/site-settings.js';

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updatePassword,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  ref,
  onValue,
  set,
  remove,
  get,
  push,
  update
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';


/* =========================================================
   BASIC HELPERS
========================================================= */

const $ = (selector) => document.querySelector(selector);

const state = {
  categories: [],
  products: [],
  materials: [],
  contact: {},
  siteSettings: {},
  loaded: {},
  view: 'overview',
  editing: null,
  pendingDelete: null
};

let databaseUnsubscribers = [];
let pendingLoginNotice = '';


/* =========================================================
   DOM
========================================================= */

const login = $('#login-shell');
const dashboard = $('#dashboard');
const editor = $('#editor-dialog');
const confirmDialog = $('#confirm-dialog');

function authErrorMessage(error, action = 'login') {
  const code = error?.code || '';
  if (code === 'auth/invalid-email') return 'Enter a valid email address.';
  if (code === 'auth/user-not-found') return action === 'reset'
    ? 'If this email belongs to an admin account, a reset link will be sent.'
    : 'Email or password is incorrect.';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/invalid-login-credentials'].includes(code)) return 'Email or password is incorrect.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait a while and try again.';
  if (code === 'auth/network-request-failed' || error instanceof TypeError) return 'Unable to connect. Please check your internet connection and try again.';
  if (code === 'auth/requires-recent-login') return 'Please sign in again before changing your password.';
  if (code === 'auth/weak-password') return 'Choose a stronger password with at least 6 characters.';
  if (action === 'password' && ['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(code)) return 'The current password is incorrect.';
  if (action === 'password') return 'Could not update the password. Please check your current password and try again.';
  return action === 'reset' ? 'Could not send the reset email. Please try again.' : 'Unable to sign in. Please try again.';
}

function showLoginMessage(message) {
  const error = $('#login-error');
  if (error) error.textContent = message;
}


/* =========================================================
   FALLBACK IMAGE
   This is ONLY used when an old database item has no image.
   New products should always use uploaded images.
========================================================= */

const fallbackImage =
  'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=900&q=80';


/* =========================================================
   SECURITY / HTML ESCAPING
========================================================= */

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}


/* =========================================================
   TOAST
========================================================= */

function toast(message, type = 'success') {
  const region = $('#toast-region');

  if (!region) {
    alert(message);
    return;
  }

  const node = document.createElement('div');

  node.className =
    type === 'error'
      ? 'toast error'
      : 'toast';

  node.textContent = message;

  region.appendChild(node);

  setTimeout(() => {
    node.remove();
  }, 3600);
}


/* =========================================================
   LOADING STATE
========================================================= */

function setBusy(busy, message = 'Saving changes…') {
  const loading = $('#loading');

  if (loading) {
    loading.hidden = !busy;

    if (loading.lastChild) {
      loading.lastChild.textContent = ` ${message}`;
    }
  }

  document
    .querySelectorAll('.primary, .danger')
    .forEach((button) => {
      button.disabled = busy;
    });
}


/* =========================================================
   IMAGE HELPERS
========================================================= */

function imageOf(item = {}) {
  const url =
    item.imageUrl ||
    item.image ||
    item.photo ||
    '';

  if (!url) {
    return fallbackImage;
  }

  /*
    PHP normally returns:

    uploads/products/xxxx.jpg
    uploads/materials/xxxx.jpg

    Because admin is inside /admin,
    we need ../uploads/...
  */

  if (url.startsWith('uploads/')) {
    return `../${url}`;
  }

  if (url.startsWith('/uploads/')) {
    return `..${url}`;
  }

  return url;
}

function productImages(item = {}) {
  const list = Array.isArray(item.images) ? item.images : [];
  const urls = list.filter((url) => typeof url === 'string' && url.trim());
  if (!urls.length) {
    const legacy = item.imageUrl || item.image || item.photo;
    if (typeof legacy === 'string' && legacy.trim()) urls.push(legacy.trim());
  }
  return urls.slice(0, 3);
}

function renderProductImageEditor() {
  const host = $('#product-image-editor');
  if (!host || !state.editing) return;
  (state.editing.previewUrls || []).forEach((url) => URL.revokeObjectURL(url));
  state.editing.previewUrls = [];
  const images = state.editing.productImages || [];
  host.innerHTML = `${images.map((image, index) => `
    <div class="product-image-slot" data-image-index="${index}">
      <img src="${escapeHTML(image.file ? (image.previewUrl = URL.createObjectURL(image.file), state.editing.previewUrls.push(image.previewUrl), image.previewUrl) : image.url)}" alt="Product image ${index + 1} preview">
      <div class="image-slot-controls">
        <b>Image ${index + 1}</b>
        <label class="image-replace">Replace<input type="file" accept="image/jpeg,image/png,image/webp" data-replace-image="${index}"></label>
        ${index ? `<button type="button" class="text-button" data-move-image="${index}" data-direction="-1" aria-label="Move image earlier">Move up</button>` : ''}
        ${index < images.length - 1 ? `<button type="button" class="text-button" data-move-image="${index}" data-direction="1" aria-label="Move image later">Move down</button>` : ''}
        <button type="button" class="text-button delete" data-remove-image="${index}">Remove</button>
      </div>
    </div>`).join('')}
    ${images.length < 3 ? `<label class="add-product-image">Add image (${images.length}/3)<input type="file" accept="image/jpeg,image/png,image/webp" data-add-image></label>` : '<p class="image-limit">Maximum 3 images.</p>'}
    <p class="image-limit">First image is the main image shown on product cards.</p>`;
}

document.addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove-image]');
  const move = event.target.closest('[data-move-image]');
  const images = state.editing?.productImages;
  if (!images) return;
  if (remove) {
    images.splice(Number(remove.dataset.removeImage), 1);
    renderProductImageEditor();
  } else if (move) {
    const index = Number(move.dataset.moveImage);
    const target = index + Number(move.dataset.direction);
    if (target >= 0 && target < images.length) {
      [images[index], images[target]] = [images[target], images[index]];
      renderProductImageEditor();
    }
  }
});

document.addEventListener('change', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !state.editing?.productImages) return;
  if (input.matches('[data-add-image]') || input.matches('[data-replace-image]')) {
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast('Choose a JPG, PNG or WebP image no larger than 5 MB.', 'error');
      input.value = '';
      return;
    }
    if (input.matches('[data-add-image]')) {
      if (state.editing.productImages.length >= 3) {
        toast('A product can have at most 3 images.', 'error');
        input.value = '';
        return;
      }
      state.editing.productImages.push({ file });
    } else {
      state.editing.productImages[Number(input.dataset.replaceImage)] = { file };
    }
    renderProductImageEditor();
  }
});


/* =========================================================
   NAVIGATION
========================================================= */

function visible(view) {
  state.view = view;

  document
    .querySelectorAll('.view')
    .forEach((node) => {
      node.classList.toggle(
        'active',
        node.id === `view-${view}`
      );
    });

  document
    .querySelectorAll('.nav-link')
    .forEach((node) => {
      node.classList.toggle(
        'active',
        node.dataset.view === view
      );
    });

  const names = {
    overview: 'Overview',
    categories: 'Categories',
    products: 'Products',
    materials: 'Materials',
    contact: 'Contact Settings',
    company: 'Company Settings',
    appearance: 'Appearance',
    seo: 'SEO Settings',
    homepage: 'Homepage Settings',
    account: 'Admin Account'
  };

  if ($('#page-title')) {
    $('#page-title').textContent =
      names[view] || 'Dashboard';
  }

  if ($('#page-overline')) {
    $('#page-overline').textContent =
      view === 'overview'
        ? 'SHOWROOM CONTROL'
        : `MANAGE ${(names[view] || '').toUpperCase()}`;
  }

  if ($('#quick-add')) {
    $('#quick-add').hidden = view !== 'products';
  }

  render();
}


/* =========================================================
   SORTING
========================================================= */

function sortByOrder(items) {
  return [...items].sort(
    (a, b) =>
      Number(a.displayOrder || 0) -
        Number(b.displayOrder || 0) ||
      String(a.name || '').localeCompare(
        String(b.name || '')
      )
  );
}


/* =========================================================
   MAIN RENDER
========================================================= */

function render() {
  renderOverview();

  if (state.view === 'categories') {
    renderCategories();
  }

  if (state.view === 'products') {
    renderProducts();
  }

  if (state.view === 'materials') {
    renderMaterials();
  }

  if (state.view === 'contact') {
    renderContact();
  }
  if (['company', 'appearance', 'seo', 'homepage', 'account'].includes(state.view)) renderSettings();
}


/* =========================================================
   OVERVIEW
========================================================= */

function renderOverview() {
  if ($('#total-categories')) {
    $('#total-categories').textContent =
      state.categories.length;
  }

  if ($('#total-products')) {
    $('#total-products').textContent =
      state.products.length;
  }

  if ($('#total-featured')) {
    $('#total-featured').textContent =
      state.products.filter(
        (product) =>
          product.featured === true ||
          product.featured === 'true'
      ).length;
  }

  if ($('#total-materials')) {
    $('#total-materials').textContent =
      state.materials.length;
  }

  if ($('#total-hidden-products')) {
    $('#total-hidden-products').textContent =
      state.products.filter(
        (product) => product.hidden === true
      ).length;
  }
}


/* =========================================================
   CATEGORIES
========================================================= */

function renderCategories() {
  const container = $('#category-list');

  if (!container) return;

  const categories = sortByOrder(state.categories);

  if (!categories.length) {
    container.innerHTML =
      '<p class="empty">No categories created yet.</p>';
    return;
  }

  container.innerHTML = categories
    .map((category) => `
      <article class="list-row">

        <span class="list-index">
          ${escapeHTML(category.displayOrder || 0)}
        </span>

        <div class="list-main">
          <b>${escapeHTML(category.name)}</b>
          <span>
            Display order
            ${escapeHTML(category.displayOrder || 0)}
          </span>
        </div>

        <span class="status ${category.hidden ? 'hidden' : ''}">
          ${category.hidden ? 'HIDDEN' : 'VISIBLE'}
        </span>

        <div class="row-actions">

          <button
            class="text-button"
            data-edit-category="${escapeHTML(category.id)}">
            Edit
          </button>

          <button
            class="text-button delete"
            data-delete-category="${escapeHTML(category.id)}">
            Delete
          </button>

        </div>

      </article>
    `)
    .join('');
}


/* =========================================================
   PRODUCTS
========================================================= */

function renderProducts() {
  const grid = $('#product-grid');

  if (!grid) return;

  const search =
    ($('#product-search')?.value || '')
      .trim()
      .toLowerCase();

  const category =
    $('#product-category-filter')?.value || '';

  const sort =
    $('#product-sort')?.value || 'order';


  /* CATEGORY FILTER */

  const select = $('#product-category-filter');

  if (select) {
    const previous = select.value;

    select.innerHTML =
      '<option value="">All categories</option>' +
      sortByOrder(state.categories)
        .map(
          (categoryItem) => `
            <option value="${escapeHTML(categoryItem.name)}">
              ${escapeHTML(categoryItem.name)}
            </option>
          `
        )
        .join('');

    select.value = previous;
  }


  /* SEARCH */

  let list = state.products.filter((product) => {

    const searchable = `
      ${product.name || ''}
      ${product.shortDescription || ''}
      ${product.description || ''}
      ${product.category || ''}
    `.toLowerCase();

    return (
      (!category || product.category === category) &&
      searchable.includes(search)
    );
  });


  /* SORT */

  if (sort === 'name') {
    list.sort((a, b) =>
      String(a.name || '').localeCompare(
        String(b.name || '')
      )
    );
  }

  else if (sort === 'price') {
    list.sort((a, b) =>
      Number(
        String(a.price || '')
          .replace(/[^0-9.]/g, '')
      ) -
      Number(
        String(b.price || '')
          .replace(/[^0-9.]/g, '')
      )
    );
  }

  else {
    list.sort(
      (a, b) =>
        Number(a.displayOrder || 0) -
          Number(b.displayOrder || 0) ||
        Number(b.createdAt || 0) -
          Number(a.createdAt || 0)
    );
  }


  /* EMPTY */

  if ($('#products-empty')) {
    $('#products-empty').hidden =
      list.length > 0;
  }


  /* RENDER */

  grid.innerHTML = list
    .map((product) => `
      <article class="admin-product">

        <img
          src="${escapeHTML(imageOf(product))}"
          alt="${escapeHTML(
            product.name || 'Furniture product'
          )}"
          loading="lazy"
        >

        <span class="badge">
          ${
            product.featured === true
              ? 'FEATURED'
              : 'PRODUCT'
          }
        </span>

        <div class="product-content">

          <p>
            ${escapeHTML(
              product.category || 'Uncategorized'
            )}
          </p>

          <h3>
            ${escapeHTML(
              product.name || 'Unnamed product'
            )}
          </h3>

          <b>
            ${escapeHTML(
              product.price || 'Price on request'
            )}
          </b>

          <p
            class="availability ${
              product.availability === 'Out of stock'
                ? 'out'
                : ''
            }"
          >
            ${escapeHTML(
              product.availability || 'Available'
            )}
          </p>

        </div>

        <div class="product-actions">

          <button
            class="text-button"
            data-edit-product="${escapeHTML(product.id)}">
            Edit
          </button>

          <button
            class="text-button delete"
            data-delete-product="${escapeHTML(product.id)}">
            Delete
          </button>

        </div>

      </article>
    `)
    .join('');
}


/* =========================================================
   MATERIALS
========================================================= */

function renderMaterials() {
  const container = $('#material-list');

  if (!container) return;

  const materials = sortByOrder(state.materials);

  if (!materials.length) {
    container.innerHTML =
      '<p class="empty">No materials created yet.</p>';
    return;
  }

  container.innerHTML = materials
    .map((material) => `
      <article class="material-admin">

        <img
          src="${escapeHTML(imageOf(material))}"
          alt="${escapeHTML(
            material.name || 'Material'
          )}"
          loading="lazy"
        >

        <h3>
          ${escapeHTML(
            material.name || 'Material'
          )}
        </h3>

        <p>
          ${escapeHTML(
            material.description || ''
          )}
        </p>

        <div class="row-actions">

          <button
            class="text-button"
            data-edit-material="${escapeHTML(material.id)}">
            Edit
          </button>

          <button
            class="text-button delete"
            data-delete-material="${escapeHTML(material.id)}">
            Delete
          </button>

        </div>

      </article>
    `)
    .join('');
}


/* =========================================================
   CONTACT
========================================================= */

function renderContact() {
  const values = normalizeAdminSettings().contact;
  if ($('#contact-phone-input')) {
    $('#contact-phone-input').value = values.phone || '';
  }

  if ($('#contact-whatsapp-input')) {
    $('#contact-whatsapp-input').value =
      values.whatsapp || '';
  }

  if ($('#contact-address-input')) {
    $('#contact-address-input').value =
      values.address || '';
  }

  if ($('#contact-map-input')) {
    $('#contact-map-input').value =
      values.mapEmbedUrl || '';
  }
  const fields = {
    'contact-map-link-input': values.mapLinkUrl,
    'contact-email-input': values.email,
    'contact-instagram-input': values.socials.instagram,
    'contact-facebook-input': values.socials.facebook,
    'contact-youtube-input': values.socials.youtube,
    'contact-channel-input': values.socials.whatsappChannel,
    'contact-hours-input': values.businessHours
  };
  for (const [id, value] of Object.entries(fields)) if ($(`#${id}`)) $(`#${id}`).value = value || '';
}

function normalizeAdminSettings() {
  return normalizeSettings(state.siteSettings, state.contact);
}

function updateExportAvailability() {
  const button = $('#export-data');
  if (button) button.disabled = !['products', 'categories', 'materials', 'contact', 'siteSettings'].every(path => state.loaded[path]);
}

function renderSettings() {
  const settings = normalizeAdminSettings();
  const fields = {
    'company-name-input': settings.company.name,
    'company-short-input': settings.company.shortName,
    'company-tagline-input': settings.company.tagline,
    'company-about-input': settings.company.aboutText,
    'company-footer-input': settings.company.footerText,
    'company-phone-input': settings.contact.phone,
    'company-whatsapp-input': settings.contact.whatsapp,
    'company-email-input': settings.contact.email,
    'company-address-input': settings.contact.address,
    'company-map-input': settings.contact.mapEmbedUrl,
    'company-map-link-input': settings.contact.mapLinkUrl,
    'company-instagram-input': settings.contact.socials.instagram,
    'company-facebook-input': settings.contact.socials.facebook,
    'company-youtube-input': settings.contact.socials.youtube,
    'company-channel-input': settings.contact.socials.whatsappChannel,
    'company-hours-input': settings.contact.businessHours,
    'appearance-primary': settings.appearance.primaryColor,
    'appearance-secondary': settings.appearance.secondaryColor,
    'seo-title-input': settings.seo.title,
    'seo-description-input': settings.seo.description,
    'seo-keywords-input': settings.seo.keywords,
    'seo-canonical-input': settings.seo.canonicalUrl,
    'home-order': settings.homepage.sectionOrder.join('\n')
  };
  for (const [id, value] of Object.entries(fields)) if ($(`#${id}`)) $(`#${id}`).value = value ?? '';
  const checks = {
    'home-hero': settings.homepage.heroVisible,
    'home-featured': settings.homepage.featuredProductsVisible,
    'home-about': settings.homepage.aboutVisible,
    'home-materials': settings.homepage.materialsVisible,
    'home-contact': settings.homepage.contactVisible
  };
  for (const [id, value] of Object.entries(checks)) if ($(`#${id}`)) $(`#${id}`).checked = value !== false;
  const previews = {
    'company-logo-preview': settings.company.logoUrl,
    'company-favicon-preview': settings.company.faviconUrl,
    'appearance-hero-preview': settings.appearance.heroImageUrl,
    'appearance-about-preview': settings.appearance.aboutImageUrl,
    'seo-image-preview': settings.seo.openGraphImageUrl
  };
  for (const [id, src] of Object.entries(previews)) {
    const node = $(`#${id}`); if (!node) continue;
    node.hidden = !src; if (src) node.src = imageOf({ imageUrl: src });
  }
  if ($('#account-email')) $('#account-email').textContent = auth.currentUser?.email || 'Unavailable';
}


/* =========================================================
   CATEGORY SELECT OPTIONS
========================================================= */

function selectOptions() {
  return sortByOrder(state.categories)
    .filter((category) => !category.hidden)
    .map(
      (category) => `
        <option value="${escapeHTML(category.name)}">
          ${escapeHTML(category.name)}
        </option>
      `
    )
    .join('');
}


/* =========================================================
   FORM FIELD HELPER
========================================================= */

function inputLabel(label, id, attributes = '') {
  return `
    <label>
      ${label}
      <input
        id="${id}"
        ${attributes}
      >
    </label>
  `;
}


/* =========================================================
   OPEN EDITOR
========================================================= */

function openEditor(type, item = null) {

  if (!editor) return;

  state.editing = {
    type,
    item
  };

  const edit = Boolean(item);

  if ($('#form-kicker')) {
    $('#form-kicker').textContent =
      edit ? 'EDIT ENTRY' : 'NEW ENTRY';
  }

  if ($('#form-title')) {
    const label =
      type === 'category'
        ? 'category'
        : type === 'product'
          ? 'product'
          : 'material';

    $('#form-title').textContent =
      `${edit ? 'Edit' : 'Add'} ${label}`;
  }


  let fields = '';


  /* CATEGORY */

  if (type === 'category') {

    fields = `
      <div class="form-grid">

        ${inputLabel(
          'Category Name',
          'field-name',
          `required maxlength="60"
           value="${escapeHTML(item?.name || '')}"`
        )}

        ${inputLabel(
          'Display Order',
          'field-order',
          `type="number"
           min="0"
           value="${escapeHTML(item?.displayOrder || 0)}"`
        )}

        <label class="check full">

          <input
            id="field-hidden"
            type="checkbox"
            ${item?.hidden ? 'checked' : ''}
          >

          Hide this category from customer filters

        </label>

      </div>
    `;
  }


  /* PRODUCT */

  if (type === 'product') {

    fields = `
      <div class="form-grid">

        ${inputLabel(
          'Product Name',
          'field-name',
          `required
           maxlength="100"
           value="${escapeHTML(item?.name || '')}"`
        )}

        <label>
          Category

          <select id="field-category" required>

            <option value="">
              Select category
            </option>

            ${selectOptions()}

          </select>

        </label>


        ${inputLabel(
          'Price',
          'field-price',
          `required
           maxlength="40"
           value="${escapeHTML(item?.price || '')}"
           placeholder="₹0"`
        )}


        ${inputLabel(
          'Display Order',
          'field-order',
          `type="number"
           min="0"
           value="${escapeHTML(item?.displayOrder || 0)}"`
        )}


        <label class="full">

          Short Description

          <textarea
            id="field-short"
            required
            maxlength="220"
          >${escapeHTML(
            item?.shortDescription ||
            item?.description ||
            ''
          )}</textarea>

        </label>


        <label class="full">

          Long Description

          <textarea
            id="field-long"
            maxlength="1500"
          >${escapeHTML(
            item?.longDescription || ''
          )}</textarea>

        </label>


        <label>

          Availability

          <select id="field-availability">

            <option value="Available">
              Available
            </option>

            <option value="Out of stock">
              Out of stock
            </option>

            <option value="Made to order">
              Made to order
            </option>

          </select>

        </label>


        <div class="full product-image-editor-wrap">
          <b>Product Images</b>
          <div id="product-image-editor" class="product-image-editor"></div>
        </div>


        <label class="check">

          <input
            id="field-featured"
            type="checkbox"
            ${
              item?.featured
                ? 'checked'
                : ''
            }
          >

          Feature on home page

        </label>


        <label class="check">

          <input
            id="field-book"
            type="checkbox"
            ${
              item?.bookEnabled !== false
                ? 'checked'
                : ''
            }
          >

          Enable Book Now

        </label>


        <label class="check">

          <input
            id="field-hidden"
            type="checkbox"
            ${
              item?.hidden
                ? 'checked'
                : ''
            }
          >

          Hide this product from customers

        </label>

      </div>
    `;
  }


  /* MATERIAL */

  if (type === 'material') {

    fields = `
      <div class="form-grid">

        ${inputLabel(
          'Material Name',
          'field-name',
          `required
           maxlength="80"
           value="${escapeHTML(item?.name || '')}"`
        )}


        ${inputLabel(
          'Display Order',
          'field-order',
          `type="number"
           min="0"
           value="${escapeHTML(item?.displayOrder || 0)}"`
        )}


        <label class="full">

          Description

          <textarea
            id="field-description"
            required
            maxlength="500"
          >${escapeHTML(
            item?.description || ''
          )}</textarea>

        </label>


        <label class="full">

          Material Image

          <input
            id="field-image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            ${edit ? '' : 'required'}
          >

        </label>


        <div class="preview full">

          <img
            id="image-preview"
            src="${escapeHTML(
              imageOf(item || {})
            )}"
            alt="Selected material preview"
          >

          <span>
            Choose an image to preview it before upload.
          </span>

        </div>


        <label class="check full">

          <input
            id="field-hidden"
            type="checkbox"
            ${
              item?.hidden
                ? 'checked'
                : ''
            }
          >

          Hide this material from customers

        </label>

      </div>
    `;
  }


  $('#form-fields').innerHTML = fields;

  if (type === 'product') {
    state.editing.productImages = productImages(item || {}).map((url) => ({ url }));
    renderProductImageEditor();
  }


  /* PRODUCT DEFAULTS */

  if (type === 'product') {

    if ($('#field-category')) {
      $('#field-category').value =
        item?.category || '';
    }

    if ($('#field-availability')) {
      $('#field-availability').value =
        item?.availability || 'Available';
    }
  }


  /* IMAGE PREVIEW */

const imageInput = $('#field-image');

  if (imageInput) imageInput.addEventListener('change', previewImage);


  editor.showModal();
}


/* =========================================================
   IMAGE PREVIEW
========================================================= */

function previewImage(event) {

  const file =
    event.target.files?.[0];

  const preview =
    $('#image-preview');

  if (!file || !preview) return;

  if (!file.type.startsWith('image/')) {
    toast(
      'Please select an image file.',
      'error'
    );

    event.target.value = '';
    return;
  }

  preview.src =
    URL.createObjectURL(file);
}


/* =========================================================
   UPLOAD IMAGE THROUGH PHP
========================================================= */

async function uploadImage(file, kind, imageSlot = 0) {

  if (!file) {
    return null;
  }


  if (!file.type.startsWith('image/')) {
    throw new Error(
      'Please select a valid image file.'
    );
  }


  if (file.size > 5 * 1024 * 1024) {
    throw new Error(
      'Images must be 5 MB or smaller.'
    );
  }


  if (!auth.currentUser) {
    throw new Error(
      'Please log in again.'
    );
  }


  const token =
    await auth.currentUser.getIdToken(true);


  const body =
    new FormData();

  body.append(
    'image',
    file
  );

  body.append(
    'kind',
    kind
  );

  if (kind === 'products') body.append('imageSlot', String(imageSlot));

  body.append(
    'idToken',
    token
  );


  const response =
    await fetch(
      '../api/upload-product-image.php',
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${token}`
        },

        body
      }
    );


  const result =
    await response
      .json()
      .catch(() => null);


  if (!response.ok || !result?.ok) {
    throw new Error(
      result?.error ||
      'Image upload failed.'
    );
  }


  return result.imageUrl;
}


/* =========================================================
   DELETE IMAGE THROUGH PHP
========================================================= */

async function deleteImage(imageUrl) {

  if (!imageUrl) {
    return;
  }


  /*
    Only delete images belonging to our
    own uploads directory.
  */

  if (
    !/^(?:\.\.\/)?uploads\/(products|materials|company)\//
      .test(imageUrl)
  ) {
    return;
  }


  if (!auth.currentUser) {
    return;
  }


  try {

    const token =
      await auth.currentUser.getIdToken(true);


    await fetch(
      '../api/delete-product-image.php',
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${token}`,

          'Content-Type':
            'application/json'
        },

        body: JSON.stringify({
          imageUrl,
          idToken: token
        })
      }
    );

  } catch {
    /*
      Database deletion should not fail
      just because old image cleanup failed.
    */
  }
}

function validWebUrl(value) {
  if (!value) return true;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

async function saveSettingsSection(event, section, fields, assets = []) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const previous = normalizeAdminSettings()[section] || {};
  const patch = {};
  for (const [key, id] of Object.entries(fields)) {
    const node = $(`#${id}`);
    if (!node) continue;
    let value = node.type === 'checkbox' ? node.checked : node.value.trim();
    if (key === 'sectionOrder') {
      const allowed = ['hero', 'featuredProducts', 'cta', 'about', 'materials', 'contact'];
      value = value.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean);
      if (value.some(item => !allowed.includes(item)) || new Set(value).size !== value.length) { toast('Use each allowed homepage section name at most once.', 'error'); return; }
    }
    if (key.toLowerCase().includes('color') && typeof value === 'string' && !/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)) { toast('Choose a valid hexadecimal color.', 'error'); return; }
    if (key === 'canonicalUrl' && !validWebUrl(value)) { toast('Enter a valid HTTP or HTTPS canonical URL.', 'error'); return; }
    if (node.type === 'checkbox' || value !== '') patch[key] = value;
  }
  const uploaded = [];
  const obsolete = [];
  let saved = false;
  setBusy(true, `Saving ${section} settings…`);
  try {
    for (const asset of assets) {
      const oldUrl = previous[asset.key] || '';
      const file = $(`#${asset.file}`)?.files?.[0];
      const remove = $(`#${asset.remove}`)?.checked;
      if (file) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP image no larger than 5 MB.');
        const url = await uploadImage(file, 'company');
        uploaded.push(url); patch[asset.key] = url;
        if (oldUrl && oldUrl !== url) obsolete.push(oldUrl);
      } else if (remove) {
        patch[asset.key] = '';
        if (oldUrl) obsolete.push(oldUrl);
      }
    }
    if (!Object.keys(patch).length) { toast('There are no settings to save.', 'error'); return; }
    await update(ref(db, `siteSettings/${section}`), patch);
    saved = true;
    for (const url of obsolete) await deleteImage(url);
    for (const asset of assets) {
      const file = $(`#${asset.file}`); if (file) file.value = '';
      const remove = $(`#${asset.remove}`); if (remove) remove.checked = false;
    }
    toast(`${section.charAt(0).toUpperCase() + section.slice(1)} settings saved.`);
  } catch (error) {
    if (!saved) for (const url of uploaded) await deleteImage(url);
    console.error('SETTINGS SAVE ERROR:', error);
    toast(error.message || `Could not save ${section} settings.`, 'error');
  } finally { setBusy(false); }
}

function readContactFields(prefix) {
  const getValue = name => $(`#${prefix}${name}`)?.value.trim() || '';
  return {
    phone: getValue('phone-input'), whatsapp: getValue('whatsapp-input'),
    email: getValue('email-input'), address: getValue('address-input'),
    mapEmbedUrl: getValue('map-input'), mapLinkUrl: getValue('map-link-input'),
    instagram: getValue('instagram-input'), facebook: getValue('facebook-input'),
    youtube: getValue('youtube-input'), whatsappChannel: getValue('channel-input'),
    businessHours: getValue('hours-input')
  };
}

async function saveContactSettings(event, prefix) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const values = readContactFields(prefix);
  if (!/^[+\d][\d\s()-]{5,24}$/.test(values.phone)) return toast('Enter a valid phone number.', 'error');
  if (!/^[\d\s()+-]{6,24}$/.test(values.whatsapp)) return toast('Enter a valid WhatsApp number.', 'error');
  if (!values.address) return toast('Enter your store address.', 'error');
  if (values.mapEmbedUrl && !/^https:\/\/www\.google\.com\/maps\/embed\?/i.test(values.mapEmbedUrl)) return toast('Enter a valid Google Maps embed URL.', 'error');
  const urls = [values.mapLinkUrl, values.instagram, values.facebook, values.youtube, values.whatsappChannel];
  if (urls.some(value => !validWebUrl(value))) return toast('Enter valid HTTP or HTTPS URLs.', 'error');
  const current = state.contact || {};
  const patch = { phone: values.phone, whatsapp: values.whatsapp, address: values.address, updatedAt: Date.now() };
  for (const key of ['email', 'mapEmbedUrl', 'mapLinkUrl', 'businessHours']) if (values[key]) patch[key] = values[key];
  const socials = { ...(current.socials || {}) };
  for (const key of ['instagram', 'facebook', 'youtube', 'whatsappChannel']) if (values[key]) socials[key] = values[key];
  if (Object.keys(socials).length) patch.socials = socials;
  setBusy(true, 'Saving contact settings…');
  try {
    await update(ref(db, 'contact'), patch);
    toast('Contact settings saved successfully.');
  } catch (error) {
    console.error('CONTACT SAVE ERROR:', error);
    toast(error.message || 'Could not save contact settings.', 'error');
  } finally { setBusy(false); }
}


/* =========================================================
   SAVE EDITOR
========================================================= */

async function saveEditor(event) {

  event.preventDefault();

  if (!state.editing) {
    return;
  }


  const {
    type,
    item
  } = state.editing;


  const form =
    event.currentTarget;

  const saveButton =
    $('#form-save');


  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }


  const name =
    $('#field-name')?.value.trim();


  const price =
    $('#field-price')?.value.trim();


  if (!name) {
    toast(
      'Enter a valid name.',
      'error'
    );
    return;
  }


  if (
    type === 'product' &&
    !price
  ) {
    toast(
      'Enter a valid price.',
      'error'
    );
    return;
  }


  saveButton.disabled = true;

  const newlyUploadedImages = [];
  let firebaseItemSaved = false;

  setBusy(
    true,
    'Saving changes…'
  );


  try {


    const path =
      type === 'category'
        ? 'categories'
        : type === 'product'
          ? 'products'
          : 'materials';


    const id =
      item?.id ||
      push(ref(db, path)).key;


    let data;


    /* =========================
       CATEGORY
    ========================= */

    if (type === 'category') {

      data = {

        id,

        name,

        displayOrder:
          Number(
            $('#field-order')?.value || 0
          ),

        hidden:
          $('#field-hidden')?.checked ||
          false,

        updatedAt:
          Date.now()
      };
    }


    /* =========================
       PRODUCT
    ========================= */

    if (type === 'product') {
      const images = state.editing.productImages || [];
      if (images.length < 1 || images.length > 3) throw new Error('A product must have between 1 and 3 images.');
      const finalImages = [];
      for (let i = 0; i < images.length; i += 1) {
        const entry = images[i];
        if (entry.file) {
          const uploaded = await uploadImage(entry.file, 'products', i);
          newlyUploadedImages.push(uploaded);
          finalImages.push(uploaded);
        } else if (entry.url) finalImages.push(entry.url);
      }
      if (!finalImages.length || finalImages.length > 3) throw new Error('A product must have between 1 and 3 images.');


      data = {

        ...(item || {}),

        id,

        name,

        category:
          $('#field-category')?.value || '',

        price,

        shortDescription:
          $('#field-short')?.value.trim() || '',

        description:
          $('#field-short')?.value.trim() || '',

        longDescription:
          $('#field-long')?.value.trim() || '',

        displayOrder:
          Number(
            $('#field-order')?.value || 0
          ),

        availability:
          $('#field-availability')?.value ||
          'Available',

        featured:
          $('#field-featured')?.checked ||
          false,

        bookEnabled:
          $('#field-book')?.checked !== false,

        hidden:
          $('#field-hidden')?.checked ||
          false,

        createdAt:
          item?.createdAt ||
          Date.now(),

        updatedAt:
          Date.now()
      };


      data.images = finalImages;
      data.imageUrl = finalImages[0];
      delete data.image;
      delete data.photo;
    }


    /* =========================
       MATERIAL
    ========================= */

    if (type === 'material') {

      const file =
        $('#field-image')?.files?.[0];


      let uploadedImage = null;


      if (file) {

        uploadedImage =
          await uploadImage(
            file,
            'materials'
          );
        newlyUploadedImages.push(uploadedImage);
      }


      data = {

        ...(item || {}),

        id,

        name,

        description:
          $('#field-description')
            ?.value.trim() || '',

        displayOrder:
          Number(
            $('#field-order')?.value || 0
          ),

        hidden:
          $('#field-hidden')?.checked ||
          false,

        updatedAt:
          Date.now()
      };


      if (uploadedImage) {

        data.imageUrl =
          uploadedImage;


        delete data.image;

      }
    }


    /* =========================
       SAVE FIREBASE
    ========================= */

    await set(
      ref(
        db,
        `${path}/${id}`
      ),
      data
    );
    firebaseItemSaved = true;

    if (type === 'product') {
      const retained = new Set(data.images || []);
      const oldImages = productImages(item || {});
      for (const oldImage of oldImages) if (!retained.has(oldImage)) await deleteImage(oldImage);
    }

    if (type === 'material' && $('#field-image')?.files?.length) {
      const oldImage = item?.imageUrl || item?.image || item?.photo;
      if (oldImage && oldImage !== data.imageUrl) await deleteImage(oldImage);
    }


    editor.close();


    toast(
      `${
        type.charAt(0).toUpperCase() +
        type.slice(1)
      } saved successfully.`
    );

  } catch (error) {

    if (!firebaseItemSaved) {
      for (const uploaded of newlyUploadedImages) await deleteImage(uploaded);
    }

    console.error(
      'SAVE ERROR:',
      error
    );


    toast(
      error.message ||
      'Could not save changes.',
      'error'
    );

  } finally {

    saveButton.disabled = false;

    setBusy(false);
  }
}


/* =========================================================
   DELETE REQUEST
========================================================= */

function requestDelete(type, id) {

  const list =
    type === 'category'
      ? state.categories
      : type === 'product'
        ? state.products
        : state.materials;


  const item =
    list.find(
      (entry) =>
        String(entry.id) === String(id)
    );


  if (!item) {
    toast(
      'Item not found.',
      'error'
    );
    return;
  }


  /* Category cannot be deleted
     while products use it. */

  if (
    type === 'category' &&
    state.products.some(
      (product) =>
        product.category === item.name
    )
  ) {

    toast(
      'This category still contains products and cannot be deleted.',
      'error'
    );

    return;
  }


  state.pendingDelete = {
    type,
    id
  };


  if ($('#confirm-title')) {
    $('#confirm-title').textContent =
      `Delete ${type}?`;
  }


  if ($('#confirm-message')) {
    $('#confirm-message').textContent =
      `This will permanently remove “${
        item.name || 'this item'
      }”.`;
  }


  confirmDialog.showModal();
}


/* =========================================================
   CONFIRM DELETE
========================================================= */

async function confirmDelete() {

  if (!state.pendingDelete) {
    return;
  }


  const {
    type,
    id
  } = state.pendingDelete;


  const path =
    type === 'category'
      ? 'categories'
      : type === 'product'
        ? 'products'
        : 'materials';


  const list =
    type === 'category'
      ? state.categories
      : type === 'product'
        ? state.products
        : state.materials;


  const item =
    list.find(
      (entry) =>
        String(entry.id) === String(id)
    );


  setBusy(
    true,
    'Deleting item…'
  );


  try {

    await remove(
      ref(
        db,
        `${path}/${id}`
      )
    );

    if (type !== 'category') {
      const images = type === 'product' ? productImages(item || {}) : [item?.imageUrl || item?.image || item?.photo];
      for (const image of images) await deleteImage(image);
    }


    toast(
      `${
        type.charAt(0).toUpperCase() +
        type.slice(1)
      } deleted.`
    );


    confirmDialog.close();

  } catch (error) {

    console.error(
      'DELETE ERROR:',
      error
    );


    toast(
      error.message ||
      'Could not delete item.',
      'error'
    );

  } finally {

    state.pendingDelete = null;

    setBusy(false);
  }
}


/* =========================================================
   FIREBASE LISTENERS
========================================================= */

function clearDatabaseListeners() {

  databaseUnsubscribers.forEach(
    (unsubscribe) => {
      try {
        unsubscribe();
      } catch {}
    }
  );

  databaseUnsubscribers = [];
}

function clearAdminUiState() {
  clearDatabaseListeners();
  state.categories = [];
  state.products = [];
  state.materials = [];
  state.contact = {};
  state.siteSettings = {};
  state.loaded = {};
  state.view = 'overview';
  state.editing = null;
  state.pendingDelete = null;
  if (editor?.open) editor.close();
  if (confirmDialog?.open) confirmDialog.close();
}


function bindDatabase() {

  clearDatabaseListeners();


  databaseUnsubscribers.push(

    onValue(
      ref(db, 'categories'),
      (snapshot) => {

        const value =
          snapshot.val() || {};


        state.categories =
          Object.entries(value)
            .map(([id, data]) => ({
              ...data,
              id: data?.id || id
            }));

        state.loaded.categories = true;
        updateExportAvailability();


        render();
      }
    ),


    onValue(
      ref(db, 'products'),
      (snapshot) => {

        const value =
          snapshot.val() || {};


        state.products =
          Object.entries(value)
            .map(([id, data]) => ({
              ...data,
              id: data?.id || id
            }));

        state.loaded.products = true;
        updateExportAvailability();


        render();
      }
    ),


    onValue(
      ref(db, 'materials'),
      (snapshot) => {

        const value =
          snapshot.val() || {};


        state.materials =
          Object.entries(value)
            .map(([id, data]) => ({
              ...data,
              id: data?.id || id
            }));

        state.loaded.materials = true;
        updateExportAvailability();


        render();
      }
    ),


    onValue(
      ref(db, 'contact'),
      (snapshot) => {

        state.contact =
          snapshot.val() || {};

        state.loaded.contact = true;
        updateExportAvailability();


        render();
      }
    ),

    onValue(
      ref(db, 'siteSettings'),
      (snapshot) => {
        state.siteSettings = snapshot.val() || {};
        state.loaded.siteSettings = true;
        updateExportAvailability();
        render();
      }
    )

  );
}


/* =========================================================
   ADMIN AUTHORIZATION
========================================================= */

async function authorize(user) {

  setBusy(
    true,
    'Verifying access…'
  );


  try {

    const snapshot =
      await get(
        ref(
          db,
          `admins/${user.uid}`
        )
      );


    if (snapshot.val() !== true) {

      clearDatabaseListeners();

      pendingLoginNotice = 'This account is authenticated but is not authorized to access the showroom admin panel.';
      showLoginMessage(pendingLoginNotice);
      await signOut(auth);

      return;
    }


    login.hidden = true;

    dashboard.hidden = false;


    bindDatabase();


  } catch (error) {

    const errorCode = typeof error?.code === 'string' ? error.code : '';
    const errorMessage = typeof error?.message === 'string' ? error.message : 'Unknown database error.';
    const permissionDenied = /PERMISSION_DENIED|permission denied/i.test(`${errorCode} ${errorMessage}`);

    console.error('ADMIN AUTHORIZATION DATABASE READ FAILED:', {
      code: errorCode || 'unknown',
      message: errorMessage
    });


    clearDatabaseListeners();

    pendingLoginNotice = permissionDenied
      ? 'Permission denied reading admins/{uid}. Check the deployed Realtime Database rule for this admin record and confirm its value is Boolean true.'
      : `Unable to verify admin access (${errorCode || 'database error'}): ${errorMessage}`;
    showLoginMessage(pendingLoginNotice);
    await signOut(auth);

  } finally {

    setBusy(false);
  }
}


/* =========================================================
   LOGIN
========================================================= */

$('#login-form')?.addEventListener(
  'submit',
  async (event) => {

    event.preventDefault();


    if (!firebaseReady) {

      $('#login-error').textContent =
        'Firebase configuration is required before signing in.';

      return;
    }


    const button =
      $('#login-button');


    button.disabled = true;


    $('#login-error').textContent =
      '';


    try {

      await signInWithEmailAndPassword(
        auth,
        $('#email').value.trim(),
        $('#password').value
      );
      $('#password').value = '';

    } catch (error) {

      console.error(
        'LOGIN ERROR:',
        error
      );


      showLoginMessage(authErrorMessage(error, 'login'));

    } finally {

      button.disabled = false;
    }
  }
);

$('#forgot-password')?.addEventListener('click', () => {
  $('#login-panel').hidden = true;
  $('#reset-panel').hidden = false;
  $('#reset-form').hidden = false;
  $('#reset-success').hidden = true;
  $('#reset-error').textContent = '';
  $('#reset-email').value = $('#email').value.trim();
  $('#reset-email').focus();
});

$('#back-to-login')?.addEventListener('click', () => {
  $('#reset-panel').hidden = true;
  $('#login-panel').hidden = false;
  $('#reset-error').textContent = '';
  showLoginMessage('');
  $('#email').focus();
});

$('#reset-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const email = $('#reset-email').value.trim();
  const button = $('#reset-button');
  const error = $('#reset-error');
  error.textContent = '';
  if (!firebaseReady) { error.textContent = 'Password reset is unavailable until Firebase is configured.'; return; }
  button.disabled = true;
  try {
    await sendPasswordResetEmail(auth, email);
    form.hidden = true;
    $('#reset-success').hidden = false;
  } catch (authError) {
    error.textContent = authErrorMessage(authError, 'reset');
  } finally { button.disabled = false; }
});


/* =========================================================
   ADMIN NAVIGATION
========================================================= */

$('#admin-nav')?.addEventListener(
  'click',
  (event) => {

    const target =
      event.target.closest(
        '[data-view]'
      );


    if (!target) return;


    visible(
      target.dataset.view
    );
  }
);


/* =========================================================
   QUICK ADD PRODUCT
========================================================= */

$('#quick-add')?.addEventListener(
  'click',
  () => {
    openEditor('product');
  }
);


/* =========================================================
   EDIT / DELETE BUTTONS
========================================================= */

document.addEventListener(
  'click',
  (event) => {

    const open =
      event.target.closest(
        '[data-open]'
      );


    if (open) {

      openEditor(
        open.dataset.open
      );

      return;
    }


    for (
      const type of [
        'category',
        'product',
        'material'
      ]
    ) {

      const editButton =
        event.target.closest(
          `[data-edit-${type}]`
        );


      const deleteButton =
        event.target.closest(
          `[data-delete-${type}]`
        );


      if (editButton) {

        const list =
          type === 'category'
            ? state.categories
            : type === 'product'
              ? state.products
              : state.materials;


        const id =
          editButton.dataset[
            `edit${
              type.charAt(0).toUpperCase() +
              type.slice(1)
            }`
          ];


        const item =
          list.find(
            (entry) =>
              String(entry.id) ===
              String(id)
          );


        if (item) {
          openEditor(
            type,
            item
          );
        }


        return;
      }


      if (deleteButton) {

        const id =
          deleteButton.dataset[
            `delete${
              type.charAt(0).toUpperCase() +
              type.slice(1)
            }`
          ];


        requestDelete(
          type,
          id
        );


        return;
      }
    }
  }
);


/* =========================================================
   EDITOR FORM
========================================================= */

$('#editor-form')?.addEventListener(
  'submit',
  saveEditor
);


/* =========================================================
   CLOSE DIALOG
========================================================= */

document
  .querySelectorAll('[data-close]')
  .forEach((button) => {

    button.addEventListener(
      'click',
      () => editor.close()
    );
  });


/* =========================================================
   DELETE DIALOG
========================================================= */

$('#confirm-cancel')?.addEventListener(
  'click',
  () => {
    state.pendingDelete = null;
    confirmDialog.close();
  }
);


$('#confirm-accept')?.addEventListener(
  'click',
  confirmDelete
);


/* =========================================================
   PRODUCT SEARCH
========================================================= */

$('#product-search')?.addEventListener(
  'input',
  renderProducts
);


$('#product-category-filter')?.addEventListener(
  'change',
  renderProducts
);


$('#product-sort')?.addEventListener(
  'change',
  renderProducts
);


/* =========================================================
   CONTACT FORM
========================================================= */

$('#contact-form')?.addEventListener('submit', event => saveContactSettings(event, 'contact-'));
$('#company-contact-form')?.addEventListener('submit', event => saveContactSettings(event, 'company-'));

$('#company-form')?.addEventListener('submit', event => saveSettingsSection(event, 'company', {
  name: 'company-name-input', shortName: 'company-short-input', tagline: 'company-tagline-input',
  aboutText: 'company-about-input', footerText: 'company-footer-input'
}, [
  { key: 'logoUrl', file: 'company-logo-file', remove: 'company-logo-remove' },
  { key: 'faviconUrl', file: 'company-favicon-file', remove: 'company-favicon-remove' }
]));

$('#appearance-form')?.addEventListener('submit', event => saveSettingsSection(event, 'appearance', {
  primaryColor: 'appearance-primary', secondaryColor: 'appearance-secondary'
}, [
  { key: 'heroImageUrl', file: 'appearance-hero-file', remove: 'appearance-hero-remove' },
  { key: 'aboutImageUrl', file: 'appearance-about-file', remove: 'appearance-about-remove' }
]));

$('#seo-form')?.addEventListener('submit', event => saveSettingsSection(event, 'seo', {
  title: 'seo-title-input', description: 'seo-description-input', keywords: 'seo-keywords-input', canonicalUrl: 'seo-canonical-input'
}, [{ key: 'openGraphImageUrl', file: 'seo-image-file', remove: 'seo-image-remove' }]));

$('#homepage-form')?.addEventListener('submit', event => saveSettingsSection(event, 'homepage', {
  heroVisible: 'home-hero', featuredProductsVisible: 'home-featured', aboutVisible: 'home-about',
  materialsVisible: 'home-materials', contactVisible: 'home-contact', sectionOrder: 'home-order'
}));

document.querySelectorAll('.asset-setting input[type="file"]').forEach(input => input.addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    toast('Choose a JPG, PNG or WebP image no larger than 5 MB.', 'error'); event.target.value = ''; return;
  }
  const preview = event.target.closest('.asset-setting')?.querySelector('img');
  if (preview) { preview.src = URL.createObjectURL(file); preview.hidden = false; }
}));

$('#password-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const user = auth.currentUser;
  const current = $('#account-current-password').value;
  const next = $('#account-new-password').value;
  const confirmation = $('#account-confirm-password').value;
  if (!user?.email) return toast('The signed-in account email is unavailable.', 'error');
  if (next.length < 6) return toast('The new password must be at least 6 characters.', 'error');
  if (next !== confirmation) return toast('The new passwords do not match.', 'error');
  setBusy(true, 'Updating password…');
  try {
    const credential = EmailAuthProvider.credential(user.email, current);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, next);
    event.currentTarget.reset();
    toast('Your password was updated.');
  } catch (error) {
    console.error('PASSWORD UPDATE ERROR:', error);
    toast(authErrorMessage(error, 'password'), 'error');
  } finally { event.currentTarget.reset(); setBusy(false); }
});

$('#password-reset')?.addEventListener('click', async () => {
  const email = auth.currentUser?.email;
  if (!email) return toast('The signed-in account email is unavailable.', 'error');
  setBusy(true, 'Sending password reset email…');
  try { await sendPasswordResetEmail(auth, email); toast(`Password reset email sent to ${email}.`); }
  catch (error) { console.error('PASSWORD RESET ERROR:', error); toast(authErrorMessage(error, 'reset'), 'error'); }
  finally { setBusy(false); }
});

const exportFields = {
  products: ['id','name','category','price','shortDescription','description','longDescription','displayOrder','availability','featured','bookEnabled','hidden','createdAt','updatedAt','imageUrl','images','image','photo'],
  categories: ['id','name','displayOrder','hidden','updatedAt'],
  materials: ['id','name','description','displayOrder','hidden','imageUrl','image','photo','updatedAt']
};
const exportRecords = (items, fields) => items.map(item => Object.fromEntries(fields.filter(key => item[key] !== undefined).map(key => [key, item[key]])));
$('#export-data')?.addEventListener('click', () => {
  const settings = normalizeAdminSettings();
  const data = {
    exportedAt: new Date().toISOString(), company: settings.company, appearance: settings.appearance,
    seo: settings.seo, homepage: settings.homepage,
    contact: Object.fromEntries(['phone','whatsapp','phoneNumber','whatsappNumber','email','address','storeAddress','mapEmbedUrl','googleMap','mapUrl','mapLinkUrl','socials','businessHours','updatedAt'].filter(key => state.contact[key] !== undefined).map(key => [key,state.contact[key]])),
    categories: exportRecords(state.categories, exportFields.categories),
    materials: exportRecords(state.materials, exportFields.materials),
    products: exportRecords(state.products, exportFields.products)
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
  link.download = `${(data.company.name || 'company').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-data.json`;
  link.click(); URL.revokeObjectURL(link.href); toast('Company data export downloaded.');
});

/* =========================================================
   LOGOUT
========================================================= */

$('#logout')?.addEventListener(
  'click',
  async () => {

    try {
      await signOut(auth);
    } catch (error) {
      console.error(
        'LOGOUT ERROR:',
        error
      );
      toast('Could not sign out. Please try again.', 'error');
    }
  }
);


/* =========================================================
   AUTH STATE
========================================================= */

if (!firebaseReady) {

  if ($('#login-error')) {
    $('#login-error').textContent =
      'Firebase configuration is required before signing in.';
  }

} else {

  onAuthStateChanged(
    auth,
    async (user) => {

      if (user) {

        await authorize(user);

      } else {

        clearAdminUiState();

        if (login) {
          login.hidden = false;
        }

        if ($('#login-panel')) $('#login-panel').hidden = false;
        if ($('#reset-panel')) $('#reset-panel').hidden = true;
        if ($('#password')) $('#password').value = '';
        if ($('#login-error')) $('#login-error').textContent = pendingLoginNotice;
        pendingLoginNotice = '';

        if (dashboard) {
          dashboard.hidden = true;
        }
      }
    }
  );
}
