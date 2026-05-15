import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { AuthProvider } from "./contexts/AuthContext";
import { SpawnProvider } from "./contexts/SpawnContext";
import { SpawnAlertModal } from "./modules/SpawnTracker/SpawnAlertModal";
import { MapView } from "./modules/SpawnTracker/MapView";
import { CHTable } from "./modules/SpawnTracker/CHTable";
import { GheataTable } from "./modules/SpawnTracker/GheataTable";
import { CHPopoutView } from "./modules/SpawnTracker/CHPopoutView";
import AlertWindowView from "./modules/SpawnTracker/AlertWindowView";
import RepeatTimerPopout from "./modules/Alarms/RepeatTimerPopout";

const urlParams = new URLSearchParams(window.location.search);
const view = urlParams.get('view');
const timerId = urlParams.get('timerId') ?? '';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <SpawnProvider>
        <SpawnAlertModal />
        {view === 'map' ? (
          <div className="bg-[#050506] h-screen w-screen overflow-hidden"><MapView /></div>
        ) : view === 'chtable' ? (
          <div className="p-4 bg-[#050506] h-screen overflow-auto"><CHTable /></div>
        ) : view === 'gheatatable' ? (
          <div className="p-1.5 bg-[#050506] h-screen flex flex-col"><GheataTable /></div>
        ) : view === 'timpspawn' ? (
          <CHPopoutView />
        ) : view === 'repeat-timer' ? (
          <div className="bg-[#050506] h-screen w-screen overflow-hidden">
            <RepeatTimerPopout timerId={timerId} />
          </div>
        ) : (
          <App />
        )}
      </SpawnProvider>
    </AuthProvider>
  </React.StrictMode>,
);
