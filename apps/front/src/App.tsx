import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { actions } from "./api/queries";
import { DevPanel } from "./components/DevPanel";
import { FriendsDrawer } from "./components/FriendsDrawer";
import { Header } from "./components/Header";
import { LoginDialog } from "./components/LoginDialog";
import { Footer, NeedGroupDialog, Toasts } from "./components/Shell";
import { partieUrl } from "./lib/play";
import { Accueil } from "./pages/Accueil";
import { Boutique } from "./pages/Boutique";
import { Classement } from "./pages/Classement";
import { Jeux } from "./pages/Jeux";
import { Confidentialite, Conditions } from "./pages/Legal";
import { Bienvenue, Connexion, Pseudo } from "./pages/Onboarding";
import { Parametres } from "./pages/Parametres";
import { Partie } from "./pages/Partie";
import { Profil } from "./pages/Profil";
import { Recap } from "./pages/Recap";
import { Live, Obs, Stream } from "./pages/Stream";
import { useApplyTheme, useMe } from "./state/app";
import { connectLive, useLive } from "./state/live";
import { useUi } from "./state/ui";

// Coquille du site : en-tête (masqué pendant la première connexion), pages, tiroir d'amis, fenêtres.

const NO_HEADER = ["/connexion", "/pseudo", "/bienvenue"];
const PUBLIC = ["/connexion", "/confidentialite", "/conditions", "/classement"];

export function App() {
  useApplyTheme();
  const me = useMe();
  const loc = useLocation();
  const nav = useNavigate();
  const ui = useUi();
  const session = useLive((s) => s.session);
  const path = loc.pathname;
  const obs = path.startsWith("/obs/");

  useEffect(() => useUi.setState({ go: (p: string) => nav(p) }), [nav]);

  // Connexion temps réel dès qu'il y a une session (compte ou invité), puis reprise de la partie en cours
  useEffect(() => {
    if (me.session && !me.isAnon) {
      connectLive();
      actions
        .liveSession()
        .then((r) => r.session && useLive.getState().setSession(r.session))
        .catch(() => {});
    }
  }, [me.session?.userId]);

  // Un coéquipier lance une partie de groupe : tout le groupe y est emmené
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!session || session.kind !== "group" || seen.current === session.id) return;
    seen.current = session.id;
    if (session.phase === "playing" && path !== "/partie" && path !== "/recap") {
      nav(partieUrl(session.context === "defi" ? "defi" : "classique", session.games[session.index], session.id));
      ui.setFriends(false);
    }
  }, [session?.id]);

  if (obs)
    return (
      <Routes>
        <Route path="/obs/:code" element={<Obs />} />
      </Routes>
    );

  if (me.loading) return <div className="min-h-screen" aria-busy="true" />;

  // Première visite : la page de connexion ; un compte sans pseudo ou sans premier chibi finit son inscription
  const live = path.startsWith("/live/");
  if (me.isAnon && !PUBLIC.includes(path) && !live) return <Navigate to="/connexion" replace />;
  if (me.isUser && me.profile && !me.profile.pseudo && path !== "/pseudo") return <Navigate to="/pseudo" replace />;
  if (me.isUser && me.profile?.pseudo && !me.profile.onboarded && path !== "/bienvenue") return <Navigate to="/bienvenue" replace />;

  const header = !NO_HEADER.includes(path);
  const footer = header && path !== "/partie" && path !== "/recap";

  return (
    <div className="relative min-h-screen box-border flex flex-col text-ink font-b bg-bg" style={{ overflow: "clip" }}>
      {header && <Header />}
      <Routes>
        <Route path="/" element={<Accueil />} />
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/pseudo" element={<Pseudo />} />
        <Route path="/bienvenue" element={<Bienvenue />} />
        <Route path="/jeux" element={<Jeux />} />
        <Route path="/partie" element={<Partie />} />
        <Route path="/recap" element={<Recap />} />
        <Route path="/classement" element={<Classement />} />
        <Route path="/boutique" element={<Boutique />} />
        <Route path="/profil" element={<Profil />} />
        <Route path="/parametres" element={<Parametres />} />
        <Route path="/stream" element={<Stream />} />
        <Route path="/live/:code" element={<Live />} />
        <Route path="/confidentialite" element={<Confidentialite />} />
        <Route path="/conditions" element={<Conditions />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {footer && <Footer />}
      {ui.friendsOpen && me.isUser && <FriendsDrawer />}
      {ui.login && path !== "/connexion" && <LoginDialog />}
      <NeedGroupDialog />
      <DevPanel />
      <Toasts />
    </div>
  );
}
