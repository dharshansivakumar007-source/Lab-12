'use strict';

const STORAGE = {
  cart: 'nova-cart',
  wishlist: 'nova-wishlist',
  theme: 'nova-theme',
  profile: 'nova-profile',
  orders: 'nova-orders',
  coupon: 'nova-coupon',
  recentlyViewed: 'nova-recently-viewed',
  compare: 'nova-compare',
  messages: 'nova-messages',
  newsletter: 'nova-newsletter',
  address: 'nova-address',
  offerEnd: 'nova-offer-end'
};
const FREE_SHIPPING_MINIMUM = 49999;
const SHIPPING_FEE = 499;
const money = value => `₹${Number(value || 0).toLocaleString('en-IN')}`;
let catalog = [];

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error(`Could not read ${key} from local storage.`, error);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Could not save ${key} to local storage.`, error);
    showToast('This browser could not save your changes. Check its storage settings.', 'error');
    return false;
  }
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function safeImageURL(value) {
  try {
    const url = new URL(value, location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function showToast(message, kind = 'success') {
  let region = document.querySelector('#toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.className = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${kind}`;
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => {
    toast.classList.add('toast-out');
    window.setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function getCart() {
  const cart = readStorage(STORAGE.cart, []);
  return Array.isArray(cart) ? cart.filter(item => item && item.id && Number(item.qty) > 0) : [];
}

function getWishlist() {
  const items = readStorage(STORAGE.wishlist, []);
  return Array.isArray(items) ? items.map(String) : [];
}

function updateHeaderCounts() {
  const count = getCart().reduce((sum, item) => sum + Number(item.qty), 0);
  document.querySelectorAll('[data-cart-count]').forEach(node => { node.textContent = count; });
  document.querySelectorAll('[data-wishlist-count]').forEach(node => { node.textContent = getWishlist().length; });
}

function saveCart(cart) {
  if (writeStorage(STORAGE.cart, cart)) updateHeaderCounts();
}

function productById(id) {
  return catalog.find(product => product.id === String(id));
}

function addToCart(id, quantity = 1) {
  const product = productById(id);
  if (!product) {
    showToast('That product is not available right now.', 'error');
    return;
  }
  if (product.availability === 'Out of stock') {
    showToast(`${product.name} is currently out of stock.`, 'error');
    return;
  }
  const cart = getCart();
  const item = cart.find(entry => entry.id === product.id);
  if (item) item.qty = Math.min(20, Number(item.qty) + Number(quantity));
  else cart.push({ id: product.id, qty: Math.max(1, Math.min(20, Number(quantity) || 1)) });
  saveCart(cart);
  showToast(`${product.name} added to your bag.`);
}

function toggleWishlist(id) {
  const product = productById(id);
  if (!product) return;
  const wishlist = getWishlist();
  const index = wishlist.indexOf(product.id);
  if (index >= 0) {
    wishlist.splice(index, 1);
    showToast(`${product.name} removed from your favourites.`);
  } else {
    wishlist.push(product.id);
    showToast(`${product.name} saved to your favourites.`);
  }
  if (writeStorage(STORAGE.wishlist, wishlist)) updateHeaderCounts();
  document.querySelectorAll('[data-wishlist]').forEach(button => {
    if (button.dataset.wishlist !== product.id) return;
    const saved = wishlist.includes(product.id);
    button.classList.toggle('is-saved', saved);
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('aria-label', saved ? 'Remove from wishlist' : 'Add to wishlist');
  });
  if (document.querySelector('#wishlist-content')) renderWishlist();
}

async function loadProducts() {
  try {
    const response = await fetch('products.xml');
    if (!response.ok) throw new Error(`products.xml returned ${response.status}`);
    const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('products.xml is not valid XML');
    catalog = [...xml.querySelectorAll('product')].map(node => {
      const field = name => node.querySelector(name)?.textContent?.trim() || '';
      return {
        id: node.getAttribute('id') || '',
        name: field('name'),
        brand: field('brand'),
        category: field('category'),
        description: field('description'),
        price: Number(field('price')),
        originalPrice: Number(field('originalPrice')),
        image: safeImageURL(field('image')),
        gallery: [...node.querySelectorAll('gallery image')].map(image => safeImageURL(image.textContent.trim())).filter(Boolean),
        rating: Number(field('rating')),
        reviews: Number(field('reviews')),
        availability: field('availability'),
        discount: Number(field('discount')),
        badge: field('badge'),
        featured: field('featured') === 'true',
        newArrival: field('newArrival') === 'true',
        specifications: [...node.querySelectorAll('specifications specification')].map(specification => ({
          label: specification.getAttribute('name') || 'Details',
          value: specification.getAttribute('value') || specification.textContent.trim()
        }))
      };
    }).filter(product => product.id && product.name && product.brand && product.price > 0 && product.image && product.category);
    if (!catalog.length) throw new Error('No usable product records were found in products.xml');
    return catalog;
  } catch (error) {
    console.error('Product catalogue could not be loaded.', error);
    const grid = document.querySelector('#product-grid');
    if (grid) grid.innerHTML = '<div class="empty-state"><span>✦</span><h2>Our shelves are taking a breather.</h2><p>We couldn’t load the product collection. Please refresh and try again.</p></div>';
    showToast('The collection could not be loaded. Please try again.', 'error');
    return [];
  }
}

function productCard(product, { moveFromWishlist = false } = {}) {
  const saved = getWishlist().includes(product.id);
  const image = escapeHTML(product.image);
  return `<article class="product-card">
    <div class="product-image-wrap">
      <a class="product-image-link" href="product.html?id=${encodeURIComponent(product.id)}" aria-label="View ${escapeHTML(product.name)}">
        <img src="${image}" alt="${escapeHTML(product.name)}" loading="lazy">
        ${product.discount ? `<span class="product-badge sale-badge">−${product.discount}%</span>` : ''}
        ${product.badge ? `<span class="product-badge product-badge-secondary">${escapeHTML(product.badge)}</span>` : ''}
      </a>
      <button class="wishlist-button ${saved ? 'is-saved' : ''}" type="button" data-wishlist="${escapeHTML(product.id)}" aria-label="${saved ? 'Remove from wishlist' : 'Add to wishlist'}" aria-pressed="${saved}"><span aria-hidden="true">${saved ? '♥' : '♡'}</span></button>
      <button class="quick-view-button" type="button" data-quick-view="${escapeHTML(product.id)}">Quick view <span aria-hidden="true">↗</span></button>
    </div>
    <div class="product-info"><div><p class="product-category">${escapeHTML(product.brand)} · ${escapeHTML(product.category)}</p><a href="product.html?id=${encodeURIComponent(product.id)}"><h3>${escapeHTML(product.name)}</h3></a><p class="product-rating"><span aria-label="${product.rating} out of 5 stars">★ ${product.rating.toFixed(1)}</span> <span>(${product.reviews} demo reviews)</span></p><p class="stock-label ${product.availability === 'Out of stock' ? 'out-of-stock' : ''}">${escapeHTML(product.availability)}</p></div>
    <div class="product-price"><strong>${money(product.price)}</strong>${product.originalPrice > product.price ? `<del>${money(product.originalPrice)}</del>` : ''}</div></div>
    <div class="product-card-actions"><button class="text-button" type="button" data-compare="${escapeHTML(product.id)}" aria-pressed="${readStorage(STORAGE.compare, []).includes(product.id)}">Compare</button><button class="add-card-button" type="button" ${product.availability === 'Out of stock' ? 'disabled' : ''} ${moveFromWishlist ? `data-move-to-cart="${escapeHTML(product.id)}"` : `data-add-cart="${escapeHTML(product.id)}"`} aria-label="${moveFromWishlist ? `Move ${escapeHTML(product.name)} to bag` : `Add ${escapeHTML(product.name)} to bag`}">${moveFromWishlist ? 'Move to bag' : 'Add to bag'} <span aria-hidden="true">+</span></button></div>
  </article>`;
}

function showImageFallback(image) {
  image.classList.add('image-unavailable');
  image.alt = `${image.alt} (image unavailable)`;
}

function initSharedLayout() {
  const header = document.querySelector('#site-header');
  if (header) header.innerHTML = `<div class="announcement-bar"><span>Tech Week: save up to 15% on selected devices. <a href="products.html?deals=true">Explore offers ↗</a></span><span class="announcement-shipping">Free delivery on orders over ₹49,999</span><button type="button" data-theme-toggle class="theme-toggle" aria-label="Switch to dark mode">◐ <span>Theme</span></button></div>
    <header class="main-header"><a class="logo" href="index.html" aria-label="NOVA home"><span class="logo-mark" aria-hidden="true"></span>NOVA</a>
    <button class="mobile-menu-toggle" type="button" aria-expanded="false" aria-label="Open navigation menu"><span></span><span></span></button>
    <nav class="main-nav" aria-label="Main navigation"><a href="index.html">Home</a><a href="products.html">Shop</a><div class="nav-dropdown"><button type="button" aria-expanded="false" aria-controls="category-menu">Categories <span aria-hidden="true">⌄</span></button><div class="category-dropdown" id="category-menu"></div></div><a href="products.html?deals=true">Deals <span class="nav-deal-pill">SALE</span></a><a href="contact.html">Contact</a></nav>
    <div class="header-tools"><form class="header-search" role="search" action="products.html"><label class="sr-only" for="site-search">Search technology products</label><span aria-hidden="true">⌕</span><input id="site-search" name="q" type="search" placeholder="Search devices…" autocomplete="off"><div id="search-suggestions" class="search-suggestions" hidden></div></form>
    <a class="icon-link account-link" href="account.html" aria-label="Your account"><span aria-hidden="true">♙</span><small>Account</small></a><a class="icon-link" href="wishlist.html" aria-label="Wishlist"><span aria-hidden="true">♡</span><small>Wishlist</small><b data-wishlist-count>0</b></a><a class="icon-link bag-link" href="cart.html" aria-label="Shopping cart"><span aria-hidden="true">▢</span><small>Cart</small><b data-cart-count>0</b></a></div></header>`;
  const footer = document.querySelector('#site-footer');
  if (footer) footer.innerHTML = `<footer class="site-footer"><div class="footer-top"><div class="footer-brand"><a class="logo" href="index.html"><span class="logo-mark" aria-hidden="true"></span>NOVA</a><p>Technology. Reimagined.<br>Innovation, made more human.</p><div class="social-links"><a href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram">Instagram ↗</a><a href="https://www.youtube.com/" target="_blank" rel="noreferrer" aria-label="YouTube">YouTube ↗</a></div></div><div class="footer-column"><strong>Explore</strong><a href="products.html">Shop all tech</a><a href="products.html?category=Smartphones">Smartphones</a><a href="products.html?category=Laptops">Laptops</a><a href="products.html?deals=true">Deals</a><a href="wishlist.html">Wishlist</a></div><div class="footer-column"><strong>Support</strong><a href="contact.html">Contact support</a><a href="account.html">Your account</a><a href="cart.html">Shopping cart</a><a href="checkout.html">Checkout</a></div><div class="footer-note"><p class="eyebrow">A SMARTER WAY TO SHOP TECH</p><p>Carefully selected technology.<br>Support when you need it.</p><a href="products.html" class="text-link">Explore NOVA ↗</a></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} NOVA</span><span>Technology. Reimagined.</span><span>Demo catalogue · Prices and stock are illustrative</span></div></footer>`;
  const theme = readStorage(STORAGE.theme, 'light');
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    const isDark = document.documentElement.dataset.theme === 'dark';
    button.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} mode`);
    button.innerHTML = `${isDark ? '☼' : '◐'} <span>${isDark ? 'Light' : 'Dark'} mode</span>`;
    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      writeStorage(STORAGE.theme, next);
      button.setAttribute('aria-label', `Switch to ${next === 'dark' ? 'light' : 'dark'} mode`);
      button.innerHTML = `${next === 'dark' ? '☼' : '◐'} <span>${next === 'dark' ? 'Light' : 'Dark'} mode</span>`;
    });
  });
  const menuButton = document.querySelector('.mobile-menu-toggle');
  if (menuButton) menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    document.querySelector('.main-nav')?.classList.toggle('nav-open', open);
  });
  const categoriesButton = document.querySelector('.nav-dropdown > button');
  if (categoriesButton) categoriesButton.addEventListener('click', () => {
    const expanded = categoriesButton.getAttribute('aria-expanded') !== 'true';
    categoriesButton.setAttribute('aria-expanded', String(expanded));
    categoriesButton.parentElement.classList.toggle('dropdown-open', expanded);
  });
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.main-nav > a').forEach(link => {
    const target = new URL(link.href, location.href);
    if (target.pathname.split('/').pop() === currentPage && (target.search === location.search || !target.search)) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });
  const backTop = document.createElement('button');
  backTop.type = 'button';
  backTop.className = 'back-to-top';
  backTop.textContent = '↑';
  backTop.setAttribute('aria-label', 'Back to top');
  backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.append(backTop);
  window.addEventListener('scroll', () => backTop.classList.toggle('visible', window.scrollY > 500), { passive: true });
  document.addEventListener('error', event => {
    if (event.target instanceof HTMLImageElement) showImageFallback(event.target);
  }, true);
  initSearch();
}

function renderCategoryNavigation() {
  const menu = document.querySelector('#category-menu');
  if (!menu) return;
  menu.innerHTML = [...new Set(catalog.map(product => product.category))].sort().map(category => `<a href="products.html?category=${encodeURIComponent(category)}">${escapeHTML(category)}<span aria-hidden="true">↗</span></a>`).join('');
}

function initSearch() {
  const input = document.querySelector('#site-search');
  const suggestions = document.querySelector('#search-suggestions');
  if (!input || !suggestions) return;
  input.value = new URLSearchParams(location.search).get('q') || '';
  const update = () => {
    const query = input.value.trim().toLowerCase();
    if (!query || !catalog.length) {
      suggestions.hidden = true;
      suggestions.innerHTML = '';
      return;
    }
    const matches = catalog.filter(product => `${product.name} ${product.brand} ${product.category}`.toLowerCase().includes(query)).slice(0, 5);
    suggestions.innerHTML = matches.length
      ? matches.map(product => `<a href="product.html?id=${encodeURIComponent(product.id)}"><img src="${escapeHTML(product.image)}" alt=""><span>${escapeHTML(product.name)}<small>${escapeHTML(product.category)}</small></span><b>${money(product.price)}</b></a>`).join('') + `<a class="all-results" href="products.html?q=${encodeURIComponent(query)}">See all matching things ↗</a>`
      : `<p class="suggestion-empty">No matches yet. Try another word.</p>`;
    suggestions.hidden = false;
  };
  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  document.addEventListener('click', event => {
    if (!event.target.closest('.header-search')) suggestions.hidden = true;
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') suggestions.hidden = true;
  });
}

function initGlobalInteractions() {
  document.body.addEventListener('click', event => {
    const addButton = event.target.closest('[data-add-cart]');
    if (addButton) addToCart(addButton.dataset.addCart);
    const moveButton = event.target.closest('[data-move-to-cart]');
    if (moveButton && !moveButton.disabled) {
      const product = productById(moveButton.dataset.moveToCart);
      if (product && product.availability !== 'Out of stock') {
        addToCart(product.id);
        const wishlist = getWishlist().filter(id => id !== product.id);
        if (writeStorage(STORAGE.wishlist, wishlist)) updateHeaderCounts();
        renderWishlist();
      }
    }
    const wishlistButton = event.target.closest('[data-wishlist]');
    if (wishlistButton) toggleWishlist(wishlistButton.dataset.wishlist);
    const quickViewButton = event.target.closest('[data-quick-view]');
    if (quickViewButton) openQuickView(quickViewButton.dataset.quickView);
    const compareButton = event.target.closest('[data-compare]');
    if (compareButton) toggleCompare(compareButton.dataset.compare);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop').forEach(modal => modal.remove());
      document.querySelector('#search-suggestions')?.setAttribute('hidden', '');
    }
  });
  const newsletter = document.querySelector('#newsletter-form');
  if (newsletter) newsletter.addEventListener('submit', event => {
    event.preventDefault();
    if (!newsletter.reportValidity()) return;
    const email = new FormData(newsletter).get('email').toString().trim().toLowerCase();
    const subscribers = readStorage(STORAGE.newsletter, []);
    if (subscribers.includes(email)) {
      showToast('You’re already on the list. We’re glad you’re here.');
      return;
    }
    subscribers.push(email);
    if (writeStorage(STORAGE.newsletter, subscribers)) {
      newsletter.reset();
      showToast('You’re on the list. Look out for a little note from Nova.');
    }
  });
  updateHeaderCounts();
}

function openQuickView(id) {
  const product = productById(id);
  let root = document.querySelector('#quick-view-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'quick-view-root';
    document.body.append(root);
  }
  if (!product) return;
  root.innerHTML = `<div class="modal-backdrop" role="presentation"><section class="quick-view-modal" role="dialog" aria-modal="true" aria-labelledby="quick-view-title"><button class="modal-close" type="button" aria-label="Close quick view">×</button><div class="quick-view-image"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}"></div><div class="quick-view-copy"><p class="eyebrow">${escapeHTML(product.brand)} · ${escapeHTML(product.category)}</p><h2 id="quick-view-title">${escapeHTML(product.name)}</h2><p class="product-rating"><span>★ ${product.rating.toFixed(1)}</span> (${product.reviews} demo reviews)</p><p class="quick-view-description">${escapeHTML(product.description)}</p><strong class="quick-view-price">${money(product.price)}</strong>${product.originalPrice > product.price ? `<del class="quick-view-original">${money(product.originalPrice)}</del>` : ''}<p class="stock-label ${product.availability === 'Out of stock' ? 'out-of-stock' : ''}">${escapeHTML(product.availability)} · Demo catalogue</p><button class="button" type="button" data-add-cart="${escapeHTML(product.id)}" ${product.availability === 'Out of stock' ? 'disabled' : ''}>Add to cart ↗</button><a class="text-link" href="product.html?id=${encodeURIComponent(product.id)}">View full details →</a></div></section></div>`;
  const backdrop = root.querySelector('.modal-backdrop');
  backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.remove(); });
  root.querySelector('.modal-close').addEventListener('click', () => backdrop.remove());
  root.querySelector('[data-add-cart]').addEventListener('click', () => backdrop.remove());
}

