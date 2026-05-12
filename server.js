const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const multer = require('multer');

dotenv.config();
const pool = require('./config/db');

const app = express();
const PORT = Number(process.env.PORT || 3009);
const BASE_PATH = normalizeBasePath(process.env.BASE_PATH ?? '/jardini');
const STATIC_MOUNT_PATH = BASE_PATH || '/';
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const INDEX_TEMPLATE_PATH = path.join(PUBLIC_DIR, 'index.html');
const STORE_TEMPLATE_PATH = path.join(PUBLIC_DIR, 'store.html');
const CARE_TEMPLATE_PATH = path.join(PUBLIC_DIR, 'care.html');
const DEFAULT_PLANT_IMAGE_PATH = 'img/logo/ICONO 2.png';
const PLANT_NAME_IMAGE_MAP = new Map([
  ['aloe vera', 'img/plants/aloe-vera.jpg'],
  ['cactus echinopsis', 'img/plants/cactus-echinopsis.png'],
]);
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const TRUST_PROXY_ENV = String(process.env.TRUST_PROXY || '').trim().toLowerCase();
const publicStaticMiddleware = express.static(PUBLIC_DIR, { index: false });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOADS_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = getSafeImageExtension(file);
      const unique = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
      cb(null, `plant-${unique}${ext}`);
    },
  }),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(String(file.mimetype || '').toLowerCase())) {
      cb(new Error('Solo se permiten imagenes PNG, JPG o WEBP.'));
      return;
    }
    cb(null, true);
  },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (TRUST_PROXY_ENV === '1' || TRUST_PROXY_ENV === 'true' || TRUST_PROXY_ENV === 'yes') {
  app.set('trust proxy', true);
}

app.use(STATIC_MOUNT_PATH, (req, res, next) => {
  const requestPath = String(req.path || '').toLowerCase();
  if (requestPath.endsWith('.html')) {
    return next();
  }

  return publicStaticMiddleware(req, res, next);
});
app.use(`${BASE_PATH}/img`, express.static(path.join(__dirname, 'img')));
app.use(`${BASE_PATH}/font`, express.static(path.join(__dirname, 'font')));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});

app.get('/', (_req, res) => {
  sendStorePage(res);
});

app.get('/catalogo', (_req, res) => {
  sendStorePage(res);
});

if (BASE_PATH) {
  app.get(BASE_PATH, (_req, res) => {
    res.redirect(301, `${BASE_PATH}/`);
  });

  app.get(`${BASE_PATH}/`, (_req, res) => {
    sendIndexPage(res);
  });
} else {
  app.get('/venta', (_req, res) => {
    sendIndexPage(res);
  });

  app.get('/venta/', (_req, res) => {
    sendIndexPage(res);
  });
}

app.get(`${BASE_PATH}/index.html`, (_req, res) => {
  sendIndexPage(res);
});

app.get(`${BASE_PATH}/care.html`, (_req, res) => {
  sendCarePage(res);
});

app.get(`${BASE_PATH}/care/:token`, (req, res) => {
  sendCarePage(res);
});

if (BASE_PATH) {
  app.get('/care/:token', (req, res) => {
    const token = String(req.params.token || '').trim();
    const encodedToken = encodeURIComponent(token);
    res.redirect(302, `${BASE_PATH}/care/${encodedToken}`);
  });
}

app.get(`${BASE_PATH}/api/plants`, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, name, description, image_path, price, light_type, watering, location, toxicity,
              temperature_range, humidity, substrate, fertilization, pruning, pests,
              pet_friendly, poisonous, specific_care, extra_factors, created_at, updated_at
       FROM plants
       ORDER BY id DESC`
    );
    const data = rows.map((row) => {
      const imagePath = resolvePlantImagePath(row.image_path, row.name);
      return {
        ...row,
        image_path: imagePath,
        image_url: buildAssetUrl(req, imagePath),
      };
    });
    res.json({ data });
  } catch (error) {
    handleError(res, error, 'No se pudieron listar las plantas.');
  }
});

app.post(`${BASE_PATH}/api/plants`, upload.single('image'), async (req, res) => {
  try {
    const payload = mapPlantPayload(req.body);
    payload.image_path = req.file ? buildUploadedImagePath(req.file.filename) : DEFAULT_PLANT_IMAGE_PATH;
    const validation = validatePlant(payload);

    if (!validation.valid) {
      if (req.file) {
        await deleteUploadedImageIfNeeded(payload.image_path);
      }
      return res.status(400).json({ message: validation.message });
    }

    const [result] = await pool.query(
      `INSERT INTO plants (
          code, name, description, image_path, price, light_type, watering, location, toxicity,
          temperature_range, humidity, substrate, fertilization, pruning, pests,
          pet_friendly, poisonous, specific_care, extra_factors
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.code,
        payload.name,
        payload.description,
        payload.image_path,
        payload.price,
        payload.light_type,
        payload.watering,
        payload.location,
        payload.toxicity,
        payload.temperature_range,
        payload.humidity,
        payload.substrate,
        payload.fertilization,
        payload.pruning,
        payload.pests,
        payload.pet_friendly,
        payload.poisonous,
        payload.specific_care,
        payload.extra_factors,
      ]
    );

    res.status(201).json({ message: 'Planta registrada con exito.', id: result.insertId });
  } catch (error) {
    if (req.file) {
      await deleteUploadedImageIfNeeded(buildUploadedImagePath(req.file.filename));
    }
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'El codigo de planta ya existe.' });
    }
    handleError(res, error, 'No se pudo guardar la planta.');
  }
});

