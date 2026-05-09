<div align="center">

<img src="https://ufvebjscabomuayqtyyo.supabase.co/storage/v1/object/public/task-reports/MARCA%20DE%20AGUA%20BLANCO.png" width="80" alt="moon Studios" />

# moon Studios — Portal Corporativo

Plataforma empresarial interna de moon Studios. Sistema de gestión de usuarios, roles, comunicación y operaciones corporativas.

[![Web Corporativa](https://img.shields.io/badge/🌐_Web_Corporativa-moon--studios.netlify.app-black?style=flat-square)](https://moon-studios.netlify.app)
[![Portal Dashboard](https://img.shields.io/badge/🖥️_Portal_Dashboard-Acceso_Restringido-111116?style=flat-square)](https://moon-studios-dashboard.netlify.app)
[![Estado](https://img.shields.io/badge/Estado-Activo-white?style=flat-square)]()
[![Versión](https://img.shields.io/badge/Versión-1.0.0-gray?style=flat-square)]()

</div>

---

## Acceso

| Recurso | URL |
|---|---|
| 🌐 Web corporativa | [moon-studios.netlify.app](https://moon-studios.netlify.app) |
| 🖥️ Portal dashboard | [moon-studios-dashboard.netlify.app](https://moon-studios-dashboard.netlify.app) |

> ⚠️ El portal es de **acceso restringido**. Solo personal autorizado de moon Studios puede ingresar.

---

## Características

- 🔐 **Autenticación** con Firebase (Email/Password)
- 👥 **Sistema de roles** — CEO, Administración, Empleados y más
- 🤖 **Panel Discord Bot** — Servidores, comandos y estadísticas
- 📅 **Calendario de tareas** — Crear, editar y eliminar tareas
- 📢 **Sistema de anuncios** — Comunicados internos
- 💬 **Mensajería interna** — Comunicación entre empleados
- 🧵 **Hilos** — Discusiones internas por tema
- 📊 **Panel CEO** — Métricas y gestión ejecutiva
- 🌙 **Diseño minimalista** — Negro, blanco y gris con fuente Inter

---

## Stack Tecnológico

| Tecnología | Uso |
|---|---|
| React + TypeScript | Frontend |
| Vite | Bundler |
| Tailwind CSS + shadcn/ui | Estilos y componentes |
| Firebase Auth + Firestore | Autenticación y base de datos |
| Supabase Storage | Almacenamiento de archivos |
| Tauri | App de escritorio (Windows/macOS/Linux) |
| Lucide React | Iconografía |
| date-fns | Manejo de fechas |

---

## Instalación y Desarrollo

```bash
# 1. Clonar el repositorio
git clone https://github.com/pandita1589/moon-Studios-Dashboard.git
cd moon-Studios-Dashboard

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 4. Iniciar en modo desarrollo (web)
npm run dev

# 5. Iniciar en modo desarrollo (app de escritorio)
npx tauri dev

# 6. Build para producción (web)
npm run build

# 7. Build para app de escritorio (.exe)
npx tauri build
```

---

## Variables de Entorno

Crea un archivo `.env` en la raíz con las siguientes variables:

```env
VITE_FIREBASE_API_KEY=tu_api_key
VITE_FIREBASE_AUTH_DOMAIN=tu_auth_domain
VITE_FIREBASE_PROJECT_ID=tu_project_id
VITE_FIREBASE_STORAGE_BUCKET=tu_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=tu_messaging_sender_id
VITE_FIREBASE_APP_ID=tu_app_id
VITE_SUPABASE_URL=tu_supabase_url
VITE_SUPABASE_ANON_KEY=tu_supabase_anon_key
```

> 🔒 Nunca subas el archivo `.env` al repositorio.

---

## Configuración de Firebase

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com/)
2. Habilita **Authentication** → Email/Password
3. Crea una base de datos **Firestore**
4. Copia las credenciales al archivo `.env`

---

## Estructura de Base de Datos

<details>
<summary>Ver colecciones de Firestore</summary>

### `users`
```typescript
{
  email: string,
  displayName: string,
  role: 'CEO' | 'Administración' | 'Empleado' | 'Contador' | 'Diseño' | 'Programación' | 'Secretaría',
  createdAt: Timestamp
}
```

### `tasks`
```typescript
{
  title: string,
  description: string,
  date: Timestamp,
  priority: 'low' | 'medium' | 'high',
  status: 'pending' | 'in-progress' | 'completed',
  assignedTo: string,
  createdBy: string
}
```

### `announcements`
```typescript
{
  title: string,
  content: string,
  createdBy: string,
  important: boolean,
  createdAt: Timestamp
}
```

### `discord/botData`
```typescript
{
  servers: Array<{ id, name, icon, memberCount }>,
  totalUsers: number,
  totalCommands: number,
  status: 'online' | 'offline' | 'maintenance',
  uptime: string
}
```

</details>

---

## Permisos por Rol

| Función | CEO | Admin | Contador | Programación | Diseño | Secretaría | Empleado |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Ver Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Calendario | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Crear/Editar Tareas | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Panel CEO | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Gestión Usuarios | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Discord Bot | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Anuncios | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Panel Propio | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

---

## App de Escritorio

El portal también está disponible como aplicación de escritorio para Windows, macOS y Linux gracias a **Tauri**.

```bash
# Requisitos previos
# - Rust: https://rustup.rs
# - Visual Studio Build Tools (Windows)

# Ejecutar como app de escritorio
npx tauri dev

# Generar instalador
npx tauri build
# El .exe queda en: src-tauri/target/release/bundle/nsis/
```

---

<div align="center">

**moon Studios** — Todos los derechos reservados © 2026

[🌐 moon-studios.netlify.app](https://moon-studios.netlify.app)

</div>
