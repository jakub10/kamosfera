import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import mascotLost from "@/assets/mascot-lost.webp";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="text-center flex flex-col items-center gap-4 max-w-md">
        <img src={mascotLost} alt="" className="w-56 h-56 sm:w-72 sm:h-72 object-contain" />
        <h1 className="text-5xl font-bold text-primary">404</h1>
        <p className="text-xl text-muted-foreground">Hmm, tahle stránka tu není…</p>
        <a
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition"
        >
          Zpátky domů
        </a>
      </div>
    </div>
  );
};

export default NotFound;