app.put(`${BASE_PATH}/api/plants/:id`, upload.single('image'), async (req, res) => {
  try {
    const plantId = Number(req.params.id);
    if (!Number.isInteger(plantId) || plantId <= 0) {
      if (req.file) {
        await deleteUploadedImageIfNeeded(buildUploadedImagePath(req.file.filename));
      }
      return res.status(400).json({ message: 'ID de planta invalido.' });
    }

    const [currentRows] = await pool.query('SELECT id, image_path FROM plants WHERE id = ? LIMIT 1', [plantId]);
    if (currentRows.length === 0) {
      if (req.file) {
        await deleteUploadedImageIfNeeded(buildUploadedImagePath(req.file.filename));
      }
      return res.status(404).json({ message: 'Planta no encontrada.' });
    }

    const currentImagePath = normalizeImagePath(currentRows[0].image_path);
    const payload = mapPlantPayload(req.body);
    const resetImage = toBoolNumber(req.body.reset_image) === 1;
    const uploadedImagePath = req.file ? buildUploadedImagePath(req.file.filename) : null;
    payload.image_path = uploadedImagePath || (resetImage ? DEFAULT_PLANT_IMAGE_PATH : currentImagePath);
    const validation = validatePlant(payload);

    if (!validation.valid) {
      if (uploadedImagePath) {
        await deleteUploadedImageIfNeeded(uploadedImagePath);
      }
      return res.status(400).json({ message: validation.message });
    }

    const [result] = await pool.query(
      `UPDATE plants
       SET code = ?, name = ?, description = ?, image_path = ?, price = ?, light_type = ?, watering = ?, location = ?,
           toxicity = ?, temperature_range = ?, humidity = ?, substrate = ?,
           fertilization = ?, pruning = ?, pests = ?, pet_friendly = ?, poisonous = ?,
           specific_care = ?, extra_factors = ?
       WHERE id = ?`,
      [
        payload.code,
        payload.name,
        payload.description,
        payload.image_path,
        payload.price,
        payload.light_type,
        payload.watering,
        payload.location,
        payload.toxicity,
        payload.temperature_range,
        payload.humidity,
        payload.substrate,
        payload.fertilization,
        payload.pruning,
        payload.pests,
        payload.pet_friendly,
        payload.poisonous,
        payload.specific_care,
        payload.extra_factors,
        plantId,
      ]
    );

    const shouldDeletePreviousImage =
      normalizeImagePath(currentImagePath) !== normalizeImagePath(payload.image_path) &&
      isUploadedImagePath(currentImagePath);
    if (shouldDeletePreviousImage) {
      await deleteUploadedImageIfNeeded(currentImagePath);
    }
    res.json({ message: 'Planta actualizada.' });
  } catch (error) {
    if (req.file) {
      await deleteUploadedImageIfNeeded(buildUploadedImagePath(req.file.filename));
    }
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'El codigo de planta ya existe.' });
    }
    handleError(res, error, 'No se pudo actualizar la planta.');
  }
});

app.delete(`${BASE_PATH}/api/plants/:id`, async (req, res) => {
  try {
    const plantId = Number(req.params.id);
    if (!Number.isInteger(plantId) || plantId <= 0) {
      return res.status(400).json({ message: 'ID de planta invalido.' });
    }

    const [plantRows] = await pool.query('SELECT image_path FROM plants WHERE id = ? LIMIT 1', [plantId]);
    if (plantRows.length === 0) {
      return res.status(404).json({ message: 'Planta no encontrada.' });
    }
    const imagePath = normalizeImagePath(plantRows[0].image_path);

    const [result] = await pool.query('DELETE FROM plants WHERE id = ?', [plantId]);

    if (result.affectedRows > 0 && isUploadedImagePath(imagePath)) {
      await deleteUploadedImageIfNeeded(imagePath);
    }

    res.json({ message: 'Planta eliminada.' });
  } catch (error) {
    if (error && error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        message: 'No se puede eliminar la planta porque ya tiene ventas registradas.',
      });
    }

    handleError(res, error, 'No se pudo eliminar la planta.');
  }
});

