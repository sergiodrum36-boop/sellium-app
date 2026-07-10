/*
 * seedDistribuidores.js
 * Script de un solo uso para cargar los distribuidores privados
 * de un usuario específico.
 * Se ejecuta con: node seedDistribuidores.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN ---

// !!! PASO IMPORTANTE !!!
// PEGUE EL "User UID" (QUE COPIÓ DE FIREBASE AUTH) AQUÍ:
const MI_ID_USUARIO = "Rl4oerLQ7uemm4ggU4Hei4gRUZP2"; 
// Ejemplo: const MI_ID_USUARIO = "q9f8zABC123...";

// --- (No toque el resto) ---
const serviceAccount = require('./admin-key.json');
const CSV_FILE_PATH = path.join(__dirname, 'Dim_Distribuidores.csv');
const COLLECTION_NAME = 'distribuidores';

if (MI_ID_USUARIO === "PEGUE_SU_ID_DE_USUARIO_AQUI") {
  console.error("----------------------------------------------------");
  console.error("ERROR: Por favor, edite el archivo seedDistribuidores.js");
  console.error("y reemplace 'Rl4oerLQ7uemm4ggU4Hei4gRUZP2'");
  console.error("con su 'User UID' de Firebase Authentication.");
  console.error("----------------------------------------------------");
  process.exit(1); // Detiene el script
}

// Inicializa Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// --- FUNCIÓN PRINCIPAL ---
async function seedDistribuidores() {
  console.log(`Leyendo archivo: ${CSV_FILE_PATH}`);
  
  const csvData = fs.readFileSync(CSV_FILE_PATH, 'utf8');
  const lineas = csvData.split('\n');
  
  // Asumimos que la primera línea es "Dim_Distribuidores" y la segunda es "Nombre_Distribuidor"
  lineas.shift(); // Quita "Dim_Distribuidores"
  lineas.shift(); // Quita "Nombre_Distribuidor"

  if (lineas.length === 0) {
    console.error("Error: El archivo CSV está vacío o solo tiene cabeceras.");
    return;
  }
  
  console.log(`Se encontraron ${lineas.length} distribuidores. Procesando...`);
  
  const batch = db.batch();
  let contador = 0;
  
  lineas.forEach((linea) => {
    const nombre = linea.trim();
    if (nombre === '') return; // Ignorar líneas vacías

    // Crear el objeto de datos, ASIGNÁNDOLO al usuario
    const distribuidorData = {
      nombre_distribuidor: nombre,
      id_usuario: MI_ID_USUARIO // Asignación clave
    };
    
    // Añadir al batch
    const distriRef = db.collection(COLLECTION_NAME).doc();
    batch.set(distriRef, distribuidorData);
    contador++;
  });

  console.log(`Subiendo ${contador} distribuidores a la colección "${COLLECTION_NAME}" para el usuario ${MI_ID_USUARIO}...`);
  
  try {
    await batch.commit();
    console.log('----------------------------------------------------');
    console.log(`¡ÉXITO! Sus ${contador} distribuidores han sido cargados.`);
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error("Error al subir los distribuidores a Firebase:", error);
  }
}

// Ejecutar la función
seedDistribuidores();