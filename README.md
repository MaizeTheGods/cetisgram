# Cetisgram - Plataforma de Foro Social

Cetisgram es una aplicación web tipo foro donde los usuarios pueden publicar contenido, comentar, dar likes y ver estadísticas de cada publicación. La plataforma permite el registro de usuarios, inicio de sesión o participación como usuario anónimo.

## Características

- **Sistema de usuarios**: Registro, inicio de sesión y modo anónimo
- **Publicaciones**: Crear, visualizar, dar like y contar vistas
- **Comentarios**: Añadir, editar y eliminar comentarios en posts
- **Base de datos en tiempo real** con Firebase
- **Diseño responsive** utilizando Bootstrap 5
- **Subida de imágenes** para los posts
- **Estadísticas**: Contador de vistas, likes y comentarios

## Requisitos previos

- [Node.js](https://nodejs.org/) (v14 o superior)
- Cuenta en [Firebase](https://firebase.google.com/)

## Configuración de Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Crea un nuevo proyecto (o usa uno existente)
3. Activa la autenticación (Email/Password)
4. Configura Firestore Database
5. Configura Storage para subir imágenes
6. Obtén tus credenciales de Firebase:
   - Haz clic en "Configuración del proyecto"
   - En "Tus aplicaciones", selecciona Web
   - Registra una nueva aplicación y copia las credenciales

## Instalación

1. Clona este repositorio o descárgalo
2. Instala las dependencias:
   ```
   npm install
   ```
3. Crea un archivo `.env` en la raíz del proyecto con las siguientes variables (reemplaza con tus credenciales de Firebase):
   ```
   # Configuración de Firebase
   FIREBASE_API_KEY=your-api-key
   FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
   FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
   FIREBASE_APP_ID=your-app-id

   # Configuración del servidor
   PORT=3000
   SESSION_SECRET=tu-secreto-super-seguro
   ```

## Ejecución

Para ejecutar la aplicación en modo desarrollo:
```
npm run dev
```

Para ejecutar la aplicación en producción:
```
npm start
```

La aplicación estará disponible en: `http://localhost:3000`

## Estructura del proyecto

```
cetisgram/
├── config/             # Configuraciones (Firebase)
├── models/             # Para posibles modelos adicionales
├── public/             # Archivos estáticos
│   ├── css/            # Hojas de estilo
│   ├── js/             # Scripts del cliente
│   └── img/            # Imágenes
├── routes/             # Rutas de la aplicación
├── views/              # Plantillas EJS
│   ├── auth/           # Vistas de autenticación
│   ├── partials/       # Componentes reutilizables
│   └── posts/          # Vistas de posts
├── index.js            # Punto de entrada
├── package.json        # Dependencias y scripts
└── .env                # Variables de entorno (no incluir en Git)
```

## Reglas de seguridad recomendadas para Firestore

Para configurar adecuadamente las reglas de seguridad en Firebase Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Usuarios autenticados pueden leer todos los documentos
    match /{document=**} {
      allow read;
    }
    
    // Solo el autor puede editar sus propios posts
    match /posts/{postId} {
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.authorId;
    }
    
    // Comentarios pueden ser creados por cualquiera, pero solo editados por su autor
    match /comments/{commentId} {
      allow create;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.authorId;
    }
    
    // Likes pueden ser creados o eliminados por usuarios autenticados
    match /likes/{likeId} {
      allow create, delete: if request.auth != null;
      allow read;
    }
    
    // Información de usuarios solo puede ser modificada por ellos mismos
    match /users/{userId} {
      allow read;
      allow create, update, delete: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Contribuir

1. Haz un fork del repositorio
2. Crea una nueva rama (`git checkout -b feature/nueva-caracteristica`)
3. Haz commit de tus cambios (`git commit -m 'Añadir nueva característica'`)
4. Haz push a la rama (`git push origin feature/nueva-caracteristica`)
5. Abre un Pull Request

## Licencia

Este proyecto está bajo la Licencia ISC. Consulta el archivo `LICENSE` para más detalles.
