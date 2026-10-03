import { escapeHTML } from './utils.js';

/*
|--------------------------------------------------------------------------
| IMAGE HANDLING
|--------------------------------------------------------------------------
| Product/material images come ONLY from Firebase/admin data.
| No demo images and no fallback furniture images.
|--------------------------------------------------------------------------
*/

export const productImagesFor = (item) => {
  if (!item) return [];
  const gallery = Array.isArray(item.images)
    ? item.images.filter((url) => typeof url === 'string' && url.trim()).map((url) => url.trim()).slice(0, 3)
    : [];
  if (gallery.length) return gallery;
  const legacy = [item.imageUrl, item.image, item.photo]
    .find((url) => typeof url === 'string' && url.trim());
  return legacy ? [legacy.trim()] : [];
};

export const imageFor = (item) => productImagesFor(item)[0] || '';

export const wrapCarouselIndex = (index, direction, length) =>
  length > 0 ? (index + direction + length) % length : 0;


/*
|--------------------------------------------------------------------------
| DESCRIPTION
|--------------------------------------------------------------------------
*/

export const descriptionFor = (item) => {
  if (!item) return '';

  return (
    item.description ||
    item.shortDescription ||
    item.short_description ||
    ''
  );
};


/*
|--------------------------------------------------------------------------
| WHATSAPP
|--------------------------------------------------------------------------
*/

export const whatsappLink = (
  name,
  number = '919000000000',
  companyName = 'KR Hanuman Furnitures'
) => {
  const cleanNumber = String(number || '').replace(/\D/g, '');

  const message = encodeURIComponent(
    `Hello ${companyName || 'KR Hanuman Furnitures'}, I would like to book ${name}.`
  );

  return `https://wa.me/${cleanNumber}?text=${message}`;
};


/*
|--------------------------------------------------------------------------
| PRODUCT IMAGE
|--------------------------------------------------------------------------
*/

function productImageHTML(product) {
  const images = productImagesFor(product);
  const image = images[0] || '';
  const name = product.name || 'Furniture product';

  if (!image) {
    return `
      <div class="product-image-placeholder">
        <span>IMAGE NOT AVAILABLE</span>
      </div>
    `;
  }

  return `
    <img loading="lazy" draggable="false" src="${escapeHTML(image)}" alt="${escapeHTML(name)}${images.length > 1 ? ', image 1 of ' + images.length : ''}" onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex';">
    <div class="product-image-placeholder" style="display:none;"><span>IMAGE NOT AVAILABLE</span></div>
    ${images.length > 1 ? `
      <div class="product-carousel" data-images="${escapeHTML(JSON.stringify(images))}" data-index="0" role="group" aria-label="${escapeHTML(name)} image carousel">
        <button class="carousel-control" type="button" data-card-carousel-step="-1" aria-label="Previous image">&#8592;</button>
        <span class="carousel-count" aria-live="polite">1 / ${images.length}</span>
        <button class="carousel-control" type="button" data-card-carousel-step="1" aria-label="Next image">&#8594;</button>
      </div>
    ` : ''}
  `;
}


/*
|--------------------------------------------------------------------------
| PRODUCT CARD
|--------------------------------------------------------------------------
*/

export const productCard = (product, number, companyName = 'KR Hanuman Furnitures') => {
  const p = product || {};

  const featured =
    p.featured === true ||
    p.featured === 'true' ||
    p.isFeatured === true;

  const bookingEnabled =
    p.bookEnabled !== false;

  return `
    <article class="product-card">

      <div class="product-image">

        ${productImageHTML(p)}

        ${
          featured
            ? `<span class="tag">FEATURED</span>`
            : ''
        }

      </div>

      <div class="product-meta">

        <div>

          <p class="product-category">
            ${escapeHTML(p.category || 'Furniture')}
          </p>

          <h3>
            ${escapeHTML(p.name || 'Furniture')}
          </h3>

          ${
            descriptionFor(p)
              ? `
                <p class="product-description">
                  ${escapeHTML(descriptionFor(p))}
                </p>
              `
              : ''
          }

        </div>

        <b>
          ${escapeHTML(p.price || 'Price on request')}
        </b>

      </div>

      <div class="card-actions">

        <button
          class="card-link"
          type="button"
          data-details="${escapeHTML(p.id || '')}"
        >
          View Details
        </button>

        ${
          bookingEnabled
            ? `
              <a
                class="card-link"
                href="${whatsappLink(
                  p.name || 'this product',
                  number,
                  companyName
                )}"
                target="_blank"
                rel="noopener"
              >
                Book Now →
              </a>
            `
            : ''
        }

      </div>

    </article>
  `;
};


