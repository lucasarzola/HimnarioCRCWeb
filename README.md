# Himnario Cristo El Rey

App web mobile para guardar y leer himnos de Cristo El Rey sin conexion.

## Cómo usarla

1. Abrí `index.html` desde un servidor web local o subilo a un hosting.
2. Entrá una vez con conexión para que el navegador guarde la app.
3. Tocá `Importar` y pegá el listado en JSON o CSV.
4. Volvé a abrirla sin conexión: las letras quedan guardadas en IndexedDB.

## Funciones incluidas

- Pantalla principal con listado de himnos.
- Busqueda por numero, titulo o parte de la letra.
- Favoritos.
- Presion larga sobre un himno para seleccionar tonalidad.
- Menu lateral: Inicio, Himnos Favoritos y Sobre Nosotros.
- Configuracion de tamano de fuente, tema claro/oscuro y alineacion del texto.
- Sincronizacion con Firestore para correcciones centrales.
- Intento de pantalla completa al primer toque dentro de la app.

## Correcciones centrales con Firebase Firestore

1. En Firebase Console, activa Firestore Database.
2. Crea una coleccion llamada `songs`.
3. Para corregir una cancion, crea o edita un documento con estos campos:

```json
{
  "number": "1",
  "title": "Contadme esa historia",
  "lyrics": "Letra corregida completa..."
}
```

La app lee esa coleccion cuando vuelve a tener internet, actualiza IndexedDB y conserva la letra corregida para uso offline.

Reglas recomendadas: el archivo `firestore.rules` permite lectura publica de canciones y bloquea escritura desde la app. Vos podes editar desde Firebase Console como administrador.

## Formato JSON recomendado

```json
[
  {
    "number": "001",
    "title": "Título de la canción",
    "lyrics": "Letra completa de la canción"
  }
]
```

También acepta claves en español: `numero`, `titulo` y `letra`.

## Formato CSV recomendado

```csv
number,title,lyrics
001,Título de la canción,"Letra completa
con saltos de línea"
```

Para que el modo offline funcione en celulares, conviene servir la carpeta por HTTPS o desde `localhost` durante pruebas.

## Consolidar correcciones de Firebase

Cuando edites una letra en Firebase, dejala como documento dentro de la coleccion `songs`. Para pasar esas correcciones al archivo base del cancionero y limpiar Firebase, ejecuta desde esta carpeta:

```bash
npm run consolidar-correcciones
npm run deploy
```

El primer comando lee las correcciones, actualiza `songs-data.js` y `songs-index.js`, sube la version interna de la app y borra de Firebase los documentos ya incorporados. Si queres probar sin borrar Firebase, usa:

```bash
npm run consolidar-correcciones -- --keep-remote
```
