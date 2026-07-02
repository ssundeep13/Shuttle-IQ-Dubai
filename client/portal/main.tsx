import { createRoot } from "react-dom/client";
import { PortalApp } from "./App";
import "./portal.css";

const el = document.getElementById("portal-root");
if (!el) throw new Error("portal-root element not found");
createRoot(el).render(<PortalApp />);