function initHome() {
  const categoryGrid = document.querySelector('#category-grid');
  if (categoryGrid) {
    const categories = [...new Set(catalog.map(product => product.category))].sort();
    categoryGrid.innerHTML = categories.map(category => {
      const product = catalog.find(item => item.category === category);
      return `<a class="category-tile" href="products.html?category=${encodeURIComponent(category)}"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(category)} devices" loading="lazy"><span>${escapeHTML(category)}<small>Explore ${escapeHTML(category.toLowerCase())} ↗</small></span></a>`;
    }).join('');
  }
  const heroImage = document.querySelector('#hero-image');
  const heroProduct = catalog.find(product => product.id === '207') || catalog.find(product => product.category === 'Smartphones');
  if (heroImage && heroProduct) {
    heroImage.src = heroProduct.image;
    heroImage.alt = `${heroProduct.brand} ${heroProduct.name}`;
  }
  const featured = document.querySelector('#home-featured');
  if (!featured) return;
  featured.innerHTML = catalog.filter(product => product.featured).slice(0, 4).map(productCard).join('');
  const newArrivals = document.querySelector('#home-new-arrivals');
  if (newArrivals) newArrivals.innerHTML = catalog.filter(product => product.newArrival).slice(0, 4).map(productCard).join('');
  const bestsellers = document.querySelector('#home-bestsellers');
  if (bestsellers) bestsellers.innerHTML = [...catalog].sort((a, b) => b.reviews - a.reviews).slice(0, 4).map(productCard).join('');
  const trending = document.querySelector('#home-trending');
  if (trending) trending.innerHTML = [...catalog].sort((a, b) => (b.reviews * b.rating) - (a.reviews * a.rating)).slice(0, 4).map(productCard).join('');
  const viewed = document.querySelector('#home-recently-viewed');
  const viewedSection = document.querySelector('#recently-viewed-section');
  const recentlyViewed = readStorage(STORAGE.recentlyViewed, []);
  const recentProducts = recentlyViewed.map(productById).filter(Boolean).slice(0, 4);
  if (viewed && recentProducts.length) {
    viewed.innerHTML = recentProducts.map(productCard).join('');
    viewedSection.hidden = false;
  }
  initCountdown();
}