app.get(`${BASE_PATH}/api/sales`, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.customer_name, s.customer_email, s.customer_phone, s.total, s.created_at,
              COUNT(si.id) AS items_count
       FROM sales s
       LEFT JOIN sale_items si ON si.sale_id = s.id
       GROUP BY s.id
       ORDER BY s.id DESC`
    );

    res.json({ data: rows });
  } catch (error) {
    handleError(res, error, 'No se pudieron listar las ventas.');
  }
});

app.get(`${BASE_PATH}/api/sales/:id`, async (req, res) => {
  try {
    const saleId = Number(req.params.id);
    if (!Number.isInteger(saleId) || saleId <= 0) {
      return res.status(400).json({ message: 'ID de venta invalido.' });
    }

    const [saleRows] = await pool.query('SELECT * FROM sales WHERE id = ?', [saleId]);
    if (saleRows.length === 0) {
      return res.status(404).json({ message: 'Venta no encontrada.' });
    }

    const [itemRows] = await pool.query(
      `SELECT si.id, si.quantity, si.unit_price, si.care_token, si.plant_snapshot
       FROM sale_items si
       WHERE si.sale_id = ?
       ORDER BY si.id ASC`,
      [saleId]
    );

    const items = itemRows.map((item) => {
      const snapshot = safeParseSnapshot(item.plant_snapshot);
      const imagePath = resolvePlantImagePath(snapshot.image_path, snapshot.name);
      snapshot.image_path = imagePath;
      snapshot.image_url = buildAssetUrl(req, imagePath);
      return {
        id: item.id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        care_token: item.care_token,
        care_url: buildCareUrl(req, item.care_token),
        plant_snapshot: snapshot,
        plant_name: snapshot.name || 'Planta',
      };
    });

    res.json({
      data: {
        ...saleRows[0],
        items,
      },
    });
  } catch (error) {
    handleError(res, error, 'No se pudo consultar la venta.');
  }
});

app.post(`${BASE_PATH}/api/sales`, async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const customerName = normalizeOptionalField(req.body.customer_name);
    const customerEmail = normalizeOptionalField(req.body.customer_email);
    const customerPhone = normalizeOptionalField(req.body.customer_phone);
    const notes = normalizeOptionalField(req.body.notes);
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (items.length === 0) {
      throw validationError('Debes agregar al menos una planta en la venta.');
    }

    await connection.beginTransaction();
    transactionStarted = true;

    const [saleResult] = await connection.query(
      `INSERT INTO sales (customer_name, customer_email, customer_phone, notes, total)
       VALUES (?, ?, ?, ?, 0)`,
      [customerName, customerEmail, customerPhone, notes]
    );

    const saleId = saleResult.insertId;
    let total = 0;
    const createdItems = [];

    for (const rawItem of items) {
      const requestedPlantId = Number(rawItem.plant_id);
      const requestedPlantCode = normalizePlantCode(rawItem.code || '');
      const quantity = Number(rawItem.quantity);

      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw validationError('Cada item debe tener cantidad mayor a 0.');
      }

      let plantRows = [];
      if (Number.isInteger(requestedPlantId) && requestedPlantId > 0) {
        [plantRows] = await connection.query('SELECT * FROM plants WHERE id = ? LIMIT 1', [requestedPlantId]);
      } else if (requestedPlantCode) {
        [plantRows] = await connection.query('SELECT * FROM plants WHERE code = ? LIMIT 1', [requestedPlantCode]);
      } else {
        throw validationError('Cada item debe tener codigo de planta o ID valido.');
      }

      if (plantRows.length === 0) {
        if (requestedPlantCode) {
          throw validationError(`La planta con codigo ${requestedPlantCode} no existe.`);
        }
        throw validationError(`La planta con ID ${requestedPlantId} no existe.`);
      }

      const plant = plantRows[0];
      const plantId = Number(plant.id);
      const unitPrice = Number(plant.price);
      const token = await generateCareToken(connection);
      const plantImagePath = resolvePlantImagePath(plant.image_path, plant.name);

      const snapshot = {
        plant_id: plant.id,
        code: plant.code,
        name: plant.name,
        description: plant.description,
        image_path: plantImagePath,
        image_url: buildAssetUrl(req, plantImagePath),
        price: plant.price,
        light_type: plant.light_type,
        watering: plant.watering,
        location: plant.location,
        toxicity: plant.toxicity,
        temperature_range: plant.temperature_range,
        humidity: plant.humidity,
        substrate: plant.substrate,
        fertilization: plant.fertilization,
        pruning: plant.pruning,
        pests: plant.pests,
        pet_friendly: !!plant.pet_friendly,
        poisonous: !!plant.poisonous,
        specific_care: plant.specific_care,
        extra_factors: plant.extra_factors,
      };

      await connection.query(
        `INSERT INTO sale_items (sale_id, plant_id, quantity, unit_price, care_token, plant_snapshot)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [saleId, plantId, quantity, unitPrice, token, JSON.stringify(snapshot)]
      );

      total += unitPrice * quantity;

      createdItems.push({
        plant_id: plantId,
        quantity,
        plant_name: plant.name,
        care_token: token,
      });
    }

    await connection.query('UPDATE sales SET total = ? WHERE id = ?', [total, saleId]);
    await connection.commit();

    const itemsWithUrls = createdItems.map((item) => ({
      ...item,
      care_url: buildCareUrl(req, item.care_token),
    }));

    res.status(201).json({
      message: 'Venta registrada con exito.',
      data: {
        sale_id: saleId,
        total,
        items: itemsWithUrls,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    const status = error && error.status ? error.status : 500;
    const message = status === 500 ? 'No se pudo registrar la venta.' : error.message;
    handleError(res, error, message, status);
  } finally {
    connection.release();
  }
});

