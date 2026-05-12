const state = {
  plants: [],
  sales: [],
  editingPlantId: null,
  saleCart: [],
};

const BASE_PATH = detectBasePath();
const API_BASE = detectApiBase();
const DEFAULT_IMAGE_URL = detectDefaultImageUrl();

const tabs = document.querySelectorAll('.tab');
const panels = {
  dashboard: document.getElementById('section-dashboard'),
  plants: document.getElementById('section-plants'),
  sales: document.getElementById('section-sales'),
};

const statPlants = document.getElementById('stat-plants');
const statSales = document.getElementById('stat-sales');
const statIncome = document.getElementById('stat-income');

const plantForm = document.getElementById('plant-form');
const plantIdInput = document.getElementById('plant-id');
const savePlantBtn = document.getElementById('save-plant-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const plantsTbody = document.getElementById('plants-tbody');
const plantImageInput = document.getElementById('plant_image');
const plantImagePreview = document.getElementById('plant-image-preview');
const resetImageCheckbox = document.getElementById('reset_image');

const saleForm = document.getElementById('sale-form');
const saleItemsContainer = document.getElementById('sale-items');
const saleCodeInput = document.getElementById('sale_plant_code');
const saleQtyInput = document.getElementById('sale_qty');
const addByCodeBtn = document.getElementById('add-by-code-btn');
const scanCodeBtn = document.getElementById('scan-code-btn');
const toggleCustomerBtn = document.getElementById('toggle-customer-btn');
const customerFields = document.getElementById('customer-fields');
const salesTbody = document.getElementById('sales-tbody');
const saleResultCard = document.getElementById('sale-result-card');
const saleResultSummary = document.getElementById('sale-result-summary');
const careLinksList = document.getElementById('care-links');
const saleDetailCard = document.getElementById('sale-detail-card');
const saleDetailContent = document.getElementById('sale-detail-content');

const toast = document.getElementById('toast');
let plantPreviewObjectUrl = '';
const scannerState = {
  active: false,
  detecting: false,
  detector: null,
  stream: null,
  modal: null,
  video: null,
  guide: null,
  fallbackHost: null,
  status: null,
  rafId: 0,
  html5Qrcode: null,
  html5QrcodeScanner: null,
};

document.addEventListener('DOMContentLoaded', () => {
  configureScannerAvailability();
  bindTabs();
  bindPlantEvents();
  bindPlantImageEvents();
  bindSaleEvents();
  renderSaleCart();
  setPlantPreview(DEFAULT_IMAGE_URL);
  refreshAll();
});

window.addEventListener('beforeunload', () => {
  stopScannerSession();
});

async function refreshAll() {
  await Promise.all([loadStats(), loadPlants(), loadSales()]);
}

function bindTabs() {
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.remove('active'));
      tab.classList.add('active');

      Object.values(panels).forEach((panel) => panel.classList.remove('active'));
      const target = tab.dataset.section;
      if (panels[target]) {
        panels[target].classList.add('active');
      }
    });
  });
}

function bindPlantEvents() {
  plantForm.addEventListener('submit', onPlantSubmit);
  cancelEditBtn.addEventListener('click', resetPlantForm);

  plantsTbody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const plantId = Number(button.dataset.id);
    if (!plantId) {
      return;
    }

    if (button.dataset.action === 'edit') {
      startPlantEdit(plantId);
    }

    if (button.dataset.action === 'delete') {
      await deletePlant(plantId);
    }
  });
}

function bindPlantImageEvents() {
  plantImageInput.addEventListener('change', () => {
    const file = plantImageInput.files && plantImageInput.files[0] ? plantImageInput.files[0] : null;
    if (!file) {
      if (state.editingPlantId) {
        const current = state.plants.find((item) => Number(item.id) === Number(state.editingPlantId));
        setPlantPreview(current && current.image_url ? current.image_url : DEFAULT_IMAGE_URL);
      } else {
        setPlantPreview(DEFAULT_IMAGE_URL);
      }
      return;
    }

    resetImageCheckbox.checked = false;
    setPlantPreview(URL.createObjectURL(file), true);
  });

  resetImageCheckbox.addEventListener('change', () => {
    if (!resetImageCheckbox.checked) {
      if (state.editingPlantId) {
        const current = state.plants.find((item) => Number(item.id) === Number(state.editingPlantId));
        setPlantPreview(current && current.image_url ? current.image_url : DEFAULT_IMAGE_URL);
      }
      return;
    }

    plantImageInput.value = '';
    setPlantPreview(DEFAULT_IMAGE_URL);
  });
}

