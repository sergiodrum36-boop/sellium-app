/*
 * seedDatabase.js
 * Script de un solo uso para cargar las marcas globales.
 * Se ejecuta con: node seedDatabase.js
 */

// Importamos el SDK de Administrador de Firebase y 'fs' (File System)
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN ---
// Apunta a la llave que descargó
const serviceAccount = require('./admin-key.json');
// Apunta al archivo CSV que copió
const CSV_FILE_PATH = path.join(__dirname, 'Dim_Marcas.csv');
// Nombre de la colección en Firebase
const COLLECTION_NAME = 'marcas';

// --- INICIALIZACIÓN DE ADMIN ---
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// --- FUNCIÓN DE LIMPIEZA (La misma que usamos antes) ---
function limpiarMoneda(valorStr) {
  if (!valorStr || valorStr.includes('-')) {
    return 0; // Valor nulo o " - €"
  }
  const valorLimpio = valorStr
    .replace('€', '')   // Quita €
    .replace('.', '')   // Quita separador de miles (si lo hay)
    .replace(',', '.')   // Reemplaza coma decimal
    .trim();
  return parseFloat(valorLimpio) || 0;
}

// --- FUNCIÓN PRINCIPAL ---
async function seedDatabase() {
  console.log(`Leyendo archivo: ${CSV_FILE_PATH}`);
  
  // Leer el archivo CSV
  const csvData = fs.readFileSync(CSV_FILE_PATH, 'utf8');
  const lineas = csvData.split('\n');
  lineas.shift(); // Quitar la cabecera (Dim_Marcas;Precio;A&P)

  if (lineas.length === 0) {
    console.error("Error: El archivo CSV está vacío o solo tiene cabecera.");
    return;
  }
  
  console.log(`Se encontraron ${lineas.length} marcas. Procesando...`);
  
  // Usamos un "Batch" para subir todos los datos en una sola operación
  const batch = db.batch();
  
  let contador = 0;
  lineas.forEach((linea) => {
    if (linea.trim() === '') return; // Ignorar líneas vacías
    
    const columnas = linea.split(';');
    const nombre = (columnas[0] || '').trim();
    const precioStr = (columnas[1] || '0').trim();
    const apStr = (columnas[2] || '0').trim();

    if (!nombre) return; // Ignorar si no hay nombre

    // Crear el objeto de datos
    const marcaData = {
      nombre_marca: nombre,
      Coste_Unidad: limpiarMoneda(precioStr),
      AP_Generado_Por_Unidad: limpiarMoneda(apStr)
    };
    
    // Añadir al batch
    const marcaRef = db.collection(COLLECTION_NAME).doc(); // Crea una referencia nueva
    batch.set(marcaRef, marcaData);
    contador++;
  });

  console.log(`Subiendo ${contador} marcas a la colección "${COLLECTION_NAME}"...`);
  
  // Ejecutar el batch
  try {
    await batch.commit();
    console.log('----------------------------------------------------');
    console.log('¡ÉXITO! La base de datos de "marcas" ha sido cargada.');
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error("Error al subir los datos a Firebase:", error);
  }
}

// Ejecutar la función
seedDatabase();