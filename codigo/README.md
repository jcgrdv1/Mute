# MUTE

Control de acceso facial.

## Piezas

| Pieza | Corre en | Se conecta con |
|---|---|---|
| `backend/`, `frontend/`, `nginx/` | Servidor (Docker) | PostgreSQL 16 |
| `scripts/` (bridge) | PC del lugar | Servidor por HTTPS y terminales por la red local |
| `kiosk/` | PC del lugar | Nada, corre local con la cámara |

## Servidor

- `docker-compose.prod.yml`: `db`, `backend`, `frontend`, `nginx`. Expone 80 y 443.
- Variables en `.env.prod` (plantilla: `.env.prod.example`, ya con los valores que no son secretos).
- Dominio: `mute.humanhood.mx`. Está fijo en `nginx/nginx.conf` y en `CORS_ORIGINS`.
- Certificados: `/etc/letsencrypt/live/<dominio>/` del servidor, montado en `nginx`.
- El frontend llama a la API en `/api` del mismo dominio.
- El backend crea tablas vacías al arrancar si no existen. La base del respaldo ya trae las suyas.
- Fotos: volumen `uploads`, en `/app/uploads` dentro del backend (`UPLOAD_DIR=./uploads`).

## Respaldo

En la carpeta `respaldo/`, aparte del código:

| Archivo | Qué es | Va en |
|---|---|---|
| `base.sql.gz` | Base completa (PostgreSQL 16), sin dueño ni permisos | La base de `.env.prod` |
| `fotos/` | 7,708 fotos y `.admin_password` | `/app/uploads` |
| `bridge_synced.json` | Qué usuario ya está cargado en qué terminal, al 21 de octubre | `scripts/`, junto al bridge |

Sin `bridge_synced.json` el bridge vuelve a subir todas las caras a las terminales.

## Accesos

- Panel `/admin`: la contraseña está en `fotos/.admin_password` y tiene prioridad sobre `ADMIN_PASSWORD`. Se cambia desde el panel.
- Panel `/pr`: 4 cuentas de PR, guardadas en la base.
- Registro de clientes: `/register`, con PIN.

## Bridge (PC del lugar)

- Python 3.11 con `httpx` y `pillow`. `run_bridge.bat` lo mantiene corriendo; la ruta de Python está al inicio del archivo.
- Configuración en `scripts/bridge_config.json` (plantilla: `bridge_config.json.template`):
  - `server_url`: dirección del servidor.
  - `admin_password`: contraseña del panel `/admin`.
  - `pass` de cada terminal: contraseña de esa terminal.
- La PC tiene que estar en la red de las terminales.
- En el lugar, el bridge y el kiosco arrancaban desde la carpeta Inicio del usuario `kiosk`.

| Terminal | Modelo Hikvision | Capacidad | IP | Asignación |
|---|---|---|---|---|
| Terminal 1 | DS-K1T342MFWX-E1 | 1,500 caras | 192.168.100.240 | `primary`: VIP y los más antiguos, hasta 1490 |
| Terminal 2 | DS-K1T673DWX | 10,000 caras | 192.168.100.241 | `all`: todos |

Usuario de las dos: `admin`. Puerto: 80.

## Kiosco (PC del lugar)

`mute-kiosk.bat` abre `kiosk/index.html` en Chrome en modo kiosco desde `C:\Users\kiosk\mute-kiosk`. No usa el servidor. `restart-kiosk.bat` lo reinicia.