app.get(`${BASE_PATH}/api/care/:token`, async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (token.length < 8) {
      return res.status(400).json({ message: 'Token invalido.' });
    }

    const [rows] = await pool.query(
      `SELECT si.care_token, si.quantity, si.unit_price, si.created_at AS sold_at,
              si.plant_snapshot, s.customer_name, s.customer_email, s.customer_phone,
              s.created_at AS sale_date
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       WHERE si.care_token = ?
       LIMIT 1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'No encontramos cuidados para este enlace.' });
    }

    const item = rows[0];
    const snapshot = safeParseSnapshot(item.plant_snapshot);
    const imagePath = resolvePlantImagePath(snapshot.image_path, snapshot.name);
    snapshot.image_path = imagePath;
    snapshot.image_url = buildAssetUrl(req, imagePath);

    res.json({
      data: {
        care_token: item.care_token,
        quantity: item.quantity,
        unit_price: item.unit_price,
        sold_at: item.sold_at,
        sale_date: item.sale_date,
        customer_name: item.customer_name,
        customer_email: item.customer_email,
        customer_phone: item.customer_phone,
        plant: snapshot,
      },
    });
  } catch (error) {
    handleError(res, error, 'No se pudieron cargar los cuidados.');
  }
});

app.get(`${BASE_PATH}/api/stats`, async (req, res) => {
  try {
    const [[plantCount]] = await pool.query('SELECT COUNT(*) AS total FROM plants');
    const [[saleCount]] = await pool.query('SELECT COUNT(*) AS total FROM sales');
    const [[income]] = await pool.query('SELECT COALESCE(SUM(total), 0) AS total FROM sales');

    res.json({
      data: {
        plants: plantCount.total,
        sales: saleCount.total,
        income: Number(income.total || 0),
      },
    });
  } catch (error) {
    handleError(res, error, 'No se pudieron obtener las estadisticas.');
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'La imagen supera el maximo permitido (5MB).' });
    }
    return res.status(400).json({ message: 'No se pudo procesar la imagen enviada.' });
  }

  if (error && error.message === 'Solo se permiten imagenes PNG, JPG o WEBP.') {
    return res.status(400).json({ message: error.message });
  }

  return next(error);
});

app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada.' });
});

startServer();

async function startServer() {
  try {
    ensureStorageDirectories();
    await initializeDatabase();
    await seedPlantsIfEmpty();

    const server = app.listen(PORT, () => {
      console.log(`Servidor iniciado en http://localhost:${PORT}${displayBasePath(BASE_PATH)}`);
    });

    server.on('error', (error) => {
      console.error(formatServerListenError(error));
      process.exit(1);
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', formatStartupError(error));
    process.exit(1);
  }
}

function normalizeBasePath(basePath) {
  const value = String(basePath || '').trim();
  if (!value || value === '/') {
    return '';
  }

  const withSlash = value.startsWith('/') ? value : `/${value}`;
  return withSlash.replace(/\/+$/, '');
}

function displayBasePath(basePath) {
  return basePath || '/';
}

function getRuntimeBasePath() {
  return BASE_PATH || '';
}

function sendIndexPage(res) {
  res.type('html').send(renderHtmlTemplate(INDEX_TEMPLATE_PATH));
}

function sendStorePage(res) {
  res.type('html').send(renderHtmlTemplate(STORE_TEMPLATE_PATH));
}

function sendCarePage(res) {
  res.type('html').send(renderHtmlTemplate(CARE_TEMPLATE_PATH));
}

function renderHtmlTemplate(filePath) {
  const template = fs.readFileSync(filePath, 'utf8');
  return template.replace(/__BASE_PATH__/g, getRuntimeBasePath());
}

function mapPlantPayload(body) {
  return {
    code: normalizePlantCode(String(body.code || '')),
    name: String(body.name || '').trim(),
    description: String(body.description || '').trim(),
    price: Number(body.price),
    light_type: String(body.light_type || '').trim(),
    watering: String(body.watering || '').trim(),
    location: normalizeLocation(String(body.location || '').trim()),
    toxicity: String(body.toxicity || '').trim() || 'No especificado',
    temperature_range: String(body.temperature_range || '').trim() || 'No especificado',
    humidity: String(body.humidity || '').trim() || 'No especificado',
    substrate: String(body.substrate || '').trim() || 'No especificado',
    fertilization: String(body.fertilization || '').trim() || 'No especificado',
    pruning: String(body.pruning || '').trim() || 'No especificado',
    pests: String(body.pests || '').trim(),
    pet_friendly: toBoolNumber(body.pet_friendly),
    poisonous: toBoolNumber(body.poisonous),
    specific_care: String(body.specific_care || '').trim(),
    extra_factors: String(body.extra_factors || '').trim(),
  };
}

