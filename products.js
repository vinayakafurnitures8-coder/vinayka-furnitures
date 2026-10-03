import './shared.js';
import { productCard, setupModal } from './ui.js';
import { escapeHTML } from './utils.js';
import { db, firebaseReady } from './firebase.js';
import { normalizeSettings, subscribeSiteSettings, applyPublicSettings } from './site-settings.js';

import {
  ref,
  onValue
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';


const $ = (selector) =>
  document.querySelector(selector);


/*
|--------------------------------------------------------------------------
| STATE
|--------------------------------------------------------------------------
| Everything comes from Firebase.
| There are NO demo products or demo categories.
|--------------------------------------------------------------------------
*/

let products = [];
let categories = [];

let activeCategory = 'All';
let searchQuery = '';

let settings = normalizeSettings();


/*
|--------------------------------------------------------------------------
| GET VISIBLE CATEGORIES
|--------------------------------------------------------------------------
*/

function getVisibleCategories() {

  const productCategories = [
    ...new Set(
      products
        .filter(product => !product.hidden)
        .map(product => product.category)
        .filter(Boolean)
    )
  ];


  /*
  |--------------------------------------------------------------------------
  | If no categories exist in Firebase,
  | don't invent any categories.
  |--------------------------------------------------------------------------
  */

  if (!categories.length) {
    return productCategories;
  }


  /*
  |--------------------------------------------------------------------------
  | Use ONLY Firebase categories that actually
  | have products.
  |--------------------------------------------------------------------------
  */

  return categories
    .filter(category =>
      !category.hidden &&
      productCategories.includes(category.name)
    )
    .sort(
      (a, b) =>
        Number(a.displayOrder || 0) -
        Number(b.displayOrder || 0)
    )
    .map(category => category.name);
}


/*
|--------------------------------------------------------------------------
| FILTER PRODUCTS
|--------------------------------------------------------------------------
*/

function getFilteredProducts() {

  return products.filter(product => {

    if (product.hidden) {
      return false;
    }


    if (
      activeCategory !== 'All' &&
      product.category !== activeCategory
    ) {
      return false;
    }


    const searchableText = `
      ${product.name || ''}
      ${product.description || ''}
      ${product.shortDescription || ''}
      ${product.category || ''}
    `
      .toLowerCase();


    return searchableText.includes(searchQuery);
  });
}


/*
|--------------------------------------------------------------------------
| DRAW PRODUCTS
|--------------------------------------------------------------------------
*/

function draw() {

  const filters =
    $('#filters');

  const categoryRows =
    $('#category-rows');

  const emptyProducts =
    $('#empty-products');


  if (!filters || !categoryRows) {
    return;
  }


  const categoriesToShow =
    getVisibleCategories();


  /*
  |--------------------------------------------------------------------------
  | Reset invalid selected category
  |--------------------------------------------------------------------------
  */

  if (
    activeCategory !== 'All' &&
    !categoriesToShow.includes(activeCategory)
  ) {

    activeCategory = 'All';
  }


  /*
  |--------------------------------------------------------------------------
  | FILTER BUTTONS
  |--------------------------------------------------------------------------
  */

  filters.innerHTML = [

    'All',

    ...categoriesToShow

  ]
    .map(category => {

      const active =
        category === activeCategory;

      return `
        <button
          class="filter ${active ? 'active' : ''}"
          type="button"
          data-filter="${escapeHTML(category)}"
        >
          ${escapeHTML(category)}
        </button>
      `;
    })
    .join('');


  /*
  |--------------------------------------------------------------------------
  | MATCHING PRODUCTS
  |--------------------------------------------------------------------------
  */

  const matches =
    getFilteredProducts();


  /*
  |--------------------------------------------------------------------------
  | CATEGORIES TO RENDER
  |--------------------------------------------------------------------------
  */

  const groups =
    activeCategory === 'All'
      ? categoriesToShow
      : [activeCategory];


  /*
  |--------------------------------------------------------------------------
  | RENDER CATEGORY ROWS
  |--------------------------------------------------------------------------
  */

  categoryRows.innerHTML = groups

    .map(category => {

      const row =
        matches.filter(
          product =>
            product.category === category
        );


      if (!row.length) {
        return '';
      }


      return `
        <section class="category-row">

          <div class="row-heading">

            <h2>
              ${escapeHTML(category)}
            </h2>

            <span>
              ${row.length}
              piece${row.length === 1 ? '' : 's'}
            </span>

          </div>


          <div class="horizontal-products">

            ${row
              .map(product =>
                productCard(
                  product,
                  settings.contact.whatsapp,
                  settings.company.name
                )
              )
              .join('')}

          </div>

        </section>
      `;
    })
    .join('');


  /*
  |--------------------------------------------------------------------------
  | EMPTY STATE
  |--------------------------------------------------------------------------
  */

  if (emptyProducts) {

    emptyProducts.hidden =
      matches.length > 0;

  }


  /*
  |--------------------------------------------------------------------------
  | PRODUCT MODAL
  |--------------------------------------------------------------------------
  */

  setupModal(
    products,
    settings.contact.whatsapp,
    settings.company.name
  );
}


/*
|--------------------------------------------------------------------------
| CATEGORY BUTTON CLICK
|--------------------------------------------------------------------------
*/

const filters =
  $('#filters');

if (filters) {

  filters.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-filter]'
        );


      if (!button) {
        return;
      }


      activeCategory =
        button.dataset.filter;


      draw();
    }
  );
}


/*
|--------------------------------------------------------------------------
| PRODUCT SEARCH
|--------------------------------------------------------------------------
*/

const productSearch =
  $('#product-search');

if (productSearch) {

  productSearch.addEventListener(
    'input',
    event => {

      searchQuery =
        event.target.value
          .trim()
          .toLowerCase();


      draw();
    }
  );
}


/*
|--------------------------------------------------------------------------
| FIREBASE
|--------------------------------------------------------------------------
*/

if (firebaseReady) {
  subscribeSiteSettings(db, value => {
    settings = value;
    applyPublicSettings(settings, 'products');
    draw();
  }, () => applyPublicSettings(settings, 'products'));


  /*
  |--------------------------------------------------------------------------
  | PRODUCTS
  |--------------------------------------------------------------------------
  */

  onValue(
    ref(db, 'products'),
    snapshot => {

      const data =
        snapshot.val() || {};


      products =
        Object.entries(data)
          .map(([id, product]) => ({

            ...product,

            id:
              product.id || id

          }));


      draw();
    }
  );


  /*
  |--------------------------------------------------------------------------
  | CATEGORIES
  |--------------------------------------------------------------------------
  */

  onValue(
    ref(db, 'categories'),
    snapshot => {

      const data =
        snapshot.val() || {};


      categories =
        Object.entries(data)
          .map(([id, category]) => ({

            ...category,

            id:
              category.id || id

          }));


      draw();
    }
  );


} else {

  /*
  |--------------------------------------------------------------------------
  | FIREBASE NOT READY
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  | Do NOT show demo products.
  |
  */

  products = [];
  categories = [];

  draw();
  applyPublicSettings(settings, 'products');
}