/*
|--------------------------------------------------------------------------
| MATERIAL CARD
|--------------------------------------------------------------------------
*/

export const materialCard = (material) => {
  const item = material || {};
  const image = imageFor(item);

  return `
    <article class="material-card material-with-image">

      ${
        image
          ? `
            <img
              loading="lazy"
              src="${escapeHTML(image)}"
              alt="${escapeHTML(
                item.name || 'Furniture material'
              )}"
              onerror="
                this.onerror=null;
                this.style.display='none';
              "
            >
          `
          : `
            <div class="material-image-placeholder">
              <span>QUALITY MATERIAL</span>
            </div>
          `
      }

      <div>

        <span>QUALITY MATERIAL</span>

        <h3>
          ${escapeHTML(
            item.name || 'Premium Material'
          )}
        </h3>

        ${
          item.description
            ? `
              <p>
                ${escapeHTML(item.description)}
              </p>
            `
            : ''
        }

      </div>

    </article>
  `;
};


/*
|--------------------------------------------------------------------------
| PRODUCT DETAILS MODAL
|--------------------------------------------------------------------------
*/

export function setupModal(products, number, companyName = 'KR Hanuman Furnitures') {

  const modal =
    document.querySelector('#product-modal');

  if (!modal) return;

  modal._products = products;
  modal._whatsappNumber = number;
  modal._companyName = companyName;

  /*
  --------------------------------------------------------------------------
  | Prevent duplicate listeners
  --------------------------------------------------------------------------
  */

  if (modal.dataset.bound === 'true') {
    return;
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-card-carousel-step]');
    if (!button) return;
    const carousel = button.closest('.product-carousel');
    const card = button.closest('.product-card');
    const image = card?.querySelector('.product-image > img');
    const count = carousel?.querySelector('.carousel-count');
    if (!carousel || !image) return;
    event.preventDefault();
    event.stopPropagation();
    let images = [];
    try { images = JSON.parse(carousel.dataset.images || '[]'); } catch { return; }
    if (!Array.isArray(images) || images.length < 2) return;
    const nextIndex = wrapCarouselIndex(Number(carousel.dataset.index || 0), Number(button.dataset.cardCarouselStep), images.length);
    carousel.dataset.index = String(nextIndex);
    image.src = images[nextIndex];
    image.alt = `${card.querySelector('.product-meta h3')?.textContent || 'Furniture product'}, image ${nextIndex + 1} of ${images.length}`;
    image.style.display = '';
    const placeholder = image.nextElementSibling;
    if (placeholder?.classList.contains('product-image-placeholder')) placeholder.style.display = 'none';
    if (count) count.textContent = `${nextIndex + 1} / ${images.length}`;
  });


  /*
  --------------------------------------------------------------------------
  | Open product details
  --------------------------------------------------------------------------
  */

  modal._open = (id) => {

    const product =
      modal._products.find(
        item => String(item.id) === String(id)
      );

    if (!product) return;


    const modalImage =
      document.querySelector('#modal-image');

    const gallery = modal.querySelector('#modal-gallery');
    const images = productImagesFor(product);
    let activeImage = 0;
    const paintGallery = () => {
      if (!modalImage) return;
      modalImage.src = images[activeImage] || '';
      modalImage.style.display = images.length ? '' : 'none';
      modalImage.alt = `${product.name || 'Furniture product'}${images.length > 1 ? `, image ${activeImage + 1} of ${images.length}` : ''}`;
      if (gallery) {
        gallery.querySelectorAll('[data-gallery-index]').forEach((button, index) => {
          button.classList.toggle('active', index === activeImage);
          button.setAttribute('aria-current', index === activeImage ? 'true' : 'false');
        });
        const previous = gallery.querySelector('[data-gallery-prev]');
        const next = gallery.querySelector('[data-gallery-next]');
        if (previous) previous.hidden = images.length < 2;
        if (next) next.hidden = images.length < 2;
        const count = gallery.querySelector('[data-gallery-count]');
        if (count) count.textContent = images.length > 1 ? `${activeImage + 1} / ${images.length}` : '';
      }
    };
    if (gallery) {
      gallery.innerHTML = images.length > 1 ? `<div class="gallery-controls"><button class="carousel-control" type="button" data-gallery-prev aria-label="Previous image">&#8592;</button><span class="carousel-count" data-gallery-count aria-live="polite"></span><button class="carousel-control" type="button" data-gallery-next aria-label="Next image">&#8594;</button></div><div class="gallery-thumbnails">${images.map((url, index) => `<button type="button" data-gallery-index="${index}" aria-label="Show image ${index + 1}"><img src="${escapeHTML(url)}" alt=""></button>`).join('')}</div>` : '';
      gallery.onclick = (event) => {
        const target = event.target.closest('[data-gallery-index], [data-gallery-prev], [data-gallery-next]');
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        if (target.hasAttribute('data-gallery-index')) activeImage = Number(target.dataset.galleryIndex);
        else activeImage = wrapCarouselIndex(activeImage, target.hasAttribute('data-gallery-next') ? 1 : -1, images.length);
        paintGallery();
      };
    }

    const modalCategory =
      document.querySelector('#modal-category');

    const modalName =
      document.querySelector('#modal-name');

    const modalPrice =
      document.querySelector('#modal-price');

    const modalDescription =
      document.querySelector('#modal-description');

    const modalBook =
      document.querySelector('#modal-book');


    /*
    --------------------------------------------------------------------------
    | Image
    --------------------------------------------------------------------------
    */

    const image = images[0] || '';

    if (modalImage) {

      modalImage.onerror = null;

      if (image) {

        paintGallery();

        modalImage.style.display = '';

        modalImage.onerror = () => {
          modalImage.style.display = 'none';
        };

      } else {

        modalImage.removeAttribute('src');
        modalImage.alt = '';
        modalImage.style.display = 'none';
      }
    }


    /*
    --------------------------------------------------------------------------
    | Product information
    --------------------------------------------------------------------------
    */

    if (modalCategory) {
      modalCategory.textContent =
        product.category || 'Furniture';
    }

    if (modalName) {
      modalName.textContent =
        product.name || 'Furniture';
    }

    if (modalPrice) {
      modalPrice.textContent =
        product.price || 'Price on request';
    }

    if (modalDescription) {
      modalDescription.textContent =
        descriptionFor(product);
    }


    /*
    --------------------------------------------------------------------------
    | WhatsApp booking
    --------------------------------------------------------------------------
    */

    if (modalBook) {

      modalBook.href =
        whatsappLink(
          product.name || 'this product',
          modal._whatsappNumber,
          modal._companyName
        );

      modalBook.hidden =
        product.bookEnabled === false;
    }


    /*
    --------------------------------------------------------------------------
    | Open modal
    --------------------------------------------------------------------------
    */

    if (!modal.open) {
      modal.showModal();
    }
  };


  /*
  --------------------------------------------------------------------------
  | Product details button
  --------------------------------------------------------------------------
  */

  document.addEventListener('click', (event) => {

    const button =
      event.target.closest('[data-details]');

    if (!button) return;

    modal._open(button.dataset.details);
  });


  /*
  --------------------------------------------------------------------------
  | Close button
  --------------------------------------------------------------------------
  */

  const closeButton =
    modal.querySelector('.modal-close');

  if (closeButton) {

    closeButton.addEventListener(
      'click',
      () => modal.close()
    );
  }


  /*
  --------------------------------------------------------------------------
  | Click outside modal
  --------------------------------------------------------------------------
  */

  modal.addEventListener('click', (event) => {

    if (event.target === modal) {
      modal.close();
    }
  });

  modal.addEventListener('keydown', (event) => {
    if (!modal.open || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    const nextButton = modal.querySelector(event.key === 'ArrowRight' ? '[data-gallery-next]' : '[data-gallery-prev]');
    if (!nextButton || nextButton.hidden) return;
    event.preventDefault();
    nextButton.click();
  });


  modal.dataset.bound = 'true';
}
