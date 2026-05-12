const state = {
  plants: [],
  filteredPlants: [],
  selectedPlantId: 0,
  cart: [],
};

const BASE_PATH = detectBasePath();
const API_BASE = detectApiBase();
const DEFAULT_IMAGE_URL = detectDefaultImageUrl();

const searchInput = document.getElementById('plant-search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const catalogGrid = document.getElementById('catalog-grid');
const carePanel = document.getElementById('care-panel');
const careSubtitle = document.getElementById('care-subtitle');
const careContent = document.getElementById('care-content');
const careTokenInput = document.getElementById('care-token-input');
const openCareBtn = document.getElementById('open-care-btn');
const cartItems = document.getElementById('cart-items');
const cartTotalAmount = document.getElementById('cart-total-amount');
const checkoutForm = document.getElementById('checkout-form');
const customerNameInput = document.getElementById('customer-name');
const customerPhoneInput = document.getElementById('customer-phone');
const customerEmailInput = document.getElementById('customer-email');
const orderNotesInput = document.getElementById('order-notes');
const orderResult = document.getElementById('order-result');
const toast = document.getElementById('store-toast');

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  renderCart();
  loadPlants();
});

function bindEvents() {
  searchInput.addEventListener('input', () => {
    applyCatalogFilter();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    applyCatalogFilter();
    searchInput.focus();
  });

  openCareBtn.addEventListener('click', onOpenCareClick);

  careTokenInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    onOpenCareClick();
  });

  catalogGrid.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const plantId = Number(button.dataset.id);
    if (!Number.isInteger(plantId) || plantId <= 0) {
      return;
    }

    if (button.dataset.action === 'care') {
      showPlantCare(plantId);
      return;
    }

    if (button.dataset.action === 'add') {
      addToCart(plantId);
    }
  });

  cartItems.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const plantId = Number(button.dataset.id);
    if (!Number.isInteger(plantId) || plantId <= 0) {
      return;
    }

    if (button.dataset.action === 'inc') {
      updateCartQuantity(plantId, 1);
      return;
    }

    if (button.dataset.action === 'dec') {
      updateCartQuantity(plantId, -1);
      return;
    }

    if (button.dataset.action === 'remove') {
      removeFromCart(plantId);
    }
  });

  checkoutForm.addEventListener('submit', onCheckoutSubmit);
}

async function loadPlants() {
  try {
    const result = await fetchJson(`${API_BASE}/plants`);
    const plants = Array.isArray(result.data) ? result.data : [];
    state.plants = plants
      .map((plant) => ({
        ...plant,
        price: Number(plant.price) || 0,
      }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));

    applyCatalogFilter();
  } catch (error) {
    renderCatalogError(error.message || 'No se pudo cargar el catálogo.');
  }
}

