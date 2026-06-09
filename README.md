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

Cuando edites una letra en Firebase, dejala como documento dentro de la coleccion `Songs`. Para pasar esas correcciones al archivo base del cancionero, ejecuta desde esta carpeta:

```bash
npm run consolidar-correcciones
```

El comando lee las correcciones, actualiza `songs-data.js` y `songs-index.js`, y sube la version interna de la app. No borra Firebase por defecto. Si queres borrar los documentos ya incorporados, usa:

```bash
npm run consolidar-correcciones -- --delete-remote
```

Campos aceptados para cada himno:

- `number`: numero del himno.
- `title`: titulo.
- `lyrics`: letra normal.
- `originalTone`: tonalidad original, por ejemplo `Do`, `Re#`, `Mi`.
- `chordedLyrics`: letra con acordes para el modo musico. El formato es poner el acorde entre corchetes antes de la palabra, por ejemplo: `[Do]Contadme la [Sol]antigua historia`.

## Despliegue staging y produccion

Primero subilo a staging para probar en una URL temporal de Firebase:

```bash
npm run deploy:staging
```

Firebase muestra una URL de preview. Probala en celular. Si esta todo bien, publicalo en produccion:

```bash
npm run deploy:prod
```
