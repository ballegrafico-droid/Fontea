# Despliegue en Ubuntu 24.04 LTS con Nginx

**Preparación únicamente: no se ha accedido a ningún VPS ni se ha desplegado.**
Un VPS con 2 GB de RAM y 1–2 vCPU es un punto de partida para medir, no una garantía de capacidad. Una sola petición pesada por instancia; las demás reciben 503 con `Retry-After`. El motor no requiere GPU ni claves. El coste es tu infraestructura, dominio y transferencia; no se ha contratado nada.

## Elegir una instalación independiente

Esta entrega está en la rama `codex/fontea-v1` (PR #1); no clones `main` mientras no se haya integrado. No ejecutes comandos sobre directorios o servicios de otras aplicaciones. Antes de instalar:

```bash
test ! -e /opt/fontea
getent passwd fontea
sudo systemctl status fontea --no-pager
sudo ss -ltnp
sudo nginx -T
```

Los dos primeros comandos pueden informar de que la cuenta o ruta todavía no existen; es lo esperado en una instalación nueva. Si ya hay una instalación de Fontea, conserva su `.env`, copia de seguridad y revisión antes de actualizarla; no repitas `useradd` ni `clone`. No sobrescribas una ruta, cuenta, servicio o dominio que pertenezca a otra aplicación.

En este ejemplo se usa **3401**: comprueba en `ss` que esté libre y, si no, elige otro puerto entre 1024 y 65535. Usa exactamente el mismo en `PORT`, `proxy_pass` y las pruebas `curl`. La aplicación se detiene con un mensaje si encuentra el puerto ocupado; no mata procesos ni elige otro silenciosamente. El subdominio de Fontea debe ser distinto de los ya configurados en `nginx -T`. No borres el sitio `default` ni otras configuraciones.

## Instalar y comprobar

Instala Node.js 24 LTS desde el distribuidor oficial siguiendo https://nodejs.org/en/download. Se requiere Node >=22.9; el Node de los repositorios de Ubuntu puede ser anterior. Después:

```bash
sudo apt update
sudo apt install nginx git python3 python3-venv tesseract-ocr
sudo useradd --system --home /opt/fontea --shell /usr/sbin/nologin fontea
sudo git clone --branch codex/fontea-v1 --single-branch https://github.com/ballegrafico-droid/Fontea.git /opt/fontea
sudo chown -R fontea:fontea /opt/fontea
cd /opt/fontea
sudo -u fontea python3 -m venv .venv
sudo -u fontea .venv/bin/pip install -r requirements.txt
sudo -u fontea npm ci
sudo -u fontea npm run build
sudo -u fontea .venv/bin/python scripts/doctor.py
sudo -u fontea env PYTHON_BIN=/opt/fontea/.venv/bin/python3 npm test
sudo -u fontea cp .env.example .env
```

Si la entrega aún no está subida a GitHub, copia el archivo de entrega a `/opt/fontea` en lugar de clonarlo. No es necesario volver a descargar el catálogo ni los modelos de OCR incluidos en `engine/tessdata`. Los 117 archivos de licencia deben permanecer junto a las fuentes. Configura `.env`:

```dotenv
PORT=3401
HOST=127.0.0.1
PYTHON_BIN=/opt/fontea/.venv/bin/python3
ENGINE_TIMEOUT_MS=45000
TRUST_PROXY=1
TESSERACT_LANG=spa+eng
```

`.env` no se versiona. Aquí no hay secretos. No abras el puerto 3401 al exterior cuando uses `TRUST_PROXY=1`: únicamente Nginx debe poder conectarse. Mantén UNA instancia de Node; el límite de concurrencia es por proceso. Para escalar, añade una cola global y mide CPU/RAM primero.

## Servicio systemd

Guarda en `/etc/systemd/system/fontea.service` (comprueba que `/usr/bin/node` sea el Node 24 instalado; `command -v node`):

```ini
[Unit]
Description=Fontea
After=network.target

[Service]
Type=simple
User=fontea
Group=fontea
WorkingDirectory=/opt/fontea
ExecStart=/usr/bin/node --env-file=/opt/fontea/.env /opt/fontea/dist-server/index.js
Environment=OPENBLAS_NUM_THREADS=1
Environment=OMP_NUM_THREADS=1
Restart=on-failure
RestartSec=5
TimeoutStopSec=10
KillMode=control-group
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
MemoryMax=1G
CPUQuota=100%
TasksMax=48
UMask=0077

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fontea
curl --fail http://127.0.0.1:3401/api/health
sudo journalctl -u fontea -n 50
```

`/api/health` comprueba servidor y catálogo, no ejecuta un OCR. `doctor.py`, `npm test` y una carga manual son la comprobación del motor. Después de actualizar, ejecuta `npm ci`, compila, prueba y reinicia el servicio. Conserva la revisión anterior para poder volver atrás.

## Nginx

Sustituye `fontea.ejemplo.com` por tu dominio. Comprueba primero `test ! -e /etc/nginx/sites-available/fontea` y `test ! -e /etc/nginx/sites-enabled/fontea`. Si ya existen, revisa su contenido. Crea un archivo nuevo `/etc/nginx/sites-available/fontea` con:

```nginx
server {
    listen 80;
    server_name fontea.ejemplo.com;

    client_max_body_size 9m;
    client_body_buffer_size 9m;
    client_body_timeout 15s;
    client_header_timeout 15s;
    send_timeout 60s;

    location / {
        proxy_pass http://127.0.0.1:3401;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

El buffering de peticiones está desactivado para evitar archivos temporales de imágenes en Nginx. No habilites registro de cuerpos de petición en el proxy ni en herramientas de observabilidad. La aplicación solo mantiene los recortes en RAM, no registra imágenes/texto y mata el grupo de procesos del motor al cancelar o agotar el tiempo. Los logs de acceso de Nginx pueden contener IP, fecha y ruta; establece una retención apropiada.

```bash
sudo ln -s /etc/nginx/sites-available/fontea /etc/nginx/sites-enabled/fontea
sudo nginx -t
sudo systemctl reload nginx
```

Configura DNS y HTTPS antes de ofrecer la aplicación a usuarios (por ejemplo, Certbot con el complemento de Nginx, siguiendo https://certbot.eff.org/). El ejemplo HTTP no configura certificados. No se han probado estas instrucciones en un VPS real ni los límites systemd; valida primero en una instancia de pruebas. El proceso web y las pruebas de la aplicación sí se han ejecutado en el entorno de desarrollo.

## Opción sin Node/Python en producción

`npm ci && npm run build:web` produce `out/`, una versión funcional que procesa imágenes en el navegador. Puede servirse desde un **subdominio HTTPS** con Nginx estático (`root /opt/fontea/out;`, `index index.html;` y `location / { try_files $uri $uri/ /index.html; }`), sin puerto de aplicación ni servicio systemd. Configura los tipos MIME de JavaScript y WebAssembly incluyendo `/etc/nginx/mime.types`. No uses caché larga para `index.html`; las rutas de fuentes y modelos deben conservarse. Mantén las licencias incluidas. Requiere navegadores actuales con Workers, OffscreenCanvas, FontFace y WASM. Las mediciones de esa modalidad se documentan por separado; sus resultados pueden diferir del motor Python. No publiques `node_modules`, `.git`, `.env` ni la raíz del proyecto.

El índice de `catalog/index/` debe acompañar al manifiesto. El servidor lo sirve en `/catalog-index`; la compilación estática lo copia con nombre basado en SHA. No reconstruyas el índice en cada arranque ni descargues fuentes al analizar. Si amplías el catálogo, ejecuta los scripts de ampliación/índice antes de compilar y vuelve a evaluar. La memoria medida en Chromium emulado no equivale a la RAM necesaria del proceso Node/Python; mide tu carga antes de ajustar los límites systemd.

## Revisión 0.5: comparación con archivo propio

No requiere instalar fuentes comerciales en el VPS, rutas de subida de fuentes, claves ni abrir puertos adicionales. La comparación del archivo propio ocurre en un Worker en el navegador, también con el backend Node/Python. Mantén la aplicación en el puerto libre que configures con `PORT` y la configuración de Nginx anterior. No se ha accedido al VPS ni aplicado estos comandos.

La API de reconocimiento comercial permanece sin configurar: la compilación estática no puede guardar claves privadas. Antes de añadir esa integración hay que resolver autorización, cuota y costes con el proveedor; consulta [COMERCIALES.md](COMERCIALES.md). No habilites envíos de fuentes propias ni conviertas `VITE_*` en almacén de secretos.