function initCountdown() {
  const timer = document.querySelector('#offer-countdown');
  if (!timer) return;
  let end = Number(readStorage(STORAGE.offerEnd, 0));
  if (!end || end < Date.now()) {
    end = Date.now() + 48 * 60 * 60 * 1000;
    writeStorage(STORAGE.offerEnd, end);
  }
  const update = () => {
    const left = Math.max(0, end - Date.now());
    const hours = Math.floor(left / 3600000);
    const minutes = Math.floor((left % 3600000) / 60000);
    const seconds = Math.floor((left % 60000) / 1000);
    timer.textContent = `${String(hours).padStart(2, '0')} : ${String(minutes).padStart(2, '0')} : ${String(seconds).padStart(2, '0')}`;
  };
  update();
  window.setInterval(update, 1000);
}

function initProductsPage() {
  const grid = document.querySelector('#product-grid');
  if (!grid) return;
  const categorySelect = document.querySelector('#category-filter');
  const categories = [...new Set(catalog.map(product => product.category))].sort();
  categories.forEach(category => categorySelect?.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`));
  const brandSelect = document.querySelector('#brand-filter');
  [...new Set(catalog.map(product => product.brand))].sort().forEach(brand => brandSelect?.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(brand)}">${escapeHTML(brand)}</option>`));
  const availabilitySelect = document.querySelector('#availability-filter');
  [...new Set(catalog.map(product => product.availability))].forEach(availability => availabilitySelect?.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(availability)}">${escapeHTML(availability)}</option>`));
  const params = new URLSearchParams(location.search);
  if (categorySelect) categorySelect.value = params.get('category') || '';
  const sortSelect = document.querySelector('#sort');
  if (sortSelect && ['low', 'high', 'popular', 'rating'].includes(params.get('sort'))) sortSelect.value = params.get('sort');
  let searchQuery = params.get('q')?.trim().toLowerCase() || '';
  let dealsOnly = params.get('deals') === 'true';
  const pageSize = 9;
  let visibleCount = pageSize;
  let filtered = [];
  const filterToggle = document.querySelector('#mobile-filter-toggle');
  const filterPanel = document.querySelector('.filter-panel');
  filterToggle?.addEventListener('click', () => {
    const open = filterToggle.getAttribute('aria-expanded') !== 'true';
    filterToggle.setAttribute('aria-expanded', String(open));
    filterPanel?.classList.toggle('filters-open', open);
  });

  const render = () => {
    const category = categorySelect?.value || '';
    const brand = brandSelect?.value || '';
    const availability = availabilitySelect?.value || '';
    const minimum = Number(document.querySelector('#price-min')?.value || 0);
    const maximum = Number(document.querySelector('#price-max')?.value || Infinity);
    const rating = Number(document.querySelector('#rating-filter')?.value || 0);
    const sort = sortSelect?.value || 'default';
    filtered = catalog.filter(product =>
      (!category || product.category === category) &&
      (!brand || product.brand === brand) &&
      (!availability || product.availability === availability) &&
      (!searchQuery || `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase().includes(searchQuery)) &&
      (!dealsOnly || product.discount > 0) &&
      product.price >= minimum && product.price <= maximum && product.rating >= rating
    );
    if (sort === 'low') filtered.sort((a, b) => a.price - b.price);
    if (sort === 'high') filtered.sort((a, b) => b.price - a.price);
    if (sort === 'popular') filtered.sort((a, b) => b.reviews - a.reviews);
    if (sort === 'rating') filtered.sort((a, b) => b.rating - a.rating);
    grid.innerHTML = filtered.slice(0, visibleCount).map(productCard).join('') || '<div class="empty-state"><span>⌕</span><h2>No good things found.</h2><p>Try changing your search or filters.</p></div>';
    document.querySelector('#product-total').textContent = `${filtered.length} technology products${searchQuery ? ` matching “${searchQuery}”` : ''}${dealsOnly ? ' on offer' : ''}`;
    const loadMore = document.querySelector('#load-more');
    if (loadMore) loadMore.hidden = visibleCount >= filtered.length;
    const filters = document.querySelector('#active-filters');
    if (filters) {
      const labels = [];
      if (searchQuery) labels.push(`Search: ${searchQuery}`);
      if (category) labels.push(category);
      if (brand) labels.push(brand);
      if (availability) labels.push(availability);
      if (rating) labels.push(`${rating}+ stars`);
      if (minimum) labels.push(`From ${money(minimum)}`);
      if (Number.isFinite(maximum)) labels.push(`To ${money(maximum)}`);
      if (dealsOnly) labels.push('Sale');
      filters.innerHTML = labels.map(label => `<span>${escapeHTML(label)}</span>`).join('');
    }
  };
  document.querySelector('#apply-filters')?.addEventListener('click', () => {
    visibleCount = pageSize;
    render();
    filterPanel?.classList.remove('filters-open');
    filterToggle?.setAttribute('aria-expanded', 'false');
  });
  categorySelect?.addEventListener('change', () => { visibleCount = pageSize; render(); });
  brandSelect?.addEventListener('change', () => { visibleCount = pageSize; render(); });
  availabilitySelect?.addEventListener('change', () => { visibleCount = pageSize; render(); });
  document.querySelector('#rating-filter')?.addEventListener('change', () => { visibleCount = pageSize; render(); });
  sortSelect?.addEventListener('change', () => { visibleCount = pageSize; render(); });
  document.querySelector('#load-more')?.addEventListener('click', () => { visibleCount += 6; render(); });
  document.querySelector('#clear-filters')?.addEventListener('click', () => {
    if (categorySelect) categorySelect.value = '';
    if (brandSelect) brandSelect.value = '';
    if (availabilitySelect) availabilitySelect.value = '';
    document.querySelector('#rating-filter').value = '0';
    document.querySelector('#price-min').value = '';
    document.querySelector('#price-max').value = '';
    if (sortSelect) sortSelect.value = 'default';
    searchQuery = '';
    dealsOnly = false;
    history.replaceState(null, '', 'products.html');
    const searchInput = document.querySelector('#site-search');
    if (searchInput) searchInput.value = '';
    visibleCount = pageSize;
    render();
  });
  render();
  initComparison();
}

function initProductDetail() {
  const root = document.querySelector('#product-detail');
  if (!root) return;
  const id = new URLSearchParams(location.search).get('id');
  const product = (id ? productById(id) : catalog[0]);
  if (!product) {
    root.innerHTML = '<div class="empty-state"><h2>We couldn’t find that device.</h2><a class="button" href="products.html">Browse the technology collection ↗</a></div>';
    return;
  }
  const recent = readStorage(STORAGE.recentlyViewed, []).filter(item => item !== product.id);
  recent.unshift(product.id);
  writeStorage(STORAGE.recentlyViewed, recent.slice(0, 6));
  document.title = `${product.name} — Nova`;
  const breadcrumb = document.querySelector('#product-breadcrumb');
  if (breadcrumb) breadcrumb.innerHTML = `<a href="index.html">Home</a><span>›</span><a href="products.html">Shop</a><span>›</span><a href="products.html?category=${encodeURIComponent(product.category)}">${escapeHTML(product.category)}</a><span>›</span><span>${escapeHTML(product.name)}</span>`;
  const saved = getWishlist().includes(product.id);
  const gallery = [...new Set([product.image, ...product.gallery])];
  const unavailable = product.availability === 'Out of stock';
  root.innerHTML = `<div class="detail-layout"><div class="detail-gallery"><div class="detail-image"><img id="detail-main-image" src="${escapeHTML(gallery[0])}" alt="${escapeHTML(product.name)}"></div>${gallery.length > 1 ? `<div class="gallery-thumbnails">${gallery.map((image, index) => `<button type="button" class="${index === 0 ? 'selected' : ''}" data-gallery-image="${escapeHTML(image)}" aria-label="Show product image ${index + 1}"><img src="${escapeHTML(image)}" alt=""></button>`).join('')}</div>` : ''}<p class="image-caption">Representative product photography · Demo catalogue</p></div><div class="detail-copy"><p class="eyebrow">${escapeHTML(product.brand)} · ${escapeHTML(product.category)}</p><h1>${escapeHTML(product.name)}</h1><p class="detail-rating"><span>★ ${product.rating.toFixed(1)}</span><a href="#customer-reviews">${product.reviews} demo reviews</a></p><div class="detail-price"><strong>${money(product.price)}</strong>${product.originalPrice > product.price ? `<del>${money(product.originalPrice)}</del><span>${product.discount}% off</span>` : ''}</div><p class="detail-description">${escapeHTML(product.description)}</p><p class="availability ${unavailable ? 'out-of-stock' : ''}"><i></i>${escapeHTML(product.availability)} · Illustrative availability</p><div class="detail-actions"><label class="sr-only" for="detail-qty">Quantity</label><div class="quantity-control"><button type="button" data-qty-step="-1" aria-label="Decrease quantity" ${unavailable ? 'disabled' : ''}>−</button><input id="detail-qty" type="number" min="1" max="20" value="1" ${unavailable ? 'disabled' : ''}><button type="button" data-qty-step="1" aria-label="Increase quantity" ${unavailable ? 'disabled' : ''}>+</button></div><button class="button" type="button" id="detail-add" ${unavailable ? 'disabled' : ''}>Add to cart <span aria-hidden="true">↗</span></button><button class="wishlist-button detail-wishlist ${saved ? 'is-saved' : ''}" type="button" data-wishlist="${escapeHTML(product.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Remove from wishlist' : 'Add to wishlist'}">${saved ? '♥' : '♡'}</button></div><button class="buy-now-button" type="button" id="buy-now" ${unavailable ? 'disabled' : ''}>Buy now</button><div class="delivery-note"><span aria-hidden="true">↗</span><p><strong>Fast, tracked delivery.</strong><br>Delivery is free on demo orders over ${money(FREE_SHIPPING_MINIMUM)}. Delivery estimates are illustrative.</p></div><section class="spec-details"><h2>Specifications</h2><table class="specifications-table"><tbody>${product.specifications.map(specification => `<tr><th>${escapeHTML(specification.label)}</th><td>${escapeHTML(specification.value)}</td></tr>`).join('')}</tbody></table></section><details class="spec-details" id="customer-reviews"><summary>Ratings & reviews <span>★ ${product.rating.toFixed(1)} (${product.reviews})</span></summary><p class="muted">Ratings and review counts are sample demo data, not verified customer reviews.</p></details><p class="catalog-disclaimer">Product descriptions and specifications are illustrative samples. Confirm details with the manufacturer before purchase.</p></div></div>`;
  root.querySelectorAll('[data-gallery-image]').forEach(button => button.addEventListener('click', () => {
    root.querySelector('#detail-main-image').src = button.dataset.galleryImage;
    root.querySelectorAll('[data-gallery-image]').forEach(item => item.classList.toggle('selected', item === button));
  }));
  const quantityInput = root.querySelector('#detail-qty');
  root.querySelectorAll('[data-qty-step]').forEach(button => button.addEventListener('click', () => {
    quantityInput.value = String(Math.max(1, Math.min(20, Number(quantityInput.value || 1) + Number(button.dataset.qtyStep))));
  }));
  root.querySelector('#detail-add').addEventListener('click', () => addToCart(product.id, Math.max(1, Math.min(20, Number(quantityInput.value) || 1))));
  root.querySelector('#buy-now').addEventListener('click', () => {
    addToCart(product.id, Math.max(1, Math.min(20, Number(quantityInput.value) || 1)));
    location.href = 'checkout.html';
  });
  const related = document.querySelector('#related-products');
  const relatedSection = document.querySelector('#related-section');
  const recommendations = catalog.filter(item => item.id !== product.id && item.category === product.category).slice(0, 4);
  if (related && recommendations.length) {
    related.innerHTML = recommendations.map(productCard).join('');
    relatedSection.hidden = false;
  }
}

function cartTotals(cart, couponCode = '') {
  const subtotal = cart.reduce((sum, item) => sum + (productById(item.id)?.price || 0) * item.qty, 0);
  const coupon = couponCode.toUpperCase() === 'NOVA10' && subtotal >= 20000 ? Math.round(subtotal * 0.1) : 0;
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_MINIMUM ? 0 : SHIPPING_FEE;
  return { subtotal, discount: coupon, shipping, total: subtotal - coupon + shipping };
}

function renderCart() {
  const root = document.querySelector('#cart-content');
  if (!root) return;
  const cart = getCart();
  if (!cart.length) {
    root.innerHTML = '<div class="empty-cart"><div class="empty-cart-icon">✳</div><h2>A little room for something good.</h2><p>Your bag is taking a breather. Find something you love and bring it along.</p><a class="button" href="products.html">Explore the collection ↗</a></div>';
    return;
  }
  const couponCode = readStorage(STORAGE.coupon, '');
  const totals = cartTotals(cart, couponCode);
  const rows = cart.map(item => {
    const product = productById(item.id);
    if (!product) return '';
    return `<article class="cart-row"><a href="product.html?id=${encodeURIComponent(product.id)}" class="cart-thumb"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}"></a><div class="cart-item-details"><p class="product-category">${escapeHTML(product.category)}</p><h2><a href="product.html?id=${encodeURIComponent(product.id)}">${escapeHTML(product.name)}</a></h2><p>${money(product.price)} each</p><button class="remove-button" type="button" data-remove="${escapeHTML(product.id)}">Remove</button></div><div class="quantity-control cart-quantity"><button type="button" data-cart-step="-1" data-id="${escapeHTML(product.id)}" aria-label="Decrease ${escapeHTML(product.name)} quantity">−</button><input type="number" min="1" max="20" value="${item.qty}" data-cart-qty="${escapeHTML(product.id)}" aria-label="Quantity for ${escapeHTML(product.name)}"><button type="button" data-cart-step="1" data-id="${escapeHTML(product.id)}" aria-label="Increase ${escapeHTML(product.name)} quantity">+</button></div><strong class="cart-line-total">${money(product.price * item.qty)}</strong></article>`;
  }).join('');
  root.innerHTML = `<div class="cart-layout"><section class="cart-items"><div class="cart-list-heading"><span>ITEM</span><span>QUANTITY</span><span>TOTAL</span></div>${rows}<a class="text-link continue-shopping" href="products.html">← Keep looking around</a></section><aside class="cart-summary"><h2>A little summary</h2><div class="summary-lines"><div class="summary-line"><span>Subtotal</span><span>${money(totals.subtotal)}</span></div>${totals.discount ? `<div class="summary-line discount-line"><span>Nova welcome · ${escapeHTML(couponCode)}</span><span>−${money(totals.discount)}</span></div>` : ''}<div class="summary-line"><span>Delivery</span><span>${totals.shipping ? money(totals.shipping) : 'On us'}</span></div><div class="summary-line summary-total"><span>Total</span><strong>${money(totals.total)}</strong></div></div><p class="shipping-hint">${totals.subtotal >= FREE_SHIPPING_MINIMUM ? 'Lovely — delivery is on us.' : `Add ${money(FREE_SHIPPING_MINIMUM - totals.subtotal)} more for free delivery.`}</p><a class="button checkout-button" href="checkout.html">Continue to checkout ↗</a><p class="muted small">Demo checkout only — no payment is collected.</p><div class="cart-coupon"><label for="cart-coupon">Have a welcome code?</label><div><input id="cart-coupon" placeholder="Try NOVA10" value="${escapeHTML(couponCode)}"><button type="button" id="cart-apply-coupon">Apply</button></div><p id="cart-coupon-message" class="muted small" aria-live="polite"></p></div></aside></div>`;
  root.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
    saveCart(getCart().filter(item => item.id !== button.dataset.remove));
    renderCart();
    showToast('That item was removed from your bag.');
  }));
  root.querySelectorAll('[data-cart-qty]').forEach(input => input.addEventListener('change', () => updateCartQuantity(input.dataset.cartQty, input.value)));
  root.querySelectorAll('[data-cart-step]').forEach(button => button.addEventListener('click', () => {
    const item = getCart().find(entry => entry.id === button.dataset.id);
    if (item) updateCartQuantity(item.id, Number(item.qty) + Number(button.dataset.cartStep));
  }));
  root.querySelector('#cart-apply-coupon').addEventListener('click', () => applyCoupon(root.querySelector('#cart-coupon').value, root.querySelector('#cart-coupon-message'), renderCart));
}

