# Despliegue en Ubuntu 24.04 LTS con Nginx

**Preparación únicamente: no se ha accedido a ningún VPS ni se ha desplegado.**
Un VPS con 2 GB de RAM y 1–2 vCPU es un punto de partida para medir, no una garantía de capacidad. Una sola petición pesada por instancia; las demás reciben 503 con `Retry-After`. El motor no requiere GPU ni claves. El coste es tu infraestructura, dominio y transferencia; no se ha contratado nada.

## Instalar y comprobar

Instala Node.js 24 LTS desde el distribuidor oficial siguiendo https://nodejs.org/en/download. Se requiere Node >=22.9; el Node de los repositorios de Ubuntu puede ser anterior. Después:

```bash
sudo apt update
sudo apt install nginx git python3 python3-venv tesseract-ocr
sudo useradd --system --home /opt/fontea --shell /usr/sbin/nologin fontea
sudo git clone https://github.com/ballegrafico-droid/Fontea.git /opt/fontea
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

Si la entrega aún no está subida a GitHub, copia el archivo de entrega a `/opt/fontea` en lugar de clonarlo. No es necesario volver a descargar el catálogo ni los modelos de OCR incluidos en `engine/tessdata`. Los 17 archivos de licencia deben permanecer junto a las fuentes. Configura `.env`:

```dotenv
PORT=3001
HOST=127.0.0.1
PYTHON_BIN=/opt/fontea/.venv/bin/python3
ENGINE_TIMEOUT_MS=45000
TRUST_PROXY=1
TESSERACT_LANG=spa+eng
```

`.env` no se versiona. Aquí no hay secretos. No abras el puerto 3001 al exterior cuando uses `TRUST_PROXY=1`: únicamente Nginx debe poder conectarse. Mantén UNA instancia de Node; el límite de concurrencia es por proceso. Para escalar, añade una cola global y mide CPU/RAM primero.

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
curl --fail http://127.0.0.1:3001/api/health
sudo journalctl -u fontea -n 50
```

`/api/health` comprueba servidor y catálogo, no ejecuta un OCR. `doctor.py`, `npm test` y una carga manual son la comprobación del motor. Después de actualizar, ejecuta `npm ci`, compila, prueba y reinicia el servicio. Conserva la revisión anterior para poder volver atrás.

## Nginx

Sustituye `fontea.ejemplo.com` por tu dominio. Archivo `/etc/nginx/sites-available/fontea`:

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
        proxy_pass http://127.0.0.1:3001;
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