function applyCatalogFilter() {
  const query = String(searchInput.value || '').trim().toLowerCase();
  if (!query) {
    state.filteredPlants = [...state.plants];
    renderCatalog();
    return;
  }

  state.filteredPlants = state.plants.filter((plant) => {
    const haystack = [
      plant.code,
      plant.name,
      plant.description,
      plant.light_type,
      plant.watering,
      plant.location,
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');

    return haystack.includes(query);
  });

  renderCatalog();
}

function renderCatalog() {
  if (state.filteredPlants.length === 0) {
    catalogGrid.innerHTML = '<p class="cart-empty">No encontramos plantas para esa búsqueda.</p>';
    return;
  }

  catalogGrid.innerHTML = state.filteredPlants.map((plant) => renderPlantCard(plant)).join('');
}

function renderCatalogError(message) {
  catalogGrid.innerHTML = `<p class="cart-empty">${escapeHtml(message)}</p>`;
}

function renderPlantCard(plant) {
  return `
    <article class="plant-card">
      <img class="plant-photo" src="${escapeHtml(plant.image_url || DEFAULT_IMAGE_URL)}" alt="${escapeHtml(plant.name || 'Planta')}" />
      <div class="plant-body">
        <div class="plant-meta">
          <div>
            <p class="plant-code">${escapeHtml(plant.code || 'SIN-CODIGO')}</p>
            <h3 class="plant-name">${escapeHtml(plant.name || 'Planta')}</h3>
          </div>
          <span class="plant-price">${formatMoney(plant.price)}</span>
        </div>
        <div class="plant-chip-row">
          <span class="chip">${escapeHtml(plant.light_type || 'Luz no especificada')}</span>
          <span class="chip">${escapeHtml(plant.location || 'Ubicación no especificada')}</span>
        </div>
        <div class="plant-actions">
          <button type="button" class="btn btn-soft" data-action="care" data-id="${plant.id}">Ver cuidados</button>
          <button type="button" class="btn btn-primary" data-action="add" data-id="${plant.id}">Agregar</button>
        </div>
      </div>
    </article>
  `;
}

function showPlantCare(plantId) {
  const plant = state.plants.find((item) => Number(item.id) === Number(plantId));
  if (!plant) {
    return;
  }

  state.selectedPlantId = Number(plant.id);
  careSubtitle.textContent = `${plant.name || 'Planta'} (${plant.code || 'SIN-CODIGO'})`;

  const details = [
    ['Descripción', plant.description || 'Sin descripción'],
    ['Tipo de luz', plant.light_type || 'No especificado'],
    ['Riego', plant.watering || 'No especificado'],
    ['Interior / Exterior', plant.location || 'No especificado'],
    ['Temperatura ideal', plant.temperature_range || 'No especificado'],
    ['Humedad ideal', plant.humidity || 'No especificado'],
    ['Sustrato', plant.substrate || 'No especificado'],
    ['Fertilización', plant.fertilization || 'No especificado'],
    ['Poda', plant.pruning || 'No especificado'],
    ['Plagas frecuentes', plant.pests || 'No especificado'],
    ['Toxicidad', plant.toxicity || 'No especificado'],
    ['Apta para mascotas', Number(plant.pet_friendly) === 1 ? 'Sí' : 'No'],
    ['Planta venenosa', Number(plant.poisonous) === 1 ? 'Sí' : 'No'],
    ['Cuidado específico', plant.specific_care || 'Sin cuidado específico'],
    ['Factores adicionales', plant.extra_factors || 'Sin factores adicionales'],
  ];

  const detailHtml = details
    .map(
      ([label, value]) => `
        <article class="care-item">
          <h4>${escapeHtml(label)}</h4>
          <p>${escapeHtml(value)}</p>
        </article>
      `
    )
    .join('');

  careContent.innerHTML = `
    <div class="care-content">
      <img class="plant-photo" src="${escapeHtml(plant.image_url || DEFAULT_IMAGE_URL)}" alt="${escapeHtml(plant.name || 'Planta')}" />
      <div class="care-grid">${detailHtml}</div>
    </div>
  `;

  carePanel.classList.remove('hidden');
  carePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function addToCart(plantId) {
  const plant = state.plants.find((item) => Number(item.id) === Number(plantId));
  if (!plant) {
    return;
  }

  const existing = state.cart.find((item) => Number(item.plant_id) === Number(plantId));
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      plant_id: Number(plant.id),
      code: String(plant.code || ''),
      name: String(plant.name || 'Planta'),
      price: Number(plant.price) || 0,
      quantity: 1,
    });
  }

  renderCart();
  showToast(`${plant.name} agregada al carrito.`);
}

function updateCartQuantity(plantId, delta) {
  const item = state.cart.find((x) => Number(x.plant_id) === Number(plantId));
  if (!item) {
    return;
  }

  item.quantity += Number(delta);
  if (item.quantity <= 0) {
    removeFromCart(plantId);
    return;
  }

  renderCart();
}

function removeFromCart(plantId) {
  state.cart = state.cart.filter((item) => Number(item.plant_id) !== Number(plantId));
  renderCart();
}

function renderCart() {
  if (state.cart.length === 0) {
    cartItems.innerHTML = '<p class="cart-empty">Aún no agregas plantas al pedido.</p>';
    cartTotalAmount.textContent = formatMoney(0);
    return;
  }

  let total = 0;
  const rows = state.cart
    .map((item) => {
      const subtotal = Number(item.price) * Number(item.quantity);
      total += subtotal;

      return `
        <article class="cart-row">
          <div class="cart-top">
            <strong>${escapeHtml(item.code)} | ${escapeHtml(item.name)}</strong>
            <span>${formatMoney(subtotal)}</span>
          </div>
          <small>${formatMoney(item.price)} c/u</small>
          <div class="cart-qty">
            <button type="button" class="qty-btn" data-action="dec" data-id="${item.plant_id}">-</button>
            <button type="button" class="qty-btn" data-action="inc" data-id="${item.plant_id}">+</button>
            <button type="button" class="btn btn-soft" data-action="remove" data-id="${item.plant_id}">Quitar</button>
          </div>
        </article>
      `;
    })
    .join('');

  cartItems.innerHTML = rows;
  cartTotalAmount.textContent = formatMoney(total);
}

function onOpenCareClick() {
  const rawInput = String(careTokenInput.value || '').trim();
  if (!rawInput) {
    showToast('Ingresa tu enlace o código de cuidado.', true);
    careTokenInput.focus();
    return;
  }

  const normalizedCode = normalizePlantCode(rawInput);
  const plantByCode = state.plants.find((plant) => normalizePlantCode(plant.code) === normalizedCode);
  if (plantByCode) {
    showPlantCare(plantByCode.id);
    showToast('Mostrando cuidados base de la planta.');
    return;
  }

  const plantByName = state.plants.find((plant) =>
    String(plant.name || '')
      .toLowerCase()
      .includes(rawInput.toLowerCase())
  );
  if (plantByName) {
    showPlantCare(plantByName.id);
    showToast('Mostrando cuidados base de la planta.');
    return;
  }

  const token = extractCareToken(rawInput);
  if (token) {
    const careUrl = `${window.location.origin}${joinWithBasePath(`/care/${encodeURIComponent(token)}`)}`;
    window.location.href = careUrl;
    return;
  }

  showToast('No encontramos ese código o enlace. Revisa e intenta nuevamente.', true);
}

