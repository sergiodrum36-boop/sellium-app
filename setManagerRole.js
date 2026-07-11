/*
 * setManagerRole.js
 * Script de un solo uso (estilo seedDatabase.js) para conceder el rol
 * "manager" (roles/permisos, ver firestore.rules y firebaseApi.js) a un
 * usuario a partir de su email. Deliberadamente NO se puede hacer esto
 * desde la propia app (ni un manager puede ascender a nadie desde el
 * navegador) — la única vía es este script, ejecutado a mano con las
 * credenciales de administrador (admin-key.json), igual que seedDatabase.js
 * y seedDistribuidores.js.
 *
 * Uso:
 *   node setManagerRole.js correo@ejemplo.com
 *
 * Qué hace:
 *   1. Busca en Firebase Authentication el usuario con ese email (tiene que
 *      haber iniciado sesión/registrado al menos una vez).
 *   2. Crea o actualiza su documento usuarios/{uid} con rol: 'manager'
 *      (si el documento no existía —p.ej. una cuenta creada antes de este
 *      cambio, que nunca pasó por el LoginScreen nuevo— lo crea entero).
 *
 * Para QUITAR el rol de manager a alguien (volverlo a 'usuario' normal),
 * ejecuta: node setManagerRole.js correo@ejemplo.com --quitar
 */

const admin = require('firebase-admin');
const serviceAccount = require('./admin-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function setManagerRole() {
  const email = process.argv[2];
  const quitar = process.argv.includes('--quitar');

  if (!email) {
    console.error('Uso: node setManagerRole.js correo@ejemplo.com [--quitar]');
    process.exit(1);
  }

  const nuevoRol = quitar ? 'usuario' : 'manager';

  try {
    console.log(`Buscando en Firebase Authentication al usuario con email ${email}...`);
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;
    console.log(`Encontrado. uid: ${uid}`);

    await db.collection('usuarios').doc(uid).set({
      email,
      rol: nuevoRol,
      fecha_alta: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log('----------------------------------------------------');
    console.log(`¡ÉXITO! ${email} (uid: ${uid}) ahora tiene rol '${nuevoRol}'.`);
    console.log('Si esa persona tiene la sesión abierta en la app, tiene que');
    console.log('cerrar sesión y volver a entrar para que el cambio se note.');
    console.log('----------------------------------------------------');
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`No existe ningún usuario con el email ${email} en Firebase Authentication.`);
      console.error('Esa persona tiene que haberse registrado al menos una vez en la app antes de poder ascenderla.');
    } else {
      console.error('Error al asignar el rol:', error);
    }
    process.exit(1);
  }
}

setManagerRole();
