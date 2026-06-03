import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const projectId = await readProjectId();
const collectionArg = process.argv.find((arg) => arg.startsWith("--collection="));
const collections = collectionArg ? [collectionArg.split("=").slice(1).join("=")] : ["songs", "Himnos"];
const keepRemote = process.argv.includes("--keep-remote");
const deleteRemote = process.argv.includes("--delete-remote");

const { collection, docs } = await fetchFirstCollectionWithDocs(projectId, collections);

if (!docs.length) {
  console.log(`No hay correcciones pendientes en Firebase. Proyecto: ${projectId}. Colecciones revisadas: ${collections.join(", ")}.`);
  console.log("Si tu coleccion tiene otro nombre, ejecuta: npm run consolidar-correcciones -- --collection=NOMBRE_DE_LA_COLECCION");
} else {
  const corrections = docs.map(parseFirestoreDoc).filter((song) => song.number && (song.title || song.lyrics));

  if (!corrections.length) {
    console.log(`Firebase tiene documentos en ${collection}, pero ninguno tiene number/title/lyrics validos.`);
  } else {
    await applyCorrections(corrections);

    if (deleteRemote && !keepRemote) {
      deleteCorrectionDocs(projectId, docs.map((doc) => doc.name));
    }

    console.log(`Coleccion leida: ${collection}`);
    console.log(`Correcciones consolidadas: ${corrections.length}`);
    console.log(`Documentos aplicados: ${corrections.map((song) => `${song.number} - ${song.title || "Sin titulo"}`).join(", ")}`);
    if (!deleteRemote) {
      console.log("Los documentos de Firebase no se borraron. Para borrarlos al consolidar usa: npm run consolidar-correcciones -- --delete-remote");
    }
    console.log("Ahora ejecuta: npm run deploy");
  }
}

async function readProjectId() {
  const firebaserc = JSON.parse(await readFile(join(projectRoot, ".firebaserc"), "utf8"));
  return firebaserc.projects?.default || "himnoscristoelrey";
}

async function fetchFirstCollectionWithDocs(firebaseProjectId, collectionNames) {
  const errors = [];
  for (const collectionName of collectionNames) {
    try {
      const docs = await fetchCorrectionDocs(firebaseProjectId, collectionName);
      if (docs.length) return { collection: collectionName, docs };
    } catch (error) {
      errors.push(`${collectionName}: ${error.message}`);
    }
  }

  if (errors.length) {
    throw new Error(`${errors.join(" | ")}. Ejecuta primero: firebase deploy --only firestore:rules`);
  }

  return { collection: collectionNames[0], docs: [] };
}

async function fetchCorrectionDocs(firebaseProjectId, collectionName) {
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/${collectionName}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`No se pudo leer Firebase (${response.status}). Revisa las reglas de lectura de Firestore.`);
  }

  const payload = await response.json();
  return payload.documents || [];
}

function parseFirestoreDoc(doc) {
  const fields = doc.fields || {};
  const number = String(readField(fields.number) ?? readField(fields.numero) ?? readField(fields.nro) ?? doc.name.split("/").pop()).trim();
  const title = String(readField(fields.title) ?? readField(fields.titulo) ?? readField(fields.nombre) ?? "").trim();
  const lyrics = String(readField(fields.lyrics) ?? readField(fields.letra) ?? readField(fields.texto) ?? "").trim();
  const id = String(readField(fields.id) ?? "").trim();
  return { docName: doc.name, id, number, title, lyrics };
}

function readField(field) {
  if (!field) return undefined;
  if ("stringValue" in field) return field.stringValue;
  if ("integerValue" in field) return field.integerValue;
  if ("doubleValue" in field) return field.doubleValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("timestampValue" in field) return field.timestampValue;
  return undefined;
}

