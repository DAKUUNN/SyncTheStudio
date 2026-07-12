import React from "react";
import ReactDOM from "react-dom/client";
import { I18nProvider } from "@/i18n";
import { PublicMasterShareScreen } from "@/screens/public/PublicMasterShareScreen";
import "./styles/global.css";
import "./styles/public-links.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <PublicMasterShareScreen />
    </I18nProvider>
  </React.StrictMode>
);
