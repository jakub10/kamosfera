import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SafetyGate } from "@/components/safety/SafetyGate";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const Index = lazy(() => import("./pages/Index"));
const Profile = lazy(() => import("./pages/Profile"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const Settings = lazy(() => import("./pages/Settings"));
const Saved = lazy(() => import("./pages/Saved"));
const Messages = lazy(() => import("./pages/Messages"));
const Kamarati = lazy(() => import("./pages/Kamarati"));
const Suhlas = lazy(() => import("./pages/Suhlas"));
const Dovernik = lazy(() => import("./pages/Dovernik"));
const DovernikPozvanka = lazy(() => import("./pages/Dovernik").then((m) => ({ default: m.DovernikPozvanka })));
const AdminClenovia = lazy(() => import("./pages/AdminClenovia"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Groups = lazy(() => import("./pages/Groups"));
const Games = lazy(() => import("./pages/Games"));
const Svet = lazy(() => import("./pages/Svet"));
const Pevnost = lazy(() => import("./pages/Pevnost"));
const Hliadka = lazy(() => import("./pages/Hliadka"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SafetyGate>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/:userId" element={<UserProfile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/saved" element={<Saved />} />
              <Route path="/messages" element={<Messages />} />
              {/* Hľadanie skončilo: nikoho sa nedá vyhľadať, kamaráti len naživo. */}
              <Route path="/search" element={<Navigate to="/kamarati" replace />} />
              <Route path="/kamarati" element={<Kamarati />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/groups" element={<Groups />} />
              <Route path="/games" element={<Games />} />
              <Route path="/svet" element={<Svet />} />
              <Route path="/pevnost" element={<Pevnost />} />
              <Route path="/hliadka" element={<Hliadka />} />
              <Route path="/admin/clenovia" element={<AdminClenovia />} />
              {/* Pre dospelých bez účtu — brána ich nechá tak. */}
              <Route path="/suhlas/:token" element={<Suhlas />} />
              <Route path="/dovernik/pozvanka/:invite" element={<DovernikPozvanka />} />
              <Route path="/dovernik/:token" element={<Dovernik />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </SafetyGate>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
