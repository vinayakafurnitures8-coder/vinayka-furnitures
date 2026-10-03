import { ref, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

export const DEFAULT_SETTINGS = {
  company: {
    name: 'KR Hanuman Furnitures',
    shortName: 'KR Hanuman',
    tagline: 'TIMELESS COMFORT · PERSONAL STYLE',
    aboutText: 'KR Hanuman Furnitures brings together the warmth of custom-made furniture and the confidence of enduring quality. Every piece is chosen to make your home more comfortable, useful and truly yours.',
    logoUrl: '', faviconUrl: '', footerText: 'Furniture with heart, for homes with soul.'
  },
  appearance: {
    primaryColor: '#563a29', secondaryColor: '#b28b67',
    heroImageUrl: 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=1400&q=88',
    aboutImageUrl: ''
  },
  seo: {
    title: 'KR Hanuman Furnitures | Luxury Furniture Showroom',
    description: 'KR Hanuman Furnitures — refined furniture for beautiful homes.',
    keywords: '', canonicalUrl: '', openGraphImageUrl: ''
  },
  homepage: {
    heroVisible: true, aboutVisible: true, materialsVisible: true,
    featuredProductsVisible: true, contactVisible: true,
    sectionOrder: ['hero', 'featuredProducts', 'cta', 'about', 'materials', 'contact']
  },
  contact: {
    phone: '+91 90000 00000', whatsapp: '919000000000', email: '',
    address: 'KR Hanuman Furnitures\nVisit us for a personal experience',
    mapEmbedUrl: '', mapLinkUrl: 'https://maps.app.goo.gl/teAcvNLZgKq6goUN8',
    socials: {
      instagram: 'https://www.instagram.com/ha_numan1414',
      facebook: 'https://www.facebook.com/share/1FWXE8R62j/',
      youtube: 'https://youtube.com/@krhanumanfurniture-e8c',
      whatsappChannel: 'https://whatsapp.com/channel/0029Vb7lcidFSAtC4uzBru3m'
    },
    businessHours: 'Mon – Sun\n10:00 AM – 9:00 PM'
  }
};

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const pick = (source, key, fallback) => source[key] == null ? fallback : source[key];

export function normalizeSettings(rawSettings = {}, rawContact = {}) {
  const root = object(rawSettings);
  const contact = object(rawContact);
  const company = { ...DEFAULT_SETTINGS.company, ...object(root.company) };
  const appearance = { ...DEFAULT_SETTINGS.appearance, ...object(root.appearance) };
  const seo = { ...DEFAULT_SETTINGS.seo, ...object(root.seo) };
  const homepage = { ...DEFAULT_SETTINGS.homepage, ...object(root.homepage) };
  const socials = { ...DEFAULT_SETTINGS.contact.socials, ...object(contact.socials) };
  company.name = pick(company, 'name', DEFAULT_SETTINGS.company.name);
  company.shortName = pick(company, 'shortName', DEFAULT_SETTINGS.company.shortName);
  company.tagline = pick(company, 'tagline', DEFAULT_SETTINGS.company.tagline);
  company.aboutText = pick(company, 'aboutText', DEFAULT_SETTINGS.company.aboutText);
  company.footerText = pick(company, 'footerText', company.tagline);
  const normalizedContact = {
    ...DEFAULT_SETTINGS.contact,
    ...contact,
    phone: contact.phone || contact.phoneNumber || DEFAULT_SETTINGS.contact.phone,
    whatsapp: contact.whatsapp || contact.whatsappNumber || DEFAULT_SETTINGS.contact.whatsapp,
    address: contact.address || contact.storeAddress || DEFAULT_SETTINGS.contact.address,
    mapEmbedUrl: contact.mapEmbedUrl || contact.googleMap || contact.mapUrl || DEFAULT_SETTINGS.contact.mapEmbedUrl,
    mapLinkUrl: contact.mapLinkUrl || DEFAULT_SETTINGS.contact.mapLinkUrl,
    socials,
    businessHours: pick(contact, 'businessHours', DEFAULT_SETTINGS.contact.businessHours)
  };
  homepage.sectionOrder = Array.isArray(homepage.sectionOrder)
    ? homepage.sectionOrder.filter(key => ['hero', 'featuredProducts', 'cta', 'about', 'materials', 'contact'].includes(key))
    : DEFAULT_SETTINGS.homepage.sectionOrder;
  homepage.sectionOrder = [...new Set(homepage.sectionOrder)];
  for (const key of DEFAULT_SETTINGS.homepage.sectionOrder) if (!homepage.sectionOrder.includes(key)) homepage.sectionOrder.push(key);
  for (const key of ['name', 'shortName', 'tagline', 'aboutText', 'footerText']) {
    if (typeof company[key] !== 'string' || !company[key].trim()) company[key] = DEFAULT_SETTINGS.company[key] || company.tagline;
  }
  if (typeof seo.title !== 'string' || !seo.title.trim()) seo.title = DEFAULT_SETTINGS.seo.title;
  if (typeof seo.description !== 'string' || !seo.description.trim()) seo.description = DEFAULT_SETTINGS.seo.description;
  return {
    company, appearance, seo, homepage, contact: normalizedContact,
    provided: {
      seoTitle: typeof object(root.seo).title === 'string' && Boolean(object(root.seo).title.trim()),
      seoDescription: typeof object(root.seo).description === 'string' && Boolean(object(root.seo).description.trim()),
      seoKeywords: typeof object(root.seo).keywords === 'string' && Boolean(object(root.seo).keywords.trim()),
      seoOpenGraphImage: Object.prototype.hasOwnProperty.call(object(root.seo), 'openGraphImageUrl')
    }
  };
}

export function subscribeSiteSettings(db, callback, onError = () => {}) {
  let rawSettings = {};
  let rawContact = {};
  const emit = () => callback(normalizeSettings(rawSettings, rawContact));
  emit();
  const stopSettings = onValue(ref(db, 'siteSettings'), snapshot => { rawSettings = snapshot.val() || {}; emit(); }, onError);
  const stopContact = onValue(ref(db, 'contact'), snapshot => { rawContact = snapshot.val() || {}; emit(); }, onError);
  return () => { stopSettings(); stopContact(); };
}

function safePublicUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function setMeta(selector, value, attribute = 'content') {
  const node = document.querySelector(selector);
  if (node && value != null && String(value).trim()) node.setAttribute(attribute, String(value));
}

function applyHomepage(settings) {
  const page = document.querySelector('main');
  if (!page || !document.querySelector('.hero')) return;
  const sections = {
    hero: document.querySelector('.hero'),
    featuredProducts: document.querySelector('#featured'),
    cta: document.querySelector('.cta-band'),
    about: document.querySelector('#about'),
    materials: document.querySelector('#materials'),
    contact: document.querySelector('#contact')
  };
  const visibility = {
    hero: settings.homepage.heroVisible,
    featuredProducts: settings.homepage.featuredProductsVisible,
    about: settings.homepage.aboutVisible,
    materials: settings.homepage.materialsVisible,
    contact: settings.homepage.contactVisible
  };
  for (const [key, visible] of Object.entries(visibility)) if (sections[key]) sections[key].hidden = visible === false;
  for (const key of settings.homepage.sectionOrder) if (sections[key]) page.append(sections[key]);
}

export function applyPublicSettings(settings, pageType = 'home') {
  const { company, appearance, seo, contact } = settings;
  const primaryColor = /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(appearance.primaryColor) ? appearance.primaryColor : DEFAULT_SETTINGS.appearance.primaryColor;
  const secondaryColor = /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(appearance.secondaryColor) ? appearance.secondaryColor : DEFAULT_SETTINGS.appearance.secondaryColor;
  document.documentElement.style.setProperty('--brown', primaryColor);
  document.documentElement.style.setProperty('--tan', secondaryColor);
  setMeta('meta[name="theme-color"]', appearance.primaryColor, 'content');

  document.querySelectorAll('.brand').forEach(brand => {
    const mark = brand.querySelector('.brand-mark');
    let copy = brand.querySelector('.brand-copy');
    if (!copy) { copy = [...brand.children].find(child => child !== mark && child.tagName === 'SPAN'); }
    if (!copy) { copy = document.createElement('span'); brand.append(copy); }
    copy.classList.add('brand-copy');
    const shortName = company.shortName || DEFAULT_SETTINGS.company.shortName;
    const suffix = company.name.toLowerCase().startsWith(shortName.toLowerCase())
      ? company.name.slice(shortName.length).trim()
      : company.name;
    copy.replaceChildren(document.createTextNode(shortName));
    const sub = document.createElement('i'); sub.textContent = suffix || company.name; copy.append(document.createElement('br'), sub);
    brand.setAttribute('aria-label', `${company.name} home`);
    let logo = brand.querySelector('.company-logo');
    if (company.logoUrl && safePublicUrl(company.logoUrl)) {
      if (!logo) { logo = document.createElement('img'); logo.className = 'company-logo'; brand.prepend(logo); }
      logo.src = safePublicUrl(company.logoUrl); logo.alt = `${company.name} logo`; logo.hidden = false;
      if (mark) mark.hidden = true;
    } else { if (logo) logo.remove(); if (mark) mark.hidden = false; }
  });
  document.querySelectorAll('[data-company-tagline]').forEach(node => { node.textContent = company.tagline; });
  const footer = document.querySelector('#footer-tagline');
  if (footer) footer.textContent = company.footerText || company.tagline || DEFAULT_SETTINGS.company.footerText;
  const aboutText = document.querySelector('#about-text');
  if (aboutText) { aboutText.textContent = company.aboutText || DEFAULT_SETTINGS.company.aboutText; aboutText.style.whiteSpace = 'pre-line'; }
  const aboutImage = document.querySelector('#about-photo');
  const aboutPlaceholder = document.querySelector('#about-image-placeholder');
  if (aboutImage && appearance.aboutImageUrl && safePublicUrl(appearance.aboutImageUrl)) {
    aboutImage.src = safePublicUrl(appearance.aboutImageUrl); aboutImage.hidden = false; if (aboutPlaceholder) aboutPlaceholder.hidden = true;
  } else { if (aboutImage) aboutImage.hidden = true; if (aboutPlaceholder) aboutPlaceholder.hidden = false; }
  const heroImage = document.querySelector('#hero-photo');
  if (heroImage) heroImage.src = safePublicUrl(appearance.heroImageUrl) || DEFAULT_SETTINGS.appearance.heroImageUrl;
  const companyLabel = document.querySelector('#about-image-placeholder span');
  if (companyLabel) companyLabel.textContent = company.shortName || company.name;
  const footerCompany = document.querySelector('#footer-company');
  if (footerCompany) footerCompany.textContent = company.name;

  const phone = document.querySelector('#contact-phone');
  if (phone) { phone.href = `tel:${String(contact.phone || '').replace(/\D/g, '')}`; const text = phone.querySelector('b'); if (text) text.textContent = contact.phone || ''; }
  const wa = document.querySelector('#contact-whatsapp');
  if (wa) { wa.href = `https://wa.me/${String(contact.whatsapp || '').replace(/\D/g, '')}`; const text = wa.querySelector('b'); if (text) text.textContent = contact.whatsapp || ''; }
  for (const selector of ['#hero-call', '#floating-call']) { const node = document.querySelector(selector); if (node) node.href = `tel:${String(contact.phone || '').replace(/\D/g, '')}`; }
  const floatingWa = document.querySelector('#floating-whatsapp');
  if (floatingWa) floatingWa.href = `https://wa.me/${String(contact.whatsapp || '').replace(/\D/g, '')}`;
  const address = document.querySelector('#store-address');
  if (address && contact.address) { address.textContent = contact.address; address.style.whiteSpace = 'pre-line'; }
  const hours = document.querySelector('#working-hours');
  if (hours && contact.businessHours) { hours.textContent = contact.businessHours; hours.style.whiteSpace = 'pre-line'; }
  const email = document.querySelector('#contact-email');
  if (email) { email.hidden = !contact.email; if (contact.email) { email.href = `mailto:${contact.email}`; email.querySelector('b').textContent = contact.email; } }
  const mapLink = document.querySelector('#map-link');
  if (mapLink) { const url = safePublicUrl(contact.mapLinkUrl); if (url) { mapLink.href = url; mapLink.hidden = false; } else mapLink.hidden = true; }
  const map = document.querySelector('#google-map');
  if (map) { const url = safePublicUrl(contact.mapEmbedUrl); if (url && /^https:\/\/www\.google\.com\/maps\/embed\?/i.test(url)) { map.src = url; map.hidden = false; } else { map.removeAttribute('src'); map.hidden = true; } }
  const socialLinks = { instagram: '#social-instagram', facebook: '#social-facebook', youtube: '#social-youtube', whatsappChannel: '#social-whatsapp-channel' };
  for (const [key, selector] of Object.entries(socialLinks)) {
    const node = document.querySelector(selector); if (!node) continue;
    const url = safePublicUrl(contact.socials?.[key]); node.hidden = !url;
    if (url) { node.href = url; node.target = '_blank'; node.rel = 'noopener'; }
  }
  const qr = document.querySelector('#instagram-qr');
  const instagram = safePublicUrl(contact.socials?.instagram);
  if (qr && instagram) qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(instagram)}`;

  const title = settings.provided.seoTitle ? (pageType === 'products' ? `${seo.title} | Products` : seo.title) : '';
  if (title) {
    document.title = title;
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[name="twitter:title"]', title);
  }
  if (settings.provided.seoDescription) {
    setMeta('meta[name="description"]', seo.description);
    setMeta('meta[property="og:description"]', seo.description);
    setMeta('meta[name="twitter:description"]', seo.description);
  }
  if (settings.provided.seoKeywords) setMeta('meta[name="keywords"]', seo.keywords);
  const shareImage = safePublicUrl(seo.openGraphImageUrl);
  if (shareImage) { setMeta('meta[property="og:image"]', shareImage); setMeta('meta[name="twitter:image"]', shareImage); }
  else if (settings.provided.seoOpenGraphImage) {
    document.querySelector('meta[property="og:image"]')?.setAttribute('content', '');
    document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', '');
  }
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical && seo.canonicalUrl) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
  if (canonical && seo.canonicalUrl) {
    const base = seo.canonicalUrl.replace(/\/$|\/index\.html$/i, '');
    canonical.href = pageType === 'products' ? `${base}/products.html` : `${base}/`;
  }
  const schema = document.querySelector('script[type="application/ld+json"]');
  if (schema && pageType === 'home') {
    try {
      const data = JSON.parse(schema.textContent); data.name = company.name;
      if (settings.provided.seoDescription) data.description = seo.description;
      data.sameAs = Object.values(contact.socials || {}).filter(Boolean);
      if (contact.phone) data.telephone = contact.phone;
      if (contact.email) data.email = contact.email;
      if (contact.address) data.address = { '@type': 'PostalAddress', streetAddress: contact.address };
      schema.textContent = JSON.stringify(data);
    } catch { /* Keep static structured data if parsing fails. */ }
  }
  if (company.faviconUrl && safePublicUrl(company.faviconUrl)) {
    let icon = document.querySelector('link[rel="icon"]');
    if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.append(icon); }
    icon.href = safePublicUrl(company.faviconUrl); icon.dataset.companyFavicon = 'true';
  } else document.querySelector('link[rel="icon"][data-company-favicon="true"]')?.remove();
  applyHomepage(settings);
}
