# Óptica HL — Backend API

Servicio backend centralizado para la administración integral de **Óptica HL**. Esta API RESTful está construida sobre el ecosistema de **Node.js** y **Express**, proveyendo soporte a operaciones clínicas, punto de venta (POS), control de inventarios multi-sucursal, auditoría de eventos y emisión electrónica de comprobantes fiscales (CFDI / PAC).

---

## 📌 Tabla de Contenidos

- [Descripción General](#-descripción-general)
- [Arquitectura y Tecnologías](#-arquitectura-y-tecnologías)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Módulos Principales](#-módulos-principales)
- [Requisitos Previos](#-requisitos-previos)
- [Instalación y Configuración](#-instalación-y-configuración)
- [Variables de Entorno](#-variables-de-entorno)
- [Ejecución](#-ejecución)
- [Integración y Despliegue Continuo (CI/CD)](#-integración-y-despliegue-continuo-cicd)
- [Buenas Prácticas y Mantenimiento](#-buenas-prácticas-y-mantenimiento)

---

## 📖 Descripción General

El backend de **Óptica HL** gestiona de forma unificada el flujo de negocio de una cadena de ópticas:
1. **Flujo Clínico y Órdenes:** Registro de pacientes/clientes, seguimiento de órdenes graduadas y órdenes de reparación de armazones.
2. **Punto de Venta e Inventario:** Control de existencias por sucursal, catálogo de artículos, políticas de descuentos y cortes de caja por turno/operador.
3. **Facturación Fiscal y Notificaciones:** Emisión de CFDI en conexión con Proveedor Autorizado de Certificación (PAC), renderizado dinámico de facturas en PDF (`EJS`) y envío automatizado de recordatorios y comprobantes por correo electrónico.
4. **Seguridad y Trazabilidad:** Autenticación por roles con middleware de auditoría que registra cada operación sensible en la base de datos.

---

## 🛠 Arquitectura y Tecnologías

- **Entorno de Ejecución:** Node.js (>= 18.x)
- **Framework Web:** [Express.js](https://expressjs.com/)
- **Base de Datos:** Relacional / SQL (abstraída en `src/config/db.js`)
- **Seguridad & Sesiones:** JSON Web Tokens (JWT) / Hash de contraseñas
- **Plantillas & Renderizado:** [EJS](https://ejs.co/) (para plantillas de facturación y reportes)
- **Servicios Externos:**
  - Integración con PAC para timbrado fiscal (CFDI).
  - Servicio de transporte SMTP para correos y recordatorios.
  - Generador de documentos PDF para recibos y facturas.
- **CI/CD:** GitHub Actions (`.github/workflows/deploy.yml`).

---

## 📂 Estructura del Proyecto

El código fuente sigue un patrón de diseño por capas (Controlador - Ruta - Servicio - Configuración):

```text
OpticaHL-Backend/
├── .github/
│   └── workflows/
│       └── deploy.yml          # Pipeline de despliegue continuo (CI/CD)
├── src/
│   ├── config/
│   │   └── db.js               # Conexión y pool de la base de datos
│   ├── controllers/            # Lógica de negocio y manejo de peticiones HTTP
│   │   ├── articulo.controller.js
│   │   ├── auth.controller.js
│   │   ├── caja.controller.js
│   │   ├── cliente.controller.js
│   │   ├── descuento.controller.js
│   │   ├── facturacion.controller.js
│   │   ├── inventario.controller.js
│   │   ├── operador.controller.js
│   │   ├── orden.controller.js
│   │   ├── ordenreparacion.controller.js
│   │   ├── proveedor.controller.js
│   │   ├── reporte.controller.js
│   │   ├── soporte.controller.js
│   │   └── sucursal.controller.js
│   ├── middlewares/            # Interceptores y filtros de peticiones
│   │   ├── audit.middleware.js # Registro de auditoría y bitácora de actividad
│   │   ├── auth.middleware.js  # Verificación de identidad y tokens JWT
│   │   └── rol.middleware.js   # Autorización basada en perfiles y privilegios
│   ├── routes/                 # Definición de endpoints de la API REST
│   │   ├── articulo.routes.js
│   │   ├── auth.routes.js
│   │   ├── caja.routes.js
│   │   ├── cliente.routes.js
│   │   ├── descuento.routes.js
│   │   ├── facturacion.routes.js
│   │   ├── inventario.routes.js
│   │   ├── operador.routes.js
│   │   ├── orden.routes.js
│   │   ├── ordenreparacion.routes.js
│   │   ├── proveedor.routes.js
│   │   ├── reporte.routes.js
│   │   ├── soporte.routes.js
│   │   └── sucursal.routes.js
│   ├── services/               # Integraciones y servicios auxiliares
│   │   ├── cfdi.service.js     # Creación y parsing del XML de CFDI
│   │   ├── correo.service.js   # Despacho de notificaciones y facturas vía email
│   │   ├── pac.service.js      # Comunicación y timbrado con el PAC
│   │   ├── pdf.service.js      # Generación programática de archivos PDF
│   │   └── recordatorio.service.js # Tareas programadas / recordatorios a clientes
│   ├── templates/
│   │   └── factura.ejs         # Maquetación visual de la factura fiscal
│   └── server.js               # Punto de entrada de la aplicación y montaje de rutas
├── .gitignore
├── package.json
└── README.md
```

---

## 🧩 Módulos Principales

| Módulo | Prefijo de Ruta sugerido | Propósito |
| :--- | :--- | :--- |
| **Auth & Operadores** | `/api/auth`, `/api/operadores` | Login, gestión de usuarios, recuperación de credenciales y roles. |
| **Sucursales & Cajas** | `/api/sucursal`, `/api/caja` | Aperturas, cierres, arqueos y administración de puntos físicos. |
| **Clientes** | `/api/cliente` | Padrón de clientes, historial de visitas y graduaciones. |
| **Artículos & Proveedores** | `/api/articulo`, `/api/proveedor` | Catálogo de armazones, micas, lentes de contacto y distribuidores. |
| **Inventario** | `/api/inventario` | Movimientos de stock, transferencias entre sucursales y ajustes. |
| **Órdenes & Reparaciones**| `/api/orden`, `/api/ordenreparacion` | Pedidos de lentes oftálmicos, solares y órdenes de taller. |
| **Facturación Fiscal** | `/api/facturacion` | Timbrado SAT mediante PAC, emisión de XML/PDF y envío por email. |
| **Descuentos & Reportes** | `/api/descuento`, `/api/reporte` | Reglas promocionales, reportes de ventas, rentabilidad y métricas. |
| **Soporte & Auditoría** | `/api/soporte` | Seguimiento de incidencias técnicas y bitácoras de auditoría de usuarios. |

---

## 📋 Requisitos Previos

- **Node.js** v18.0.0 o superior.
- **npm** v9.0.0 o superior (o gestor compatible como `pnpm` / `yarn`).
- Acceso a una instancia de base de datos compatible según la configuración de `db.js`.
- Credenciales vigentes para el servicio de timbrado PAC (entorno de pruebas o producción).
- Servidor de correo saliente SMTP (ej. SendGrid, Mailgun o Gmail con App Password).

---

## ⚙️ Instalación y Configuración

1. **Clonar el repositorio:**
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd OpticaHL-Backend
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar el entorno:**
   Cree un archivo `.env` en la raíz del proyecto tomando como referencia las variables descritas en la sección siguiente.

---

## 🔐 Variables de Entorno

Asegúrese de pedir las variables de entorno al equipo de desarrollo y luego colocarlas en su archivo `.env` local:


---

## 🚀 Ejecución

### Modo Desarrollo (con recarga automática)
```bash
npm run dev
```

### Modo Producción
```bash
npm start
```

El servidor inicializará los middlewares, comprobará la conexión a la base de datos y quedará a la escucha en el puerto especificado (por defecto `http://localhost:3000`).

---

## 🔄 Integración y Despliegue Continuo (CI/CD)

El proyecto incluye un pipeline automatizado en `.github/workflows/deploy.yml`. 

Cada push o merge a la rama principal (`main` / `master`) ejecuta automáticamente:
1. Validación de dependencias y pruebas unitarias/integración (si aplican).
2. Empaquetado o despliegue directo al entorno de ejecución en la nube / VPS.

Para configurar el flujo de producción, asegúrese de agregar los **Secrets** requeridos en el repositorio de GitHub:
- `HOST_SERVER` / `SSH_PRIVATE_KEY` / `SERVER_USER` (si se despliega mediante SSH).
- O credenciales del proveedor de hosting (AWS, Render, Heroku, DigitalOcean, etc.).

---

## 🛡️ Buenas Prácticas y Mantenimiento

- **Auditoría obligatoria:** Todas las rutas que modifiquen datos financieros o inventario deben implementar `audit.middleware.js`.
- **Validación de Roles:** Las operaciones críticas (cortes de caja, anulación de facturas, creación de operadores) deben estar protegidas bajo `rol.middleware.js`.
- **Logs:** Evite registrar datos sensibles (contraseñas, llaves privadas del SAT) en la consola o bitácoras.