async function applyCorrections(correctionsToApply) {
  const songsDataPath = join(projectRoot, "songs-data.js");
  const songsIndexPath = join(projectRoot, "songs-index.js");
  const { seedSongs } = await import(`${pathToFileURL(songsDataPath).href}?t=${Date.now()}`);
  const byNumber = new Map(seedSongs.map((song, index) => [String(song.number), { song, index }]));

  for (const correction of correctionsToApply) {
    const found = byNumber.get(String(correction.number));
    const nextSong = {
      number: String(correction.number),
      title: correction.title || found?.song.title || `Himno ${correction.number}`,
      lyrics: correction.lyrics || found?.song.lyrics || "",
    };

    if (correction.id) nextSong.id = correction.id;

    if (found) {
      seedSongs[found.index] = { ...found.song, ...nextSong };
    } else {
      seedSongs.push(nextSong);
    }
  }

  seedSongs.sort((a, b) => Number(a.number) - Number(b.number));

  const index = seedSongs.map((song) => ({
    number: String(song.number),
    title: song.title,
    preview: buildPreview(song.lyrics),
  }));

  await writeFile(songsDataPath, `export const seedSongs = ${JSON.stringify(seedSongs, null, 2)};\n`, "utf8");
  await writeFile(songsIndexPath, `export const songIndex = ${JSON.stringify(index, null, 2)};\n`, "utf8");
  await bumpVersion();
}

function buildPreview(text) {
  return (
    String(text || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .find(Boolean) || ""
  );
}

async function bumpVersion() {
  const appPath = join(projectRoot, "app.js");
  const swPath = join(projectRoot, "service-worker.js");
  const htmlPath = join(projectRoot, "index.html");
  const versionPath = join(projectRoot, "app-version.json");
  const currentVersion = JSON.parse(await readFile(versionPath, "utf8")).version || "2026.06.03.0";
  const parts = currentVersion.split(".");
  const nextPatch = Number(parts.at(-1) || 0) + 1;
  const nextVersion = `2026.06.03.${nextPatch}`;
  const cacheNumber = String(nextPatch);

  await replaceInFile(appPath, [
    [/const APP_VERSION = "[^"]+";/, `const APP_VERSION = "${nextVersion}";`],
    [/const FULL_DATA_URL = "\.\/songs-data\.js\?v=[^"]+";/, `const FULL_DATA_URL = "./songs-data.js?v=${cacheNumber}";`],
  ]);
  await replaceInFile(swPath, [[/const CACHE_NAME = "cristo-rey-cancionero-v[^"]+";/, `const CACHE_NAME = "cristo-rey-cancionero-v${cacheNumber}";`]]);
  await replaceInFile(htmlPath, [
    [/\.\/styles\.css\?v=\d+/g, `./styles.css?v=${cacheNumber}`],
    [/\.\/app\.js\?v=\d+/g, `./app.js?v=${cacheNumber}`],
  ]);
  await writeFile(versionPath, `${JSON.stringify({ version: nextVersion }, null, 2)}\n`, "utf8");
}

async function replaceInFile(filePath, replacements) {
  let content = await readFile(filePath, "utf8");
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }
  await writeFile(filePath, content, "utf8");
}

function deleteCorrectionDocs(firebaseProjectId, docNames) {
  const firebaseCommand = getFirebaseCommand();

  for (const docName of docNames) {
    const docPath = docName.split("/documents/").pop();
    const result = spawnSync(firebaseCommand.command, [...firebaseCommand.args, "firestore:delete", docPath, "--project", firebaseProjectId, "--force"], {
      cwd: projectRoot,
      stdio: "inherit",
    });

    if (result.status !== 0) {
      throw new Error(`No se pudo borrar ${docPath}. La correccion ya fue aplicada localmente; borrala manualmente en Firebase o reintenta el comando.`);
    }
  }
}

function getFirebaseCommand() {
  if (process.platform !== "win32") return { command: "firebase", args: [] };

  const localScript = join(process.env.APPDATA || "", "npm", "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
  if (existsSync(localScript)) return { command: process.execPath, args: [localScript] };

  return { command: "firebase.cmd", args: [] };
}
