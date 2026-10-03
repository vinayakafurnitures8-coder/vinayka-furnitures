import {firebaseConfig} from './firebase-config.js';
import{initializeApp}from'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';import{getAuth}from'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';import{getDatabase}from'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
const ready=Object.values(firebaseConfig).every(Boolean);export const app=ready?initializeApp(firebaseConfig):null;export const auth=app?getAuth(app):null;export const db=app?getDatabase(app):null;export const firebaseReady=Boolean(app);
