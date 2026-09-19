import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { supabaseConfigMissing } from "./integrations/supabase/client";
import "./index.css";
import "./i18n";

const root = createRoot(document.getElementById("root")!);

if (supabaseConfigMissing) {
  // Bez adresy a klíče k Supabase nemá smysl aplikaci spouštět — každý
  // požadavek by selhal. Dřív z toho byla bílá obrazovka a chyba schovaná
  // v konzoli. Tohle je stránka, ze které jde poznat, co nastavit.
  root.render(
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        font: '16px/1.6 ui-sans-serif, system-ui, "Segoe UI", sans-serif',
        background: "#f6f7f9",
        color: "#171b22",
      }}
    >
      <div style={{ maxWidth: "34rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: "0 0 .5rem" }}>
          Kamosféře chybí nastavení
        </h1>
        <p style={{ margin: "0 0 1rem", color: "#4a5260" }}>
          Aplikace neví, kde je její databáze, takže se nespustí. Nic se
          nerozbilo — jen je potřeba doplnit dvě hodnoty ze Supabase
          (Project Settings → API).
        </p>
        <pre
          style={{
            background: "#fff",
            border: "1px solid #dce0e7",
            borderRadius: "6px",
            padding: "12px 14px",
            overflowX: "auto",
            font: '13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          VITE_SUPABASE_URL{"\n"}VITE_SUPABASE_PUBLISHABLE_KEY
        </pre>
        <p style={{ margin: "1rem 0 0", color: "#4a5260" }}>
          Na Vercelu patří do <strong>Settings → Environment Variables</strong>{" "}
          (a po přidání je potřeba znovu nasadit). Lokálně do souboru{" "}
          <code>.env</code> — vzor je v <code>.env.example</code>.
        </p>
        <p style={{ margin: ".75rem 0 0", color: "#7c8493", fontSize: "14px" }}>
          Patří sem jen veřejný (anon) klíč. Service-role klíč nikdy — zapekl by
          se do stránky a přečetl by si ho kdokoliv.
        </p>
      </div>
    </div>
  );
} else {
  root.render(<App />);
}