function validatePlant(payload) {
  if (!payload.code || payload.code.length < 2) {
    return { valid: false, message: 'El codigo de la planta es obligatorio.' };
  }

  if (!/^[A-Z0-9_-]+$/.test(payload.code)) {
    return {
      valid: false,
      message: 'El codigo solo puede contener letras, numeros, guion y guion bajo.',
    };
  }

  if (payload.code.length > 50) {
    return { valid: false, message: 'El codigo no puede superar 50 caracteres.' };
  }

  if (!payload.name || payload.name.length < 2) {
    return { valid: false, message: 'El nombre de la planta es obligatorio.' };
  }

  if (!Number.isFinite(payload.price) || payload.price <= 0) {
    return { valid: false, message: 'El precio debe ser un numero mayor a 0.' };
  }

  if (!payload.light_type) {
    return { valid: false, message: 'Debes indicar el tipo de luz.' };
  }

  if (!payload.watering) {
    return { valid: false, message: 'Debes indicar el riego.' };
  }

  if (!['Interior', 'Exterior', 'Ambos'].includes(payload.location)) {
    return { valid: false, message: 'La ubicacion debe ser Interior, Exterior o Ambos.' };
  }

  return { valid: true };
}

function normalizeLocation(value) {
  const clean = value.toLowerCase();
  if (clean === 'interior') return 'Interior';
  if (clean === 'exterior') return 'Exterior';
  if (clean === 'ambos') return 'Ambos';
  return value;
}

function normalizePlantCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-');
}

function normalizeOptionalField(value) {
  const clean = String(value || '').trim();
  return clean || null;
}

function getSafeImageExtension(file) {
  const byName = String(path.extname(file.originalname || '') || '').toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(byName)) {
    return byName === '.jpeg' ? '.jpg' : byName;
  }

  const byMime = String(file.mimetype || '').toLowerCase();
  if (byMime === 'image/png') return '.png';
  if (byMime === 'image/webp') return '.webp';
  return '.jpg';
}

function buildUploadedImagePath(filename) {
  return `uploads/${filename}`;
}

function normalizeImagePath(value) {
  const pathValue = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!pathValue) {
    return DEFAULT_PLANT_IMAGE_PATH;
  }

  return pathValue;
}

function normalizePlantNameKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function resolvePlantImagePath(imagePath, plantName) {
  const normalizedPath = normalizeImagePath(imagePath);
  if (normalizedPath !== DEFAULT_PLANT_IMAGE_PATH) {
    return normalizedPath;
  }

  const namedImagePath = PLANT_NAME_IMAGE_MAP.get(normalizePlantNameKey(plantName));
  if (namedImagePath) {
    return namedImagePath;
  }

  return normalizedPath;
}

function isUploadedImagePath(value) {
  return normalizeImagePath(value).startsWith('uploads/');
}

function buildAssetUrl(req, rawPath) {
  const imagePath = normalizeImagePath(rawPath);
  const encodedPath = imagePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${req.protocol}://${req.get('host')}${BASE_PATH}/${encodedPath}`;
}

function toBoolNumber(value) {
  if (value === true || value === 1 || value === '1' || value === 'true' || value === 'on') {
    return 1;
  }
  return 0;
}

function safeParseSnapshot(value) {
  try {
    return JSON.parse(value || '{}');
  } catch (error) {
    return {};
  }
}

async function generateCareToken(connection) {
  for (let i = 0; i < 6; i += 1) {
    const token = crypto.randomBytes(12).toString('hex');
    const [rows] = await connection.query(
      'SELECT id FROM sale_items WHERE care_token = ? LIMIT 1',
      [token]
    );

    if (rows.length === 0) {
      return token;
    }
  }

  throw new Error('No se pudo generar un token unico de cuidados.');
}

function buildCareUrl(req, token) {
  return `${req.protocol}://${req.get('host')}${BASE_PATH}/care/${token}`;
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function handleError(res, error, fallbackMessage, statusCode = 500) {
  const status = statusCode || 500;
  if (status >= 500) {
    console.error(error);
  }

  const response = { message: fallbackMessage };
  if (status < 500 && error && error.message && error.message !== fallbackMessage) {
    response.detail = error.message;
  }

  res.status(status).json(response);
}

function ensureStorageDirectories() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

async function deleteUploadedImageIfNeeded(imagePath) {
  const normalized = normalizeImagePath(imagePath);
  if (!isUploadedImagePath(normalized)) {
    return;
  }

  const absolutePath = path.join(PUBLIC_DIR, normalized);
  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      console.error('No se pudo eliminar imagen previa:', error.message);
    }
  }
}

async function initializeDatabase() {
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    if (error && error.code === 'ER_BAD_DB_ERROR') {
      await ensureDatabaseExists();
    } else {
      throw error;
    }
  }

  await createTablesIfNeeded();
}

