import { db } from './firebase';
import { doc, setDoc, Timestamp, collection, addDoc } from 'firebase/firestore';

// Función para crear datos iniciales en Firestore
export const seedInitialData = async () => {
  try {
    // Crear datos del bot de Discord
    await setDoc(doc(db, 'discord', 'botData'), {
      servers: [
        {
          id: '1',
          name: 'Moon Studios Official',
          icon: '',
          memberCount: 1250,
          region: 'us-west'
        },
        {
          id: '2',
          name: 'Development Team',
          icon: '',
          memberCount: 45,
          region: 'us-east'
        },
        {
          id: '3',
          name: 'Community Support',
          icon: '',
          memberCount: 3200,
          region: 'eu-west'
        }
      ],
      totalUsers: 4495,
      totalCommands: 12,
      commandsList: [
        {
          name: 'help',
          description: 'Muestra la lista de comandos disponibles',
          usage: '!help [comando]',
          category: 'General'
        },
        {
          name: 'stats',
          description: 'Muestra estadísticas del servidor',
          usage: '!stats',
          category: 'Información'
        },
        {
          name: 'ban',
          description: 'Banea a un usuario del servidor',
          usage: '!ban @usuario [razón]',
          category: 'Moderación'
        },
        {
          name: 'kick',
          description: 'Expulsa a un usuario del servidor',
          usage: '!kick @usuario [razón]',
          category: 'Moderación'
        },
        {
          name: 'mute',
          description: 'Silencia a un usuario',
          usage: '!mute @usuario [tiempo]',
          category: 'Moderación'
        },
        {
          name: 'clear',
          description: 'Elimina mensajes del canal',
          usage: '!clear [cantidad]',
          category: 'Moderación'
        },
        {
          name: 'announce',
          description: 'Crea un anuncio en el servidor',
          usage: '!announce [mensaje]',
          category: 'Administración'
        },
        {
          name: 'welcome',
          description: 'Configura el mensaje de bienvenida',
          usage: '!welcome [mensaje]',
          category: 'Administración'
        },
        {
          name: 'poll',
          description: 'Crea una encuesta',
          usage: '!poll [pregunta] | [opción1] | [opción2]',
          category: 'General'
        },
        {
          name: 'serverinfo',
          description: 'Muestra información del servidor',
          usage: '!serverinfo',
          category: 'Información'
        },
        {
          name: 'userinfo',
          description: 'Muestra información de un usuario',
          usage: '!userinfo @usuario',
          category: 'Información'
        },
        {
          name: 'ping',
          description: 'Verifica la latencia del bot',
          usage: '!ping',
          category: 'General'
        }
      ],
      status: 'online',
      uptime: '15d 7h 23m',
      updatedAt: Timestamp.now()
    });

    // Crear anuncios de ejemplo
    const announcementsRef = collection(db, 'announcements');
    await addDoc(announcementsRef, {
      title: 'Bienvenidos al Dashboard de Moon Studios',
      content: 'Este es el nuevo sistema de gestión empresarial. Aquí podrás administrar tareas, ver estadísticas del bot de Discord y mantenerte informado sobre los anuncios importantes.',
      createdBy: 'Sistema',
      important: true,
      createdAt: Timestamp.now()
    });

    await addDoc(announcementsRef, {
      title: 'Nueva integración con Discord',
      content: 'Hemos integrado el bot de Discord al dashboard. Ahora puedes ver estadísticas en tiempo real, gestionar servidores y comandos desde un solo lugar.',
      createdBy: 'Administración',
      important: false,
      createdAt: Timestamp.now()
    });

    // Crear tareas de ejemplo
    const tasksRef = collection(db, 'tasks');
    const today = new Date();
    
    await addDoc(tasksRef, {
      title: 'Revisar estadísticas del bot',
      description: 'Analizar el rendimiento del bot de Discord y generar reporte semanal',
      date: Timestamp.fromDate(today),
      priority: 'high',
      status: 'pending',
      assignedTo: 'Equipo de Desarrollo',
      createdBy: 'CEO'
    });

    await addDoc(tasksRef, {
      title: 'Actualizar documentación',
      description: 'Actualizar la documentación de comandos del bot',
      date: Timestamp.fromDate(new Date(today.getTime() + 86400000)),
      priority: 'medium',
      status: 'in-progress',
      assignedTo: 'Equipo de Soporte',
      createdBy: 'Administración'
    });

    await addDoc(tasksRef, {
      title: 'Reunión de planificación',
      description: 'Reunión semanal para planificar las tareas del próximo sprint',
      date: Timestamp.fromDate(new Date(today.getTime() + 172800000)),
      priority: 'high',
      status: 'pending',
      assignedTo: 'Todo el equipo',
      createdBy: 'CEO'
    });

    console.log('Datos iniciales creados exitosamente');
    return true;
  } catch (error) {
    console.error('Error creando datos iniciales:', error);
    return false;
  }
};

// Función para crear usuario CEO inicial
export const createInitialCEO = async (email: string, _password: string, displayName: string) => {
  try {
    // Esto debe hacerse desde el frontend con registerUser
    // y luego llamar a createUserProfile
    console.log('Crear usuario CEO con:', { email, displayName });
    return true;
  } catch (error) {
    console.error('Error creando CEO:', error);
    return false;
  }
};
