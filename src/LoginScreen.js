/*
 * LoginScreen.js (Versión 5.1 - Con Logo)
 * Componente React para la autenticación de usuarios.
 */

import React, { useState } from 'react';
import { auth } from './firebaseConfig'; 
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "firebase/auth";
// ¡Importamos el logo!
import logo from './assets/logo.png'; 

function LoginScreen({ onLoginSuccess }) {

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null); 
  const [mensaje, setMensaje] = useState(null);

  const handleLogin = async () => {
    setError(null); setMensaje(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("Usuario autenticado:", userCredential.user.uid);
      onLoginSuccess(userCredential.user.uid); 
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Email o contraseña incorrectos.");
      } else { setError("Error al iniciar sesión: " + err.message); }
    }
  };
  
  const handleRegister = async () => {
    setError(null); setMensaje(null);
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log("Nuevo usuario registrado:", userCredential.user.uid);
      onLoginSuccess(userCredential.user.uid);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setError("Este email ya está registrado.");
      } else { setError("Error al registrarse: " + err.message); }
    }
  };
  
  const handlePasswordReset = async () => {
    setError(null); setMensaje(null);
    if (!email) { setError("Por favor, introduzca su email para resetear la contraseña."); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      setMensaje("¡Email enviado! Revise su bandeja de entrada para resetear la contraseña.");
    } catch (err) { setError("Error al enviar el email: " + err.message); }
  };

  // --- RENDERIZADO MODIFICADO (Con Logo) ---
  return (
    <div style={{ padding: '50px', maxWidth: '400px', margin: '100px auto', border: '1px solid #e0e0e0', borderRadius: '8px', backgroundColor: '#ffffff', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
      
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <img src={logo} alt="Logo" style={{ height: '50px', maxWidth: '170px' }} />
      </div>
      
      <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', textAlign: 'center' }}>Inicio de Sesión</h3>
      
      <div style={{ marginBottom: '15px' }}>
        <label>Email: </label>
        <input 
          type="email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '95%', padding: '8px' }}
          placeholder="su@email.com"
        />
      </div>
      
      <div style={{ marginBottom: '15px' }}>
        <label>Contraseña: </label>
        <input 
          type="password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '95%', padding: '8px' }}
          placeholder="Mínimo 6 caracteres"
        />
      </div>

      {error && <div style={{ color: 'red', marginBottom: '15px' }}>{error}</div>}
      {mensaje && <div style={{ color: 'green', marginBottom: '15px' }}>{mensaje}</div>}

      <button onClick={handleLogin} style={{ padding: '10px', width: '100%', backgroundColor: '#007bff', color: 'white', border: 'none', fontSize: '16px' }}>
        INICIAR SESIÓN
      </button>

      <button onClick={handleRegister} style={{ marginTop: '10px', width: '100%', backgroundColor: '#6c757d', color: 'white', border: 'none', padding: '10px' }}>
        Registrar nuevo usuario
      </button>

      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <button onClick={handlePasswordReset} style={{ background: 'none', border: 'none', color: '#007bff', textDecoration: 'underline', cursor: 'pointer' }}>
          ¿Olvidó su contraseña?
        </button>
      </div>
    </div>
  );
}

export default LoginScreen;