async function ensureDatabaseExists() {
  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  };

  const dbName = process.env.DB_NAME || 'jardini';
  let connection;

  try {
    connection = await mysql.createConnection(config);
    const safeDbName = dbName.replace(/`/g, '``');
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${safeDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (error) {
    if (error && (error.code === 'ER_ACCESS_DENIED_ERROR' || error.code === 'ER_DBACCESS_DENIED_ERROR')) {
      throw new Error(
        'MySQL rechazo el acceso para crear la base. Revisa DB_USER/DB_PASSWORD en .env o crea la base manualmente con schema.sql.'
      );
    }
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

function formatServerListenError(error) {
  if (error && error.code === 'EADDRINUSE') {
    return `No se pudo iniciar: el puerto ${PORT} ya esta en uso. Cierra el otro proceso Node o cambia PORT en .env.`;
  }

  if (error && error.message) {
    return `No se pudo iniciar el servidor HTTP: ${error.message}`;
  }

  return 'No se pudo iniciar el servidor HTTP.';
}

function formatStartupError(error) {
  if (error && error.code === 'ER_ACCESS_DENIED_ERROR') {
    return 'MySQL denego el acceso. Revisa DB_USER y DB_PASSWORD en .env.';
  }

  if (error && error.code === 'ER_DBACCESS_DENIED_ERROR') {
    return 'El usuario de MySQL no tiene permisos sobre la base configurada.';
  }

  if (error && error.code === 'ECONNREFUSED') {
    return 'No se pudo conectar a MySQL. Verifica que el servicio este encendido y DB_HOST/DB_PORT sean correctos.';
  }

  return error && error.message ? error.message : 'Error desconocido al iniciar.';
}

async function createTablesIfNeeded() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      image_path VARCHAR(255) NOT NULL DEFAULT 'img/logo/ICONO 2.png',
      price DECIMAL(10,2) NOT NULL,
      light_type VARCHAR(120) NOT NULL,
      watering VARCHAR(120) NOT NULL,
      location VARCHAR(20) NOT NULL,
      toxicity VARCHAR(120) DEFAULT 'No especificado',
      temperature_range VARCHAR(80) DEFAULT 'No especificado',
      humidity VARCHAR(80) DEFAULT 'No especificado',
      substrate VARCHAR(120) DEFAULT 'No especificado',
      fertilization VARCHAR(120) DEFAULT 'No especificado',
      pruning VARCHAR(120) DEFAULT 'No especificado',
      pests TEXT,
      pet_friendly TINYINT(1) NOT NULL DEFAULT 0,
      poisonous TINYINT(1) NOT NULL DEFAULT 0,
      specific_care TEXT,
      extra_factors TEXT,
      UNIQUE KEY uniq_plants_code (code),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await ensurePlantCodeColumnAndUnique();
  await ensurePlantImageColumnAndDefaults();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_name VARCHAR(120) NULL,
      customer_email VARCHAR(120),
      customer_phone VARCHAR(40),
      notes TEXT,
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureSalesCustomerColumnsOptional();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sale_id INT NOT NULL,
      plant_id INT NOT NULL,
      quantity INT NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      care_token VARCHAR(120) NOT NULL UNIQUE,
      plant_snapshot LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sale_items_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      CONSTRAINT fk_sale_items_plant FOREIGN KEY (plant_id) REFERENCES plants(id)
    )
  `);
}

async function ensurePlantCodeColumnAndUnique() {
  const [columnRows] = await pool.query(`
    SELECT COUNT(*) AS total
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'plants'
      AND column_name = 'code'
  `);

  const hasCodeColumn = Number(columnRows[0].total) > 0;
  if (!hasCodeColumn) {
    await pool.query('ALTER TABLE plants ADD COLUMN code VARCHAR(50) NULL AFTER id');
  }

  const [plants] = await pool.query('SELECT id, name, code FROM plants ORDER BY id ASC');
  const usedCodes = new Set();

  for (const plant of plants) {
    let code = normalizePlantCode(plant.code || '');

    if (!code || usedCodes.has(code)) {
      code = buildFallbackPlantCode(plant.name, plant.id, usedCodes);
    }

    usedCodes.add(code);

    if (code !== plant.code) {
      await pool.query('UPDATE plants SET code = ? WHERE id = ?', [code, plant.id]);
    }
  }

  await pool.query('ALTER TABLE plants MODIFY code VARCHAR(50) NOT NULL');

  const [indexRows] = await pool.query(`
    SELECT COUNT(*) AS total
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'plants'
      AND index_name = 'uniq_plants_code'
  `);

  if (Number(indexRows[0].total) === 0) {
    await pool.query('CREATE UNIQUE INDEX uniq_plants_code ON plants (code)');
  }
}

async function ensurePlantImageColumnAndDefaults() {
  const [columnRows] = await pool.query(`
    SELECT COUNT(*) AS total
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'plants'
      AND column_name = 'image_path'
  `);

  const hasImageColumn = Number(columnRows[0].total) > 0;
  if (!hasImageColumn) {
    await pool.query('ALTER TABLE plants ADD COLUMN image_path VARCHAR(255) NULL AFTER description');
  }

  await pool.query(
    `UPDATE plants
     SET image_path = ?
     WHERE image_path IS NULL OR TRIM(image_path) = ''`,
    [DEFAULT_PLANT_IMAGE_PATH]
  );

  await pool.query('ALTER TABLE plants MODIFY image_path VARCHAR(255) NOT NULL');
}

