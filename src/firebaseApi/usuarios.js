/*
 * firebaseApi/usuarios.js
 * Perfiles de usuario (roles/permisos) — colección "usuarios".
 */

import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { db } from './comun';

// Se llama una única vez, justo tras registrarse (ver LoginScreen.js). Si el
// perfil ya existiera (no debería, un uid nuevo es siempre nuevo) esto lo
// sobrescribiría — no pasa en la práctica porque solo se llama en el alta.
export const crearPerfilUsuario = async (uid, email) => {
  console.log(`firebaseApi: Creando perfil de usuario para ${email}...`);
  await setDoc(doc(db, "usuarios", uid), {
    email,
    rol: 'usuario',
    fecha_alta: new Date().toISOString()
  });
};

// Perfil (rol, email) del usuario autenticado — se llama justo tras el
// login para saber si hay que mostrar el selector "Viendo como" (managers).
// Devuelve null si por lo que sea el perfil no existe (p.ej. cuentas creadas
// a mano en la consola de Firebase antes de este cambio, sin pasar por
// LoginScreen) — App.js lo trata como rol 'usuario' por defecto en ese caso.
export const getPerfilUsuario = async (uid) => {
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// Lista de TODOS los perfiles de usuario — solo la puede llamar con éxito un
// manager (ver la regla `allow list` en firestore.rules); si la llama un
// usuario normal, Firestore devuelve "permission-denied". Se usa para
// rellenar el selector "Viendo como" en el Sidebar.
export const getListaUsuarios = async () => {
  const snapshot = await getDocs(collection(db, "usuarios"));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
};