function bindSaleEvents() {
  addByCodeBtn.addEventListener('click', onAddByCodeClick);
  if (scanCodeBtn && !scanCodeBtn.classList.contains('hidden')) {
    scanCodeBtn.addEventListener('click', onScanCodeClick);
  }
  toggleCustomerBtn.addEventListener('click', toggleCustomerFields);
  saleForm.addEventListener('submit', onSaleSubmit);

  saleCodeInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    onAddByCodeClick();
  });

  saleItemsContainer.addEventListener('click', (event) => {
    const removeButton = event.target.closest('button[data-action="remove-cart-item"]');
    if (!removeButton) {
      return;
    }

    const index = Number(removeButton.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= state.saleCart.length) {
      return;
    }

    state.saleCart.splice(index, 1);
    renderSaleCart();
  });

  salesTbody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="view-sale"]');
    if (!button) {
      return;
    }

    const saleId = Number(button.dataset.id);
    if (!saleId) {
      return;
    }

    await showSaleDetail(saleId);
  });
}

function configureScannerAvailability() {
  if (!scanCodeBtn) {
    return;
  }

  const shouldShowScanner = isLikelyMobileDevice() && isCameraApiSupported();
  scanCodeBtn.classList.toggle('hidden', !shouldShowScanner);
}

function isLikelyMobileDevice() {
  const ua = String(navigator.userAgent || '').toLowerCase();
  const mobileByAgent = /android|iphone|ipad|ipod|mobile/.test(ua);
  const coarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

  return mobileByAgent || coarsePointer;
}