async function ensureSalesCustomerColumnsOptional() {
  await pool.query(`
    UPDATE sales
    SET customer_name = NULL
    WHERE customer_name IS NOT NULL AND TRIM(customer_name) = ''
  `);

  await pool.query('ALTER TABLE sales MODIFY customer_name VARCHAR(120) NULL');
  await pool.query('ALTER TABLE sales MODIFY customer_email VARCHAR(120) NULL');
  await pool.query('ALTER TABLE sales MODIFY customer_phone VARCHAR(40) NULL');
}

function buildFallbackPlantCode(name, id, usedCodes) {
  const base = String(name || 'PLANTA')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 16);

  const safeBase = base || 'PLANTA';
  let code = `${safeBase}-${String(id).padStart(4, '0')}`;
  let counter = 1;

  while (usedCodes.has(code)) {
    code = `${safeBase}-${String(id).padStart(4, '0')}-${counter}`;
    counter += 1;
  }

  return code;
}

async function seedPlantsIfEmpty() {
  const [[countRow]] = await pool.query('SELECT COUNT(*) AS total FROM plants');
  if (Number(countRow.total) > 0) {
    return;
  }

  const samplePlants = [
    {
      name: 'Monstera Deliciosa',
      description: 'Planta tropical de hojas grandes con perforaciones naturales.',
      price: 18990,
      light_type: 'Luz indirecta brillante',
      watering: '1 vez por semana, dejar secar 2-3 cm del sustrato',
      location: 'Interior',
      toxicity: 'Levemente toxica para mascotas si se ingiere',
      temperature_range: '18-27 C',
      humidity: 'Media a alta (50%-70%)',
      substrate: 'Suelto, drenante y rico en materia organica',
      fertilization: 'Cada 30 dias en primavera/verano',
      pruning: 'Retirar hojas secas y guiar tutor',
      pests: 'Cochinilla y araña roja',
      pet_friendly: 0,
      poisonous: 1,
      specific_care: 'Limpiar hojas con paño humedo y evitar sol directo fuerte.',
      extra_factors: 'Sensibilidad al exceso de agua en invierno.',
    },
    {
      name: 'Sansevieria Trifasciata',
      description: 'Muy resistente, ideal para principiantes y espacios con poca luz.',
      price: 12990,
      light_type: 'Baja a media, tolera luz indirecta',
      watering: 'Cada 12-15 dias',
      location: 'Interior',
      toxicity: 'Puede causar malestar en mascotas si se mastica',
      temperature_range: '15-30 C',
      humidity: 'Baja a media',
      substrate: 'Para cactus o suculentas con buen drenaje',
      fertilization: 'Cada 45 dias en temporada calida',
      pruning: 'Solo retiro de hojas dañadas',
      pests: 'Pulgones ocasionales',
      pet_friendly: 0,
      poisonous: 1,
      specific_care: 'No encharcar. Prefiere maceta ajustada.',
      extra_factors: 'Tolera ambientes con aire acondicionado.',
    },
    {
      name: 'Pothos Neon',
      description: 'Enredadera de rapido crecimiento con hojas verde lima.',
      price: 9990,
      light_type: 'Indirecta media',
      watering: 'Cada 6-8 dias',
      location: 'Interior',
      toxicity: 'Toxica para mascotas por oxalatos',
      temperature_range: '18-28 C',
      humidity: 'Media',
      substrate: 'Universal con perlita',
      fertilization: 'Mensual en crecimiento activo',
      pruning: 'Pinzar puntas para ramificar',
      pests: 'Trips y cochinilla',
      pet_friendly: 0,
      poisonous: 1,
      specific_care: 'Ideal en altura o colgante, girar maceta cada 2 semanas.',
      extra_factors: 'Pierde color en poca luz.',
    },
    {
      name: 'Lavanda',
      description: 'Aromatica de exterior con floracion violeta y uso ornamental.',
      price: 7490,
      light_type: 'Sol directo 6+ horas',
      watering: '2 veces por semana, moderado',
      location: 'Exterior',
      toxicity: 'No toxica en general, evitar consumo excesivo',
      temperature_range: '10-30 C',
      humidity: 'Baja',
      substrate: 'Seco y arenoso',
      fertilization: 'Ligera cada 60 dias',
      pruning: 'Poda despues de floracion',
      pests: 'Hongos por exceso de humedad',
      pet_friendly: 1,
      poisonous: 0,
      specific_care: 'Evitar suelos pesados o encharcados.',
      extra_factors: 'Excelente para atraer polinizadores.',
    },
    {
      name: 'Ficus Lyrata',
      description: 'Planta de interior elegante con hojas grandes tipo violin.',
      price: 32990,
      light_type: 'Luz muy brillante sin sol directo intenso',
      watering: 'Cada 7-10 dias',
      location: 'Interior',
      toxicity: 'Toxica para mascotas al ingerir savia',
      temperature_range: '18-26 C',
      humidity: 'Media alta',
      substrate: 'Rico y con drenaje',
      fertilization: 'Cada 30 dias en primavera/verano',
      pruning: 'Poda formativa ligera',
      pests: 'Araña roja, cochinilla',
      pet_friendly: 0,
      poisonous: 1,
      specific_care: 'No mover constantemente de lugar.',
      extra_factors: 'Sensibilidad a corrientes de aire frio.',
    },
    {
      name: 'Aloe Vera',
      description: 'Suculenta medicinal de bajo mantenimiento.',
      price: 6990,
      light_type: 'Luz abundante o sol suave',
      watering: 'Cada 15 dias',
      location: 'Ambos',
      toxicity: 'Gel util, pero latex puede irritar',
      temperature_range: '14-32 C',
      humidity: 'Baja',
      substrate: 'Para cactus',
      fertilization: 'Cada 60 dias en crecimiento',
      pruning: 'Retirar hojas basales secas',
      pests: 'Cochinilla en hojas',
      pet_friendly: 0,
      poisonous: 0,
      specific_care: 'Maceta con excelente drenaje.',
      extra_factors: 'Evitar heladas.',
    },
    {
      name: 'Helecho Boston',
      description: 'Frondoso y decorativo, ideal para ambientes humedos.',
      price: 10990,
      light_type: 'Luz indirecta media',
      watering: 'Mantener sustrato ligeramente humedo',
      location: 'Interior',
      toxicity: 'Generalmente no toxico',
      temperature_range: '16-25 C',
      humidity: 'Alta',
      substrate: 'Ligero y organico',
      fertilization: 'Cada 45 dias',
      pruning: 'Retirar frondas secas',
      pests: 'Araña roja en ambientes secos',
      pet_friendly: 1,
      poisonous: 0,
      specific_care: 'Pulverizar agua en clima seco.',
      extra_factors: 'Agradece baños de humedad periodicos.',
    },
    {
      name: 'Cactus Echinopsis',
      description: 'Cactus compacto de facil cuidado y floracion estacional.',
      price: 5990,
      light_type: 'Sol directo o luz muy alta',
      watering: 'Cada 20 dias (menos en invierno)',
      location: 'Ambos',
      toxicity: 'No toxico, pero con espinas',
      temperature_range: '10-35 C',
      humidity: 'Baja',
      substrate: 'Muy drenante',
      fertilization: 'Cada 60 dias en temporada calida',
      pruning: 'No requiere, solo limpieza',
      pests: 'Cochinilla algodonosa',
      pet_friendly: 1,
      poisonous: 0,
      specific_care: 'Evitar agua acumulada en base.',
      extra_factors: 'Proteger de lluvias intensas continuas.',
    },
    {
      name: 'Calathea Orbifolia',
      description: 'Follaje ornamental con patrones plateados.',
      price: 21990,
      light_type: 'Luz indirecta media',
      watering: 'Cada 5-7 dias con agua baja en cal',
      location: 'Interior',
      toxicity: 'No toxica para mascotas',
      temperature_range: '18-27 C',
      humidity: 'Alta (60%+)',
      substrate: 'Suelto, humedo y drenante',
      fertilization: 'Cada 30 dias en crecimiento',
      pruning: 'Retirar hojas amarillas',
      pests: 'Trips y araña roja',
      pet_friendly: 1,
      poisonous: 0,
      specific_care: 'Evitar corrientes frias y sol directo.',
      extra_factors: 'Sensible a agua con cloro.',
    },
    {
      name: 'Romero',
      description: 'Aromatica culinaria resistente y de facil poda.',
      price: 5490,
      light_type: 'Sol directo 5-8 horas',
      watering: '2 veces por semana en verano, menos en invierno',
      location: 'Exterior',
      toxicity: 'No toxico en uso normal',
      temperature_range: '8-30 C',
      humidity: 'Baja a media',
      substrate: 'Ligero y bien aireado',
      fertilization: 'Cada 45 dias',
      pruning: 'Poda frecuente para estimular brotes',
      pests: 'Mildiu en exceso de humedad',
      pet_friendly: 1,
      poisonous: 0,
      specific_care: 'No exceder riego, le gusta secarse entre riegos.',
      extra_factors: 'Se adapta bien a maceta y suelo directo.',
    },
  ];

  const usedSeedCodes = new Set();
  let seedId = 1;

  for (const plant of samplePlants) {
    let code = normalizePlantCode(plant.code || buildFallbackPlantCode(plant.name, seedId, usedSeedCodes));
    if (!code || usedSeedCodes.has(code)) {
      code = buildFallbackPlantCode(plant.name, seedId, usedSeedCodes);
    }
    usedSeedCodes.add(code);

    await pool.query(
      `INSERT INTO plants (
          code, name, description, image_path, price, light_type, watering, location, toxicity,
          temperature_range, humidity, substrate, fertilization, pruning, pests,
          pet_friendly, poisonous, specific_care, extra_factors
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        plant.name,
        plant.description,
        resolvePlantImagePath(plant.image_path, plant.name),
        plant.price,
        plant.light_type,
        plant.watering,
        plant.location,
        plant.toxicity,
        plant.temperature_range,
        plant.humidity,
        plant.substrate,
        plant.fertilization,
        plant.pruning,
        plant.pests,
        plant.pet_friendly,
        plant.poisonous,
        plant.specific_care,
        plant.extra_factors,
      ]
    );

    seedId += 1;
  }

  console.log('Se cargaron 10 plantas de ejemplo.');
}


