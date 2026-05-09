# Moon Studios Dashboard

Dashboard empresarial minimalista para Moon Studios con sistema de gestión de usuarios, integración con Discord Bot, calendario de tareas y anuncios.

## Características

- **Sistema de Login** con autenticación Firebase
- **3 Niveles de Roles**: CEO, Administración, Empleado
- **Panel de Discord Bot**: Gestión de servidores, comandos y estadísticas
- **Calendario de Tareas**: Crear, editar y eliminar tareas (CEO y Administración)
- **Sistema de Anuncios**: Publicar anuncios importantes
- **Hora en Tiempo Real**: Fecha y hora actual en el header
- **Diseño Minimalista**: Colores negro, gris y blanco con fuentes delgadas

## Configuración de Firebase

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com/)
2. Habilita **Authentication** (Email/Password)
3. Crea una base de datos **Firestore**
4. Copia las credenciales de configuración
5. Reemplaza las credenciales en `src/lib/firebase.ts`:

```typescript
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_AUTH_DOMAIN",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_STORAGE_BUCKET",
  messagingSenderId: "TU_MESSAGING_SENDER_ID",
  appId: "TU_APP_ID"
};
```

## Crear Usuario CEO Inicial

Para crear el primer usuario CEO, ejecuta en la consola del navegador después de configurar Firebase:

```javascript
import { registerUser, createUserProfile } from './src/lib/firebase';

const createCEO = async () => {
  const user = await registerUser('ceo@moonstudios.com', 'password123');
  await createUserProfile(user.user.uid, {
    email: 'ceo@moonstudios.com',
    displayName: 'CEO Moon Studios',
    role: 'CEO'
  });
};

createCEO();
```

## Estructura de la Base de Datos

### Colección: `users`
```javascript
{
  email: string,
  displayName: string,
  role: 'CEO' | 'Administración' | 'Empleado',
  createdAt: Timestamp
}
```

### Colección: `discord/botData`
```javascript
{
  servers: [{
    id: string,
    name: string,
    icon: string,
    memberCount: number,
    region: string
  }],
  totalUsers: number,
  totalCommands: number,
  commandsList: [{
    name: string,
    description: string,
    usage: string,
    category: string
  }],
  status: 'online' | 'offline' | 'maintenance',
  uptime: string
}
```

### Colección: `tasks`
```javascript
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

### Colección: `announcements`
```javascript
{
  title: string,
  content: string,
  createdBy: string,
  important: boolean,
  createdAt: Timestamp
}
```

## Permisos por Rol

| Función | CEO | Administración | Empleado |
|---------|-----|----------------|----------|
| Ver Dashboard | ✅ | ✅ | ✅ |
| Ver Calendario | ✅ | ✅ | ✅ |
| Crear/Editar Tareas | ✅ | ✅ | ❌ |
| Eliminar Tareas | ✅ | ✅ | ❌ |
| Ver Discord Bot | ✅ | ✅ | ✅ |
| Editar Discord Bot | ✅ | ❌ | ❌ |
| Crear Anuncios | ✅ | ✅ | ❌ |
| Eliminar Anuncios | ✅ | ✅ | ❌ |
| Gestión de Usuarios | ✅ | ❌ | ❌ |
| Configuración | ✅ | ❌ | ❌ |

## Desarrollo

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Build para producción
npm run build
```

## Tecnologías

- React + TypeScript + Vite
- Tailwind CSS
- shadcn/ui
- Firebase (Auth + Firestore)
- date-fns
- Lucide React

## URL del Dashboard

https://yotixpinqcf3i.ok.kimi.link
