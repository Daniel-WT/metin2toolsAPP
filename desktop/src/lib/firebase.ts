import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBRemmnHO90OtrQsexkguEYgl3AQ7aMH_Y",
  authDomain: "metin2-tools-testing.firebaseapp.com",
  databaseURL: "https://metin2-tools-testing-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "metin2-tools-testing",
  appId: "1:751154954780:web:ac491ff86c6e6461d4d5d9"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

export { app, db, auth };
