# Configuración de Cloudinary para Cetisgram

Este documento explica cómo configurar Cloudinary como servicio de almacenamiento de imágenes para tu proyecto Cetisgram.

## Paso 1: Crear una cuenta en Cloudinary

1. Ve a [Cloudinary.com](https://cloudinary.com/users/register/free)
2. Regístrate para obtener una cuenta gratuita (no requiere tarjeta de crédito)
3. Completa el formulario de registro

## Paso 2: Obtener credenciales

Una vez que hayas iniciado sesión en tu cuenta de Cloudinary:

1. Ve al Dashboard principal
2. Encontrarás tres valores importantes:
   - **Cloud name** (ej. dxxxxxxxx)
   - **API Key** (una larga cadena alfanumérica)
   - **API Secret** (otra cadena alfanumérica)

## Paso 3: Actualizar el archivo .env

Abre el archivo `.env` en la raíz de tu proyecto y actualiza las siguientes variables:

```
CLOUDINARY_CLOUD_NAME=tu-cloud-name
CLOUDINARY_API_KEY=tu-api-key
CLOUDINARY_API_SECRET=tu-api-secret
```

Reemplaza los valores con los que obtuviste de Cloudinary.

## Paso 4: Probar la aplicación

1. Inicia la aplicación con `npm start`
2. Registra un usuario e inicia sesión
3. Crea un nuevo post con una imagen
4. La imagen debería subirse correctamente a Cloudinary

## Ventajas de Cloudinary

- **Plan gratuito generoso**: 25GB de almacenamiento y 25GB de ancho de banda mensual
- **Siempre disponible**: No hay hibernación, disponibilidad 24/7
- **Optimización automática**: Cloudinary optimiza las imágenes para mejor rendimiento
- **CDN global**: Las imágenes se sirven rápidamente desde servidores cercanos a los usuarios
- **Transformaciones**: Puedes redimensionar y ajustar imágenes automáticamente

## Límites del plan gratuito

- 25GB de almacenamiento total
- 25GB de ancho de banda mensual
- 25 créditos de transformación mensual
- 500 transformaciones al mes

Estos límites son más que suficientes para un proyecto como Cetisgram en fase inicial.