function extractCareToken(value) {
  const input = String(value || '').trim();
  if (!input) {
    return '';
  }

  const carePathMatch = input.match(/\/care\/([^/?#]+)/i);
  if (carePathMatch && carePathMatch[1]) {
    return decodeURIComponent(carePathMatch[1]);
  }

  if (/^[a-z0-9_-]{8,120}$/i.test(input)) {
    return input;
  }

  return '';
}

async function onCheckoutSubmit(event) {
  event.preventDefault();

  if (state.cart.length === 0) {
    showToast('Tu carrito está vacío. Agrega al menos una planta.', true);
    return;
  }

  const customerName = String(customerNameInput.value || '').trim();
  const customerPhone = String(customerPhoneInput.value || '').trim();
  const customerEmail = String(customerEmailInput.value || '').trim();
  const extraNotes = String(orderNotesInput.value || '').trim();

  if (!customerName || customerName.length < 2) {
    showToast('Ingresa tu nombre para enviar el pedido.', true);
    customerNameInput.focus();
    return;
  }

  if (!customerPhone || customerPhone.length < 6) {
    showToast('Ingresa un teléfono o WhatsApp válido.', true);
    customerPhoneInput.focus();
    return;
  }

  const payload = {
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail || null,
    notes: `[WEB_PEDIDO] ${extraNotes || 'Pedido enviado desde vitrina pública.'}`,
    items: state.cart.map((item) => ({
      plant_id: Number(item.plant_id),
      code: String(item.code || ''),
      quantity: Number(item.quantity),
    })),
  };

  try {
    const result = await fetchJson(`${API_BASE}/sales`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    renderOrderResult(result.data || {});
    checkoutForm.reset();
    state.cart = [];
    renderCart();
    showToast('Pedido enviado con éxito.');
  } catch (error) {
    showToast(error.message || 'No se pudo enviar el pedido.', true);
  }
}

function renderOrderResult(data) {
  const saleId = Number(data.sale_id || 0);
  const total = Number(data.total || 0);
  const items = Array.isArray(data.items) ? data.items : [];

  const links = items
    .map((item) => {
      const plantName = escapeHtml(item.plant_name || 'Planta');
      const qty = Number(item.quantity || 0);
      const careUrl = escapeHtml(item.care_url || '');
      if (!careUrl) {
        return '';
      }
      return `<li>${plantName} (x${qty}): <a href="${careUrl}" target="_blank" rel="noreferrer">${careUrl}</a></li>`;
    })
    .filter(Boolean)
    .join('');

  orderResult.innerHTML = `
    <h3>Pedido recibido #${saleId > 0 ? saleId : '-'}</h3>
    <p>Total estimado: <strong>${formatMoney(total)}</strong></p>
    <p>Te contactaremos para confirmar disponibilidad y entrega.</p>
    ${links ? `<p><strong>Enlaces de cuidado:</strong></p><ul>${links}</ul>` : ''}
  `;
  orderResult.classList.remove('hidden');
}

async function fetchJson(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  if (!headers['Content-Type'] && options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.detail || 'Error en la solicitud.');
  }

  return data;
}

function detectApiBase() {
  return `${window.location.origin}${joinWithBasePath('/api')}`;
}

function detectDefaultImageUrl() {
  return `${window.location.origin}${joinWithBasePath('/img/logo/ICONO%202.png')}`;
}

function detectBasePath() {
  const injectedBasePath =
    typeof window !== 'undefined' && typeof window.__JARDINI_BASE_PATH__ === 'string'
      ? window.__JARDINI_BASE_PATH__
      : '';

  return normalizeBasePath(injectedBasePath);
}

function joinWithBasePath(pathname) {
  const cleanPath = `/${String(pathname || '').replace(/^\/+/, '')}`;
  return `${BASE_PATH}${cleanPath}`;
}

function normalizeBasePath(value) {
  const clean = String(value || '').trim();
  if (!clean || clean === '/') {
    return '';
  }

  const withSlash = clean.startsWith('/') ? clean : `/${clean}`;
  return withSlash.replace(/\/+$/, '');
}

function normalizePlantCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-');
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.style.background = isError ? '#8f2f2a' : '#0a5d3f';
  toast.classList.remove('hidden');

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.add('hidden');
  }, 3200);
}