function updateCartQuantity(id, quantity) {
  const value = Math.max(1, Math.min(20, Number(quantity) || 1));
  const cart = getCart();
  const item = cart.find(entry => entry.id === id);
  if (item) item.qty = value;
  saveCart(cart);
  renderCart();
}

function applyCoupon(value, messageNode, onApplied) {
  const code = value.trim().toUpperCase();
  const subtotal = cartTotals(getCart()).subtotal;
  if (code !== 'NOVA10') {
    messageNode.textContent = 'That code didn’t work. Try NOVA10.';
    messageNode.className = 'coupon-feedback error-text';
    return;
  }
  if (subtotal < 20000) {
    messageNode.textContent = 'NOVA10 is for demo orders of ₹20,000 or more.';
    messageNode.className = 'coupon-feedback error-text';
    return;
  }
  if (writeStorage(STORAGE.coupon, code)) {
    messageNode.textContent = 'A little treat — 10% off applied.';
    messageNode.className = 'coupon-feedback success-text';
    if (onApplied) onApplied();
    showToast('Your 10% welcome offer has been applied.');
  }
}

function initCheckout() {
  const form = document.querySelector('#checkout-form');
  if (!form) return;
  const cart = getCart();
  const empty = document.querySelector('#checkout-empty');
  if (!cart.length) {
    form.hidden = true;
    document.querySelector('.order-summary').hidden = true;
    empty.innerHTML = '<div class="inline-empty"><p>Your bag is empty. Add a little something before checking out.</p><a class="text-link" href="products.html">Explore the collection ↗</a></div>';
    return;
  }
  const couponInput = document.querySelector('#checkout-coupon');
  const couponMessage = document.querySelector('#checkout-coupon-message');
  couponInput.value = readStorage(STORAGE.coupon, '');
  document.querySelector('#checkout-apply-coupon').addEventListener('click', () => applyCoupon(couponInput.value, couponMessage, renderCheckoutSummary));
  form.querySelectorAll('[name="delivery"], [name="payment"]').forEach(input => input.addEventListener('change', renderCheckoutSummary));
  const sameAsShipping = form.querySelector('[name="sameAsShipping"]');
  const billingFields = document.querySelector('#billing-fields');
  const syncBillingFields = () => {
    billingFields.hidden = sameAsShipping.checked;
    billingFields.querySelectorAll('input').forEach(input => { input.required = !sameAsShipping.checked; });
  };
  sameAsShipping.addEventListener('change', syncBillingFields);
  syncBillingFields();
  form.querySelector('[name="payment"]').addEventListener('change', () => {
    document.querySelector('#payment-note').textContent = form.querySelector('[name="payment"]:checked').value === 'upi'
      ? 'UPI is shown as a demo choice only. No UPI ID, payment request, or transaction is created.'
      : 'No payment details are requested or processed by this demo.';
  });
  renderCheckoutSummary();

  function renderCheckoutSummary() {
    const currentCart = getCart();
    const totals = cartTotals(currentCart, readStorage(STORAGE.coupon, ''));
    const express = form.querySelector('[name="delivery"]:checked')?.value === 'express';
    const deliveryCharge = express ? 149 : totals.shipping;
    const finalTotal = totals.subtotal - totals.discount + deliveryCharge;
    document.querySelector('#checkout-summary').innerHTML = currentCart.map(item => {
      const product = productById(item.id);
      return product ? `<div class="checkout-item"><img src="${escapeHTML(product.image)}" alt=""><span>${escapeHTML(product.name)} <small>× ${item.qty}</small></span><strong>${money(product.price * item.qty)}</strong></div>` : '';
    }).join('');
    document.querySelector('#checkout-totals').innerHTML = `<div class="summary-line"><span>Subtotal</span><span>${money(totals.subtotal)}</span></div>${totals.discount ? `<div class="summary-line discount-line"><span>Welcome offer</span><span>−${money(totals.discount)}</span></div>` : ''}<div class="summary-line"><span>${express ? 'Express delivery' : 'Standard delivery'}</span><span>${deliveryCharge ? money(deliveryCharge) : 'On us'}</span></div><div class="summary-line summary-total"><span>Total</span><strong>${money(finalTotal)}</strong></div>`;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) {
      form.querySelector(':invalid')?.focus();
      return;
    }
    const currentCart = getCart();
    if (!currentCart.length) {
      showToast('Your bag is empty.', 'error');
      return;
    }
    const values = Object.fromEntries(new FormData(form).entries());
    const totals = cartTotals(currentCart, readStorage(STORAGE.coupon, ''));
    const deliveryCharge = values.delivery === 'express' ? 149 : totals.shipping;
    const order = {
      id: `NOVA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      date: new Date().toISOString(),
      total: totals.subtotal - totals.discount + deliveryCharge,
      items: currentCart.map(item => ({ ...item })),
      customer: { name: values.name.trim(), email: values.email.trim(), phone: values.phone.trim() },
      address: { address: values.address.trim(), city: values.city.trim(), pin: values.pin.trim() },
      billingAddress: values.sameAsShipping ? 'Same as delivery address' : {
        address: (values.billingAddress || '').trim(),
        city: (values.billingCity || '').trim(),
        pin: (values.billingPin || '').trim()
      },
      delivery: values.delivery,
      payment: values.payment,
      status: 'Demo order placed'
    };
    const orders = readStorage(STORAGE.orders, []);
    orders.unshift(order);
    if (!writeStorage(STORAGE.orders, orders)) return;
    saveCart([]);
    writeStorage(STORAGE.coupon, '');
    location.href = 'order-success.html';
  });
}

function initWishlistPage() {
  if (!document.querySelector('#wishlist-content')) return;
  renderWishlist();
}

function renderWishlist() {
  const root = document.querySelector('#wishlist-content');
  if (!root) return;
  const products = getWishlist().map(productById).filter(Boolean);
  root.innerHTML = products.length
    ? `<section class="product-grid wishlist-grid">${products.map(product => productCard(product, { moveFromWishlist: true })).join('')}</section>`
    : '<div class="empty-cart"><div class="empty-cart-icon"><span class="wishlist-empty-icon" aria-hidden="true"></span></div><h2>Your next favourite is out there.</h2><p>Your wishlist is empty. Browse the demo collection and save a device to find it here.</p><a class="button" href="products.html">Explore NOVA tech ↗</a></div>';
}

function initContactForm() {
  const form = document.querySelector('#contact-form');
  if (!form) return;
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    const messages = readStorage(STORAGE.messages, []);
    messages.push({ ...values, sentAt: new Date().toISOString() });
    if (writeStorage(STORAGE.messages, messages)) {
      form.reset();
      const message = document.querySelector('#contact-message');
      if (message) message.textContent = 'Thanks! Your demo message is saved in this browser only.';
      showToast('Your note is saved in this browser. Thanks for getting in touch.');
    }
  });
}

function initAuthPages() {
  document.querySelectorAll('.password-toggle').forEach(button => button.addEventListener('click', () => {
    const input = button.parentElement.querySelector('input');
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.textContent = reveal ? 'Hide' : 'Show';
    button.setAttribute('aria-label', `${reveal ? 'Hide' : 'Show'} password`);
  }));
  const login = document.querySelector('#login-form');
  if (login) login.addEventListener('submit', event => {
    event.preventDefault();
    if (!login.reportValidity()) return;
    const data = new FormData(login);
    const email = data.get('email').toString().trim().toLowerCase();
    const previous = readStorage(STORAGE.profile, {});
    const profile = { name: previous.name || email.split('@')[0], email, remembered: data.has('remember') };
    if (!writeStorage(STORAGE.profile, profile)) return;
    document.querySelector('#login-message').textContent = 'You’re in — taking you to your demo account.';
    window.setTimeout(() => { location.href = 'account.html'; }, 500);
  });
  const register = document.querySelector('#register-form');
  if (register) register.addEventListener('submit', event => {
    event.preventDefault();
    if (!register.reportValidity()) return;
    const data = new FormData(register);
    const profile = { name: data.get('name').toString().trim(), email: data.get('email').toString().trim().toLowerCase(), remembered: true };
    if (!writeStorage(STORAGE.profile, profile)) return;
    document.querySelector('#register-message').textContent = 'Your demo profile is ready. Taking you there now.';
    window.setTimeout(() => { location.href = 'account.html'; }, 500);
  });
  const forgot = document.querySelector('#forgot-password');
  if (forgot) forgot.addEventListener('click', openForgotModal);
}

function openForgotModal() {
  const root = document.querySelector('#forgot-modal-root');
  root.innerHTML = `<div class="modal-backdrop"><section class="forgot-modal" role="dialog" aria-modal="true" aria-labelledby="forgot-title"><button class="modal-close" type="button" aria-label="Close">×</button><p class="eyebrow">A QUICK NOTE</p><h2 id="forgot-title">Forgot your <em>password?</em></h2><p class="muted">Demo accounts don’t have real passwords. No reset email will be sent.</p><form id="forgot-form"><label>Email address<input name="email" type="email" required></label><button class="button" type="submit">Got it ↗</button></form></section></div>`;
  root.querySelector('.modal-close').addEventListener('click', () => { root.innerHTML = ''; });
  root.querySelector('.modal-backdrop').addEventListener('click', event => {
    if (event.target === event.currentTarget) root.innerHTML = '';
  });
  root.querySelector('#forgot-form').addEventListener('submit', event => {
    event.preventDefault();
    root.innerHTML = '<p class="inline-empty">No reset was sent — this is a demo account with no stored password.</p>';
    window.setTimeout(() => { root.innerHTML = ''; }, 2500);
  });
}

function initAccount() {
  const root = document.querySelector('.account-page');
  if (!root) return;
  const profile = readStorage(STORAGE.profile, null);
  if (!profile) {
    location.replace('login.html');
    return;
  }
  const name = profile.name || 'Nova friend';
  document.querySelector('#account-greeting').textContent = `${name.split(' ')[0]}.`;
  document.querySelector('#profile-name').textContent = name;
  document.querySelector('#profile-email').textContent = profile.email || '';
  const profileForm = document.querySelector('#profile-form');
  document.querySelector('#edit-profile').addEventListener('click', () => {
    profileForm.name.value = name;
    profileForm.email.value = profile.email || '';
    profileForm.hidden = false;
    document.querySelector('#profile-view').hidden = true;
  });
  document.querySelector('#cancel-profile').addEventListener('click', () => {
    profileForm.hidden = true;
    document.querySelector('#profile-view').hidden = false;
  });
  profileForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!profileForm.reportValidity()) return;
    const updated = { ...profile, name: profileForm.name.value.trim(), email: profileForm.email.value.trim().toLowerCase() };
    if (!writeStorage(STORAGE.profile, updated)) return;
    showToast('Your demo profile has been updated.');
    location.reload();
  });
  const addressForm = document.querySelector('#address-form');
  const address = readStorage(STORAGE.address, null);
  const addressView = document.querySelector('#address-view');
  const renderAddress = value => {
    addressView.innerHTML = value ? `<p>${escapeHTML(value.address)}</p><p class="muted">${escapeHTML(value.city)} · ${escapeHTML(value.pin)}</p>` : '<p class="muted">No saved address yet.</p>';
  };
  renderAddress(address);
  document.querySelector('#edit-address').addEventListener('click', () => {
    if (address) {
      addressForm.address.value = address.address;
      addressForm.city.value = address.city;
      addressForm.pin.value = address.pin;
    }
    addressForm.hidden = false;
    addressView.hidden = true;
  });
  document.querySelector('#cancel-address').addEventListener('click', () => {
    addressForm.hidden = true;
    addressView.hidden = false;
  });
  addressForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!addressForm.reportValidity()) return;
    const values = Object.fromEntries(new FormData(addressForm).entries());
    if (!writeStorage(STORAGE.address, values)) return;
    addressForm.hidden = true;
    addressView.hidden = false;
    renderAddress(values);
    showToast('Your demo address has been saved.');
  });
  const orders = readStorage(STORAGE.orders, []);
  const orderHistory = document.querySelector('#order-history');
  orderHistory.innerHTML = orders.length ? orders.slice(0, 5).map(order => `<div class="history-row"><div><strong>${escapeHTML(order.id)}</strong><small>${new Date(order.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })} · ${order.items.reduce((sum, item) => sum + item.qty, 0)} item(s)</small></div><span>${money(order.total)}</span></div>`).join('') : '<p class="muted">No demo orders just yet. Your next favourite could be around the corner.</p><a class="text-link" href="products.html">Find something good ↗</a>';
  document.querySelector('#logout-button').addEventListener('click', () => {
    try { localStorage.removeItem(STORAGE.profile); } catch (error) {
      console.error('Could not clear the demo profile.', error);
      showToast('Could not log out. Please check this browser’s storage settings.', 'error');
      return;
    }
    location.href = 'index.html';
  });
}

function initOrderConfirmation() {
  const root = document.querySelector('#order-confirmation');
  if (!root) return;
  const orders = readStorage(STORAGE.orders, []);
  const order = orders[0];
  root.innerHTML = order ? `<div class="confirmation-heading"><span>YOUR DEMO ORDER</span><strong>${escapeHTML(order.id)}</strong></div><p>Thanks, ${escapeHTML(order.customer.name)}. Here’s the little summary:</p>${order.items.map(item => {
    const product = productById(item.id);
    return product ? `<div class="confirmation-item"><span>${escapeHTML(product.name)} <small>× ${item.qty}</small></span><strong>${money(product.price * item.qty)}</strong></div>` : '';
  }).join('')}<div class="confirmation-total"><span>Demo total</span><strong>${money(order.total)}</strong></div><p class="muted small">Delivery to ${escapeHTML(order.address.city)} · ${escapeHTML(order.address.pin)} · ${order.payment === 'upi' ? 'UPI demo choice' : 'Cash on delivery demo'}</p>` : '<p>No recent demo order was found. <a href="products.html">Start with something lovely ↗</a></p>';
}

function toggleCompare(id) {
  let selected = readStorage(STORAGE.compare, []);
  if (!Array.isArray(selected)) selected = [];
  if (selected.includes(id)) selected = selected.filter(item => item !== id);
  else if (selected.length >= 3) {
    showToast('Compare up to three things at once.', 'error');
    return;
  } else selected.push(id);
  if (writeStorage(STORAGE.compare, selected)) {
    document.querySelectorAll('[data-compare]').forEach(button => {
      const active = selected.includes(button.dataset.compare);
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    renderCompareBar();
  }
}

function initComparison() {
  renderCompareBar();
}

function renderCompareBar() {
  let root = document.querySelector('#compare-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'compare-root';
    document.body.append(root);
  }
  const selected = readStorage(STORAGE.compare, []).map(productById).filter(Boolean);
  root.innerHTML = selected.length ? `<div class="compare-bar"><span>${selected.length} of 3 chosen to compare</span><div>${selected.map(product => `<span>${escapeHTML(product.name)}</span>`).join('')}</div><button type="button" id="compare-now" ${selected.length < 2 ? 'disabled' : ''}>Compare ↗</button><button class="compare-clear" id="compare-clear" type="button">Clear</button></div>` : '';
  root.querySelector('#compare-now')?.addEventListener('click', openCompareModal);
  root.querySelector('#compare-clear')?.addEventListener('click', () => {
    writeStorage(STORAGE.compare, []);
    document.querySelectorAll('[data-compare]').forEach(button => {
      button.classList.remove('is-selected');
      button.setAttribute('aria-pressed', 'false');
    });
    renderCompareBar();
  });
}

function openCompareModal() {
  const selected = readStorage(STORAGE.compare, []).map(productById).filter(Boolean);
  if (selected.length < 2) return;
  let root = document.querySelector('#compare-root');
  const tableRows = [
    ['Price', product => money(product.price)],
    ['Rating', product => `★ ${product.rating.toFixed(1)} (${product.reviews} reviews)`],
    ['Category', product => escapeHTML(product.category)],
    ['Availability', product => escapeHTML(product.availability)],
    ['Details', product => escapeHTML(product.description)]
  ];
  root.insertAdjacentHTML('beforeend', `<div class="modal-backdrop compare-modal-backdrop"><section class="compare-modal" role="dialog" aria-modal="true" aria-labelledby="compare-title"><button class="modal-close" type="button" aria-label="Close comparison">×</button><p class="eyebrow">A SIDE-BY-SIDE LOOK</p><h2 id="compare-title">Find your <em>favourite.</em></h2><div class="compare-table"><div class="compare-table-row compare-names"><span>Details</span>${selected.map(product => `<strong>${escapeHTML(product.name)}</strong>`).join('')}</div>${tableRows.map(([label, getter]) => `<div class="compare-table-row"><span>${label}</span>${selected.map(product => `<span>${getter(product)}</span>`).join('')}</div>`).join('')}</div></section></div>`);
  const backdrop = root.querySelector('.compare-modal-backdrop');
  backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.remove(); });
  backdrop.querySelector('.modal-close').addEventListener('click', () => backdrop.remove());
}

async function startStorefront() {
  initSharedLayout();
  initGlobalInteractions();
  await loadProducts();
  renderCategoryNavigation();
  const productIds = new Set(catalog.map(product => product.id));
  const savedCart = getCart();
  const validCart = savedCart.filter(item => productIds.has(String(item.id)));
  if (validCart.length !== savedCart.length) {
    saveCart(validCart);
    showToast('Saved items from the previous demo catalogue were removed.');
  }
  const savedWishlist = getWishlist();
  const validWishlist = savedWishlist.filter(id => productIds.has(id));
  if (validWishlist.length !== savedWishlist.length && writeStorage(STORAGE.wishlist, validWishlist)) updateHeaderCounts();
  const savedCompare = readStorage(STORAGE.compare, []);
  if (Array.isArray(savedCompare) && savedCompare.some(id => !productIds.has(id))) {
    writeStorage(STORAGE.compare, savedCompare.filter(id => productIds.has(id)));
  }
  initHome();
  initProductsPage();
  initProductDetail();
  renderCart();
  initCheckout();
  initWishlistPage();
  initContactForm();
  initAuthPages();
  initAccount();
  initOrderConfirmation();
  updateHeaderCounts();
}

document.addEventListener('DOMContentLoaded', startStorefront);
