const titleEl = document.getElementById('care-title');
const subtitleEl = document.getElementById('care-subtitle');
const careGrid = document.getElementById('care-grid');
const careNotes = document.getElementById('care-notes');
const careImage = document.getElementById('care-image');

const BASE_PATH = detectBasePath();
const API_BASE = detectApiBase();
const DEFAULT_IMAGE_URL = detectDefaultImageUrl();
const token = getTokenFromPath();

init();

async function init() {
  if (!token) {
    renderError('Token de cuidado inválido.');
    return;
  }

  try {
    const result = await fetchJson(`${API_BASE}/care/${encodeURIComponent(token)}`);
    renderCare(result.data);
  } catch (error) {
    renderError(error.message);
  }
}

function renderCare(data) {
  const plant = data.plant || {};

  titleEl.textContent = plant.name || 'Planta';
  subtitleEl.textContent = `Compra registrada para ${data.customer_name || 'cliente'} el ${formatDate(data.sale_date)}.`;
  careImage.src = plant.image_url || DEFAULT_IMAGE_URL;

  const blocks = [
    ['Código', plant.code || 'No especificado'],
    ['Descripción', plant.description || 'Sin descripción'],
    ['Tipo de luz', plant.light_type || 'No especificado'],
    ['Riego', plant.watering || 'No especificado'],
    ['Ubicación', plant.location || 'No especificado'],
    ['Temperatura ideal', plant.temperature_range || 'No especificado'],
    ['Humedad ideal', plant.humidity || 'No especificado'],
    ['Sustrato', plant.substrate || 'No especificado'],
    ['Fertilización', plant.fertilization || 'No especificado'],
    ['Poda', plant.pruning || 'No especificado'],
    ['Plagas frecuentes', plant.pests || 'No especificado'],
    ['Toxicidad', plant.toxicity || 'No especificado'],
    ['Apta para mascotas', plant.pet_friendly ? 'Sí' : 'No'],
    ['Planta venenosa', plant.poisonous ? 'Sí' : 'No'],
  ];

  careGrid.innerHTML = blocks
    .map(
      ([label, value]) => `
      <article class="care-item">
        <h3>${escapeHtml(label)}</h3>
        <p>${escapeHtml(value)}</p>
      </article>
    `
    )
    .join('');

  careNotes.innerHTML = `
    <h3>Cuidado específico</h3>
    <p>${escapeHtml(plant.specific_care || 'Sin cuidado específico registrado.')}</p>
    <h3>Factores adicionales</h3>
    <p>${escapeHtml(plant.extra_factors || 'Sin factores extra registrados.')}</p>
    <p><strong>Cantidad comprada:</strong> ${Number(data.quantity || 1)}</p>
  `;
}

function renderError(message) {
  titleEl.textContent = 'No se pudo cargar la guía';
  subtitleEl.textContent = message;
  careImage.src = DEFAULT_IMAGE_URL;
  careGrid.innerHTML = '';
  careNotes.innerHTML = '<p>Verifica el enlace o solicita uno nuevo en tienda.</p>';
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Error al cargar la guía de cuidado.');
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

function getTokenFromPath() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  return segments.length ? segments[segments.length - 1] : '';
}

function formatDate(value) {
  if (!value) {
    return 'fecha no disponible';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'fecha no disponible';
  }
  return date.toLocaleString('es-CL');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
