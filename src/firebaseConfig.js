/*
 * firebaseConfig.js
 * (Versión FINAL, Completa y Corregida con sus claves)
 */

// 1. Importamos las funciones de Firebase
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// 2. Sus claves de configuración (¡YA ESTÁN INCLUIDAS!)
const firebaseConfig = {
  apiKey: "AIzaSyAK4McRXeoppyOyRA-vz5QMdT17p_zyz5s",
  authDomain: "app-gestion-comercial-unesdi.firebaseapp.com",
  projectId: "app-gestion-comercial-unesdi",
  storageBucket: "app-gestion-comercial-unesdi.firebasestorage.app",
  messagingSenderId: "222611130363",
  appId: "1:222611130363:web:eb45a3f3e9dba4900bad5e",
  measurementId: "G-E24FSY9N9T"
};

// 3. Inicializamos los servicios (UNA SOLA VEZ)
const app = initializeApp(firebaseConfig);

// 4. Exportamos los servicios para que la app los use
export const auth = getAuth(app);
export const db = getFirestore(app);

// 5. Mensaje de confirmación
console.log("Firebase Configurado y Conectado.");