function isCameraApiSupported() {
  return (
    isSecureCameraContext() &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

function isSecureCameraContext() {
  if (typeof window === 'undefined' || typeof location === 'undefined') {
    return false;
  }

  if (window.isSecureContext) {
    return true;
  }

  const host = String(location.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1';
}

async function loadStats() {
  try {
    const result = await fetchJson(`${API_BASE}/stats`);
    const stats = result.data || { plants: 0, sales: 0, income: 0 };

    statPlants.textContent = String(stats.plants || 0);
    statSales.textContent = String(stats.sales || 0);
    statIncome.textContent = formatMoney(stats.income || 0);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadPlants() {
  try {
    const result = await fetchJson(`${API_BASE}/plants`);
    state.plants = result.data || [];
    renderPlants();
    renderSaleCart();

    if (state.editingPlantId) {
      const current = state.plants.find((item) => Number(item.id) === Number(state.editingPlantId));
      if (current) {
        setPlantPreview(current.image_url || DEFAULT_IMAGE_URL);
      }
    }
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderPlants() {
  if (state.plants.length === 0) {
    plantsTbody.innerHTML = '<tr class="row-empty"><td colspan="8">No hay plantas registradas.</td></tr>';
    return;
  }

  plantsTbody.innerHTML = state.plants
    .map(
      (plant) => `
      <tr class="row-data">
        <td data-label="Codigo">${escapeHtml(plant.code || '-')}</td>
        <td data-label="Foto" class="cell-image"><img class="table-plant-image" src="${escapeHtml(plant.image_url || DEFAULT_IMAGE_URL)}" alt="${escapeHtml(plant.name || 'Planta')}" /></td>
        <td data-label="Nombre">${escapeHtml(plant.name)}</td>
        <td data-label="Precio">${formatMoney(plant.price)}</td>
        <td data-label="Luz">${escapeHtml(plant.light_type || '-')}</td>
        <td data-label="Riego">${escapeHtml(plant.watering || '-')}</td>
        <td data-label="Ubicacion">${escapeHtml(plant.location || '-')}</td>
        <td data-label="Acciones" class="cell-actions">
          <div class="actions">
            <button class="btn btn-soft" data-action="edit" data-id="${plant.id}">Editar</button>
            <button class="btn btn-danger" data-action="delete" data-id="${plant.id}">Eliminar</button>
          </div>
        </td>
      </tr>
    `
    )
    .join('');
}

function buildPlantFormData() {
  const formData = new FormData();
  const fields = {
    code: document.getElementById('code').value.trim().toUpperCase(),
    name: document.getElementById('name').value.trim(),
    price: Number(document.getElementById('price').value),
    description: document.getElementById('description').value.trim(),
    light_type: document.getElementById('light_type').value.trim(),
    watering: document.getElementById('watering').value.trim(),
    location: document.getElementById('location').value,
    toxicity: document.getElementById('toxicity').value.trim(),
    temperature_range: document.getElementById('temperature_range').value.trim(),
    humidity: document.getElementById('humidity').value.trim(),
    substrate: document.getElementById('substrate').value.trim(),
    fertilization: document.getElementById('fertilization').value.trim(),
    pruning: document.getElementById('pruning').value.trim(),
    pests: document.getElementById('pests').value.trim(),
    specific_care: document.getElementById('specific_care').value.trim(),
    extra_factors: document.getElementById('extra_factors').value.trim(),
    pet_friendly: document.getElementById('pet_friendly').checked ? 1 : 0,
    poisonous: document.getElementById('poisonous').checked ? 1 : 0,
    reset_image: resetImageCheckbox.checked ? 1 : 0,
  };

  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, String(value));
  });

  const imageFile = plantImageInput.files && plantImageInput.files[0] ? plantImageInput.files[0] : null;
  if (imageFile) {
    formData.append('image', imageFile);
  }

  return formData;
}

async function onPlantSubmit(event) {
  event.preventDefault();

  const payload = buildPlantFormData();
  const editingId = Number(plantIdInput.value || 0);
  const isEditing = editingId > 0;

  try {
    const url = isEditing ? `${API_BASE}/plants/${editingId}` : `${API_BASE}/plants`;
    const method = isEditing ? 'PUT' : 'POST';

    const result = await fetchJson(url, {
      method,
      body: payload,
    });

    showToast(result.message || 'Planta guardada con exito.');
    resetPlantForm();
    await Promise.all([loadPlants(), loadStats()]);
  } catch (error) {
    showToast(error.message, true);
  }
}

function startPlantEdit(plantId) {
  const plant = state.plants.find((item) => Number(item.id) === Number(plantId));
  if (!plant) {
    return;
  }

  plantIdInput.value = plant.id;
  document.getElementById('code').value = plant.code || '';
  document.getElementById('name').value = plant.name || '';
  document.getElementById('price').value = plant.price || '';
  document.getElementById('description').value = plant.description || '';
  document.getElementById('light_type').value = plant.light_type || '';
  document.getElementById('watering').value = plant.watering || '';
  document.getElementById('location').value = plant.location || 'Interior';
  document.getElementById('toxicity').value = plant.toxicity || '';
  document.getElementById('temperature_range').value = plant.temperature_range || '';
  document.getElementById('humidity').value = plant.humidity || '';
  document.getElementById('substrate').value = plant.substrate || '';
  document.getElementById('fertilization').value = plant.fertilization || '';
  document.getElementById('pruning').value = plant.pruning || '';
  document.getElementById('pests').value = plant.pests || '';
  document.getElementById('specific_care').value = plant.specific_care || '';
  document.getElementById('extra_factors').value = plant.extra_factors || '';
  document.getElementById('pet_friendly').checked = Number(plant.pet_friendly) === 1;
  document.getElementById('poisonous').checked = Number(plant.poisonous) === 1;
  resetImageCheckbox.checked = false;
  plantImageInput.value = '';
  setPlantPreview(plant.image_url || DEFAULT_IMAGE_URL);

  state.editingPlantId = plant.id;
  savePlantBtn.textContent = 'Actualizar planta';
  cancelEditBtn.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetPlantForm() {
  plantForm.reset();
  plantIdInput.value = '';
  state.editingPlantId = null;
  savePlantBtn.textContent = 'Guardar planta';
  cancelEditBtn.classList.add('hidden');
  resetImageCheckbox.checked = false;
  plantImageInput.value = '';
  setPlantPreview(DEFAULT_IMAGE_URL);
}

async function deletePlant(plantId) {
  const ok = window.confirm('¿Seguro que deseas eliminar esta planta?');
  if (!ok) {
    return;
  }

  try {
    const result = await fetchJson(`${API_BASE}/plants/${plantId}`, {
      method: 'DELETE',
    });

    showToast(result.message || 'Planta eliminada.');
    await Promise.all([loadPlants(), loadStats()]);
  } catch (error) {
    showToast(error.message, true);
  }
}

function onAddByCodeClick() {
  if (state.plants.length === 0) {
    showToast('Primero debes registrar plantas.', true);
    return;
  }

  const codeInput = normalizePlantCodeInput(saleCodeInput.value);
  const quantity = Number(saleQtyInput.value);

  if (!codeInput) {
    showToast('Debes ingresar el codigo de la planta.', true);
    saleCodeInput.focus();
    return;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    showToast('La cantidad debe ser mayor a 0.', true);
    saleQtyInput.focus();
    return;
  }

  const plant = findPlantByCode(codeInput);
  if (!plant) {
    showToast(`No existe una planta con codigo ${codeInput}.`, true);
    saleCodeInput.focus();
    saleCodeInput.select();
    return;
  }

  addToSaleCart(plant, quantity);
  saleCodeInput.value = '';
  saleQtyInput.value = '1';
  saleCodeInput.focus();
}

async function onScanCodeClick() {
  if (scannerState.active) {
    return;
  }

  if (!isSecureCameraContext()) {
    showToast('Para usar camara abre el sitio por HTTPS. En iPhone y Android no funciona en HTTP.', true);
    return;
  }

  if (!isCameraApiSupported()) {
    showToast('Este navegador no permite usar camara web. Ingresa el codigo manualmente.', true);
    return;
  }

  let permissionStream = null;

  try {
    if (!isBarcodeDetectorSupported()) {
      if (isHtml5QrcodeScannerSupported()) {
        await openHtml5QrcodeModal();
      } else {
        showToast('No se pudo cargar el escaner movil. Revisa internet y recarga la pagina para usar camara.', true);
      }
      return;
    }

    permissionStream = await requestCameraStream();
    const formats = await getScannerFormats();
    scannerState.detector = formats.length > 0 ? new BarcodeDetector({ formats }) : new BarcodeDetector();
    await openScannerModal(permissionStream);
    permissionStream = null;
  } catch (error) {
    console.error(error);
    if (permissionStream) {
      releaseStream(permissionStream);
    }
    stopScannerSession();
    handleCameraPermissionError(error);
  }
}

function isBarcodeDetectorSupported() {
  return (
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window
  );
}

function isHtml5QrcodeScannerSupported() {
  return typeof window !== 'undefined' && typeof window.Html5Qrcode === 'function';
}

async function requestCameraStream() {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
    },
  });
}

function releaseStream(stream) {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
}

function handleCameraPermissionError(error) {
  if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    showToast('Permiso de camara denegado. iPhone: Safari > aA > Configuracion del sitio > Camara > Permitir. Android: permisos del navegador > Camara > Permitir.', true);
    return;
  }

  if (error && error.name === 'NotFoundError') {
    showToast('No se detecto una camara disponible en este dispositivo.', true);
    return;
  }

  if (error && error.name === 'NotReadableError') {
    showToast('La camara esta siendo usada por otra app. Cierrala e intenta nuevamente.', true);
    return;
  }

  showToast('No se pudo iniciar el escaner. Revisa permisos de camara e intenta nuevamente.', true);
}

async function getScannerFormats() {
  const desiredFormats = ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'];

  if (typeof BarcodeDetector.getSupportedFormats !== 'function') {
    return desiredFormats;
  }

  try {
    const supportedFormats = await BarcodeDetector.getSupportedFormats();
    const filtered = desiredFormats.filter((format) => supportedFormats.includes(format));
    return filtered.length > 0 ? filtered : supportedFormats;
  } catch (error) {
    return desiredFormats;
  }
}

function getHtml5QrcodeFormats() {
  if (typeof window === 'undefined' || !window.Html5QrcodeSupportedFormats) {
    return [];
  }

  const formats = window.Html5QrcodeSupportedFormats;
  const desired = [
    formats.CODE_128,
    formats.CODE_39,
    formats.EAN_13,
    formats.EAN_8,
    formats.UPC_A,
    formats.UPC_E,
    formats.QR_CODE,
  ];

  return desired.filter((value) => Number.isInteger(value));
}

async function openScannerModal(initialStream = null) {
  const ui = createScannerModal();
  scannerState.modal = ui.modal;
  scannerState.video = ui.video;
  scannerState.guide = ui.guide;
  scannerState.fallbackHost = ui.fallbackHost;
  scannerState.status = ui.status;

  const onCancel = () => {
    stopScannerSession();
    showToast('Escaneo cancelado.');
  };

  ui.closeBtn.addEventListener('click', onCancel);
  ui.cancelBtn.addEventListener('click', onCancel);
  ui.modal.addEventListener('click', (event) => {
    if (event.target === ui.modal) {
      onCancel();
    }
  });

  document.body.appendChild(ui.modal);
  document.body.classList.add('scanner-open');
  scannerState.active = true;
  setNativeScannerMode();
  setScannerStatus('Iniciando camara...');

  const stream = initialStream || (await requestCameraStream());

  scannerState.stream = stream;
  scannerState.video.srcObject = stream;
  await scannerState.video.play();
  setScannerStatus('Apunta al codigo de barras o QR.');
  requestNextScannerFrame();
}

function requestNextScannerFrame() {
  if (!scannerState.active) {
    return;
  }

  scannerState.rafId = window.requestAnimationFrame(processScannerFrame);
}

function processScannerFrame() {
  if (!scannerState.active || !scannerState.video || !scannerState.detector) {
    return;
  }

  if (scannerState.detecting || scannerState.video.readyState < 2) {
    requestNextScannerFrame();
    return;
  }

  scannerState.detecting = true;

  scannerState.detector
    .detect(scannerState.video)
    .then((barcodes) => {
      if (!Array.isArray(barcodes) || barcodes.length === 0) {
        return;
      }

      const firstMatch = barcodes.find((item) => item && item.rawValue);
      if (!firstMatch) {
        return;
      }
      onScannerCodeDetected(firstMatch.rawValue);
    })
    .catch(() => {
      // Ignorar errores intermitentes de deteccion para mantener el loop de escaneo.
    })
    .finally(() => {
      scannerState.detecting = false;
      requestNextScannerFrame();
    });
}

async function openHtml5QrcodeModal() {
  const ui = createScannerModal();
  scannerState.modal = ui.modal;
  scannerState.video = ui.video;
  scannerState.guide = ui.guide;
  scannerState.fallbackHost = ui.fallbackHost;
  scannerState.status = ui.status;

  const onCancel = () => {
    stopScannerSession();
    showToast('Escaneo cancelado.');
  };

  ui.closeBtn.addEventListener('click', onCancel);
  ui.cancelBtn.addEventListener('click', onCancel);
  ui.modal.addEventListener('click', (event) => {
    if (event.target === ui.modal) {
      onCancel();
    }
  });

  document.body.appendChild(ui.modal);
  document.body.classList.add('scanner-open');
  scannerState.active = true;
  setFallbackScannerMode();
  setScannerStatus('Iniciando camara...');

  const readerHostId = `scanner-fallback-${Date.now()}`;
  scannerState.fallbackHost.innerHTML = `<div id="${readerHostId}" class="scanner-fallback-reader"></div>`;

  if (isIosDevice()) {
    await startHtml5QrcodeScannerUi(readerHostId);
    return;
  }

  try {
    await startHtml5QrcodeLowLevel(readerHostId);
  } catch (error) {
    console.warn('Fallback de escaner activado por compatibilidad:', error);
    if (!scannerState.active) {
      return;
    }
    await startHtml5QrcodeScannerUi(readerHostId);
  }
}

async function startHtml5QrcodeLowLevel(readerHostId) {
  const scannerFormats = getHtml5QrcodeFormats();
  const scannerConfig = {
    useBarCodeDetectorIfSupported: false,
  };

  if (scannerFormats.length > 0) {
    scannerConfig.formatsToSupport = scannerFormats;
  }

  const html5Qrcode = new window.Html5Qrcode(readerHostId, scannerConfig);
  scannerState.html5Qrcode = html5Qrcode;

  const cameraSelection = await getPreferredHtml5CameraSelection();

  await withPromiseTimeout(
    html5Qrcode.start(
      cameraSelection,
      {
        fps: 10,
        qrbox: { width: 280, height: 140 },
        aspectRatio: 1.3333,
      },
      (decodedText) => {
        onScannerCodeDetected(decodedText);
      },
      () => {
        // Ignorar errores de lectura parciales mientras sigue escaneando.
      }
    ),
    10000,
    'TIMEOUT_INICIANDO_CAMARA'
  );

  setScannerStatus('Apunta al codigo de barras o QR.');
}

async function startHtml5QrcodeScannerUi(readerHostId) {
  if (typeof window.Html5QrcodeScanner !== 'function') {
    throw new Error('Html5QrcodeScanner no disponible');
  }

  const scannerFormats = getHtml5QrcodeFormats();
  const scannerConfig = {
    fps: 10,
    qrbox: { width: 280, height: 140 },
    rememberLastUsedCamera: true,
    showTorchButtonIfSupported: true,
  };

  if (scannerFormats.length > 0) {
    scannerConfig.formatsToSupport = scannerFormats;
  }

  if (window.Html5QrcodeScanType && Number.isInteger(window.Html5QrcodeScanType.SCAN_TYPE_CAMERA)) {
    scannerConfig.supportedScanTypes = [window.Html5QrcodeScanType.SCAN_TYPE_CAMERA];
  }

  const scannerUi = new window.Html5QrcodeScanner(readerHostId, scannerConfig, false);
  scannerState.html5QrcodeScanner = scannerUi;

  scannerUi.render(
    (decodedText) => {
      onScannerCodeDetected(decodedText);
    },
    () => {
      // Ignorar errores parciales mientras sigue escaneando.
    }
  );

  setScannerStatus('Modo compatible iPhone: toca "Request Camera Permissions" y luego "Start Scanning".');
}

function isIosDevice() {
  const ua = String(navigator.userAgent || '');
  const isIpadOs = ua.includes('Mac') && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || isIpadOs;
}

async function getPreferredHtml5CameraSelection() {
  if (typeof window.Html5Qrcode?.getCameras !== 'function') {
    return { facingMode: { ideal: 'environment' } };
  }

  try {
    const cameras = await withPromiseTimeout(window.Html5Qrcode.getCameras(), 7000, 'TIMEOUT_CAMERAS');
    const preferredCameraId = pickPreferredCameraId(cameras);
    if (preferredCameraId) {
      return preferredCameraId;
    }
  } catch (error) {
    console.warn('No se pudo listar camaras, usando facingMode.', error);
  }

  return { facingMode: { ideal: 'environment' } };
}

function pickPreferredCameraId(cameras) {
  if (!Array.isArray(cameras) || cameras.length === 0) {
    return '';
  }

  const backCameraRegex = /back|rear|environment|trasera|posterior/i;
  const preferred =
    cameras.find((camera) => backCameraRegex.test(String(camera && camera.label ? camera.label : ''))) ||
    cameras[cameras.length - 1];

  if (!preferred || !preferred.id) {
    return '';
  }

  return String(preferred.id);
}

function withPromiseTimeout(promise, timeoutMs, timeoutCode) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      const timeoutError = new Error(timeoutCode || 'TIMEOUT');
      timeoutError.name = 'TimeoutError';
      reject(timeoutError);
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function onScannerCodeDetected(rawCodeValue) {
  if (!scannerState.active) {
    return;
  }

  const scannedValue = normalizePlantCodeInput(rawCodeValue);
  if (!scannedValue) {
    return;
  }

  saleCodeInput.value = scannedValue;
  saleCodeInput.focus();
  saleCodeInput.select();
  stopScannerSession();
  showToast(`Codigo escaneado: ${scannedValue}`);
}

function setNativeScannerMode() {
  if (scannerState.video) {
    scannerState.video.classList.remove('hidden');
  }
  if (scannerState.guide) {
    scannerState.guide.classList.remove('hidden');
  }
  if (scannerState.fallbackHost) {
    scannerState.fallbackHost.classList.add('hidden');
    scannerState.fallbackHost.innerHTML = '';
  }
}

function setFallbackScannerMode() {
  if (scannerState.video) {
    scannerState.video.classList.add('hidden');
  }
  if (scannerState.guide) {
    scannerState.guide.classList.add('hidden');
  }
  if (scannerState.fallbackHost) {
    scannerState.fallbackHost.classList.remove('hidden');
  }
}

function createScannerModal() {
  const modal = document.createElement('div');
  modal.className = 'scanner-modal';
  modal.innerHTML = `
    <div class="scanner-dialog" role="dialog" aria-modal="true" aria-label="Escanear codigo">
      <div class="scanner-header">
        <h3>Escanear codigo</h3>
        <button type="button" class="btn btn-soft scanner-close-btn">Cerrar</button>
      </div>
      <p class="scanner-status">Preparando camara...</p>
      <div class="scanner-video-wrap">
        <video class="scanner-video" autoplay playsinline muted></video>
        <div class="scanner-guide" aria-hidden="true"></div>
        <div class="scanner-fallback-host hidden"></div>
      </div>
      <p class="scanner-hint">Apunta al codigo de barras o QR de la planta.</p>
      <div class="scanner-footer">
        <button type="button" class="btn btn-soft scanner-cancel-btn">Cancelar</button>
      </div>
    </div>
  `;

  return {
    modal,
    video: modal.querySelector('.scanner-video'),
    guide: modal.querySelector('.scanner-guide'),
    fallbackHost: modal.querySelector('.scanner-fallback-host'),
    status: modal.querySelector('.scanner-status'),
    closeBtn: modal.querySelector('.scanner-close-btn'),
    cancelBtn: modal.querySelector('.scanner-cancel-btn'),
  };
}

function setScannerStatus(message) {
  if (scannerState.status) {
    scannerState.status.textContent = message;
  }
}

function stopScannerSession() {
  const html5Qrcode = scannerState.html5Qrcode;
  const html5QrcodeScanner = scannerState.html5QrcodeScanner;
  scannerState.html5Qrcode = null;
  scannerState.html5QrcodeScanner = null;

  if (html5Qrcode && typeof html5Qrcode.stop === 'function') {
    html5Qrcode
      .stop()
      .catch(() => {
        // Ignorar: puede ocurrir si el escaneo aun no parte completamente.
      })
      .finally(() => {
        if (typeof html5Qrcode.clear === 'function') {
          try {
            html5Qrcode.clear();
          } catch (error) {
            // Ignorar errores de limpieza.
          }
        }
      });
  }

  if (html5QrcodeScanner && typeof html5QrcodeScanner.clear === 'function') {
    html5QrcodeScanner.clear().catch(() => {
      // Ignorar errores de limpieza al cerrar UI fallback.
    });
  }

  scannerState.active = false;
  scannerState.detecting = false;

  if (scannerState.rafId) {
    window.cancelAnimationFrame(scannerState.rafId);
  }
  scannerState.rafId = 0;

  if (scannerState.stream) {
    scannerState.stream.getTracks().forEach((track) => track.stop());
  }

  if (scannerState.video) {
    scannerState.video.pause();
    scannerState.video.srcObject = null;
  }

  if (scannerState.modal) {
    scannerState.modal.remove();
  }

  document.body.classList.remove('scanner-open');

  scannerState.stream = null;
  scannerState.video = null;
  scannerState.guide = null;
  scannerState.fallbackHost = null;
  scannerState.modal = null;
  scannerState.status = null;
  scannerState.detector = null;
}

function addToSaleCart(plant, quantity) {
  const plantId = Number(plant.id);
  const existing = state.saleCart.find((item) => Number(item.plant_id) === plantId);

  if (existing) {
    existing.quantity += quantity;
  } else {
    state.saleCart.push({
      plant_id: plantId,
      code: String(plant.code || ''),
      name: String(plant.name || ''),
      price: Number(plant.price) || 0,
      quantity,
    });
  }

  renderSaleCart();
  showToast(`${plant.name} agregada al carrito.`);
}

function renderSaleCart() {
  if (!saleItemsContainer) {
    return;
  }

  if (state.saleCart.length === 0) {
    saleItemsContainer.innerHTML = '<p class="sale-cart-empty">No hay plantas en el carrito.</p>';
    return;
  }

  let grandTotal = 0;

  const rowsHtml = state.saleCart
    .map((item, index) => {
      const plant = state.plants.find((x) => Number(x.id) === Number(item.plant_id));
      const code = plant && plant.code ? String(plant.code) : item.code || 'SIN-CODIGO';
      const name = plant && plant.name ? String(plant.name) : item.name || 'Planta';
      const unitPrice = plant ? Number(plant.price) || 0 : Number(item.price) || 0;
      const subtotal = unitPrice * Number(item.quantity || 0);
      grandTotal += subtotal;

      return `
        <div class="sale-cart-row">
          <div class="sale-cart-main">
            <strong>${escapeHtml(code)} | ${escapeHtml(name)}</strong>
            <span>${formatMoney(unitPrice)} c/u</span>
          </div>
          <div class="sale-cart-qty">x${item.quantity}</div>
          <div class="sale-cart-subtotal">${formatMoney(subtotal)}</div>
          <button type="button" class="btn btn-danger" data-action="remove-cart-item" data-index="${index}">Quitar</button>
        </div>
      `;
    })
    .join('');

  saleItemsContainer.innerHTML = `
    ${rowsHtml}
    <div class="sale-cart-total">
      <strong>Total carrito:</strong>
      <span>${formatMoney(grandTotal)}</span>
    </div>
  `;
}

function findPlantByCode(code) {
  const normalized = normalizePlantCodeInput(code);
  if (!normalized) {
    return null;
  }
  return state.plants.find((plant) => normalizePlantCodeInput(plant.code) === normalized) || null;
}

function normalizePlantCodeInput(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-');
}

function getSaleItemsPayload() {
  return state.saleCart
    .map((item) => ({
      plant_id: Number(item.plant_id),
      code: normalizePlantCodeInput(item.code),
      quantity: Number(item.quantity),
    }))
    .filter(
      (item) =>
        Number.isInteger(item.plant_id) &&
        item.plant_id > 0 &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0
    );
}

function toggleCustomerFields() {
  const isHidden = customerFields.classList.contains('hidden');
  if (isHidden) {
    customerFields.classList.remove('hidden');
    toggleCustomerBtn.textContent = 'Ocultar cliente';
    const customerNameInput = document.getElementById('customer_name');
    customerNameInput.focus();
    return;
  }

  customerFields.classList.add('hidden');
  toggleCustomerBtn.textContent = '+ Agregar cliente (opcional)';
}

function resetSaleForm() {
  saleForm.reset();
  state.saleCart = [];
  renderSaleCart();
  customerFields.classList.add('hidden');
  toggleCustomerBtn.textContent = '+ Agregar cliente (opcional)';
  saleCodeInput.value = '';
  saleQtyInput.value = '1';
}

async function onSaleSubmit(event) {
  event.preventDefault();

  if (state.plants.length === 0) {
    showToast('Primero debes registrar plantas.', true);
    return;
  }

  const payload = {
    customer_name: document.getElementById('customer_name').value.trim(),
    customer_email: document.getElementById('customer_email').value.trim(),
    customer_phone: document.getElementById('customer_phone').value.trim(),
    notes: document.getElementById('sale_notes').value.trim(),
    items: getSaleItemsPayload(),
  };

  if (payload.items.length === 0) {
    showToast('Debes agregar plantas al carrito.', true);
    saleCodeInput.focus();
    return;
  }

  try {
    const result = await fetchJson(`${API_BASE}/sales`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const sale = result.data;
    saleResultCard.classList.remove('hidden');
    saleResultSummary.textContent = `Venta #${sale.sale_id} registrada por ${formatMoney(sale.total)}.`;
    careLinksList.innerHTML = (sale.items || [])
      .map(
        (item) =>
          `<li>${escapeHtml(item.plant_name)} (x${item.quantity}): <a href="${item.care_url}" target="_blank" rel="noreferrer">${item.care_url}</a></li>`
      )
      .join('');

    resetSaleForm();

    showToast(result.message || 'Venta registrada.');
    await Promise.all([loadSales(), loadStats()]);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadSales() {
  try {
    const result = await fetchJson(`${API_BASE}/sales`);
    state.sales = result.data || [];
    renderSales();
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderSales() {
  if (state.sales.length === 0) {
    salesTbody.innerHTML = '<tr class="row-empty"><td colspan="6">No hay ventas registradas.</td></tr>';
    return;
  }

  salesTbody.innerHTML = state.sales
    .map(
      (sale) => `
      <tr class="row-data">
        <td data-label="ID">#${sale.id}</td>
        <td data-label="Cliente">${escapeHtml(sale.customer_name || 'Mostrador')}</td>
        <td data-label="Total">${formatMoney(sale.total || 0)}</td>
        <td data-label="Fecha">${formatDate(sale.created_at)}</td>
        <td data-label="Items">${sale.items_count || 0}</td>
        <td data-label="Acciones" class="cell-actions">
          <button class="btn btn-soft" data-action="view-sale" data-id="${sale.id}">Ver detalle</button>
        </td>
      </tr>
    `
    )
    .join('');
}

async function showSaleDetail(saleId) {
  try {
    const result = await fetchJson(`${API_BASE}/sales/${saleId}`);
    const sale = result.data;

    const itemsHtml = (sale.items || [])
      .map(
        (item) => `
        <li>
          <strong>${escapeHtml(item.plant_name)}</strong> x${item.quantity}
          (${formatMoney(item.unit_price)} c/u)
          <br />
          <a href="${item.care_url}" target="_blank" rel="noreferrer">${item.care_url}</a>
        </li>
      `
      )
      .join('');

    saleDetailContent.innerHTML = `
      <p><strong>Cliente:</strong> ${escapeHtml(sale.customer_name || 'Mostrador')}</p>
      <p><strong>Email:</strong> ${escapeHtml(sale.customer_email || '-')}</p>
      <p><strong>Telefono:</strong> ${escapeHtml(sale.customer_phone || '-')}</p>
      <p><strong>Total:</strong> ${formatMoney(sale.total || 0)}</p>
      <p><strong>Fecha:</strong> ${formatDate(sale.created_at)}</p>
      <h4>Plantas vendidas y links de cuidado</h4>
      <ul>${itemsHtml}</ul>
    `;

    saleDetailCard.classList.remove('hidden');
    saleDetailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showToast(error.message, true);
  }
}

async function fetchJson(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    headers,
    ...options,
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

function setPlantPreview(url, isObjectUrl = false) {
  if (plantPreviewObjectUrl) {
    URL.revokeObjectURL(plantPreviewObjectUrl);
    plantPreviewObjectUrl = '';
  }

  if (isObjectUrl) {
    plantPreviewObjectUrl = url;
  }

  plantImagePreview.src = url || DEFAULT_IMAGE_URL;
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
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

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.style.background = isError ? '#8d2f28' : '#005c4d';

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.add('hidden');
  }, 3200);
}
