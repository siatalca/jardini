# Jardini - Sistema de venta de plantas

Sistema en **Node.js + MySQL** con frontend en **HTML/CSS/JavaScript**.

Incluye:
- Modulo de ingreso/edicion/eliminacion de plantas.
- Codigo obligatorio y unico por planta.
- Modulo de ventas con multiples items.
- Link unico por planta vendida para que el cliente vea sus cuidados.
- 10 plantas de ejemplo (se cargan automaticamente si la tabla `plants` esta vacia).
- Diseno responsive (mobile-first) para uso principal en telefono.

## Configuracion rapida

1. Copia variables de entorno:

```bash
copy .env.example .env
```

2. Instala dependencias:

```bash
npm install
```

3. Inicia servidor:

```bash
npm start
```

Servidor por defecto:
- `http://localhost:3009/jardini`

Si quieres servirlo en la raiz del dominio/subdominio:
- usa `BASE_PATH=/`
- URL esperada: `http://localhost:3009/`

## Base de datos

- Al arrancar, el servidor crea automaticamente la base (`jardini`) y tablas necesarias si no existen.
- `schema.sql` queda como referencia/backup para importacion manual desde MySQL o phpMyAdmin.

## URL publica de cuidados

Cuando registras una venta, el sistema genera enlaces como:
- `http://localhost:3009/jardini/care/<token>` (si `BASE_PATH=/jardini`)
- `http://localhost:3009/care/<token>` (si `BASE_PATH=/`)

Ese enlace muestra al cliente:
- Luz
- Riego
- Interior/Exterior
- Toxicidad y si es venenosa
- Humedad, temperatura, sustrato, poda, fertilizacion
- Cuidados especificos y factores adicionales

## Despliegue en subdominio (`jardini.mi-registro.cl`)

1. Crea el DNS del subdominio apuntando al IP del servidor.
2. En el servidor, sube este proyecto e instala dependencias con `npm install --omit=dev`.
3. Configura `.env` para produccion:

```env
PORT=3009
BASE_PATH=/
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=tu_usuario
DB_PASSWORD=tu_password
DB_NAME=jardini
TRUST_PROXY=true
```

4. Configura un proxy inverso (Apache/Nginx) para que `jardini.mi-registro.cl` apunte a `http://127.0.0.1:3009`.
   - Plantilla lista: `deploy/apache/jardini.mi-registro.cl.conf`
   - Variables sugeridas: `deploy/.env.subdomain.example`

Ejemplo Apache (VirtualHost HTTPS):

```apache
<VirtualHost *:443>
  ServerName jardini.mi-registro.cl

  SSLEngine on
  SSLCertificateFile /ruta/cert.pem
  SSLCertificateKeyFile /ruta/key.pem

  ProxyPreserveHost On
  ProxyPass / http://127.0.0.1:3009/
  ProxyPassReverse / http://127.0.0.1:3009/

  RequestHeader set X-Forwarded-Proto "https"
</VirtualHost>
```

5. Levanta el proceso Node (recomendado PM2):

```bash
npx pm2 start server.js --name jardini
npx pm2 save
```

Con esto deberias abrir directamente:
- `https://jardini.mi-registro.cl`
