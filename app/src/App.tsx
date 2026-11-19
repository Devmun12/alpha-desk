import { useEffect } from "react";
import { DeskProvider, useDesk, useRoute } from "./store";
import { Desk } from "./pages/Desk";
import { Plays } from "./pages/Plays";
import { Impact } from "./pages/Impact";
import { Pipeline } from "./pages/Pipeline";
import { Read } from "./pages/Read";
import { About } from "./pages/About";
import { IconAbout, IconDesk, IconImpact, IconPipeline, IconPlays, IconRead, Mark } from "./components/icons";
import { ago, dateTime } from "./lib/format";
import { LIVE_APP_URL } from "./data/load";

const NAV = [
  { page: "desk", label: "Desk", icon: IconDesk },
  { page: "plays", label: "Plays", icon: IconPlays },
  { page: "impact", label: "Impact", icon: IconImpact },
  { page: "pipeline", label: "Pipeline", icon: IconPipeline },
  { page: "read", label: "Read", icon: IconRead },
  { page: "about", label: "About", icon: IconAbout },
];

const TITLES: Record<string, string> = { desk: "Desk", plays: "Plays", impact: "Impact", pipeline: "Pipeline", read: "Read a posting", about: "How it works" };

function Shell() {
  const { page, id } = useRoute();
  const { desk, source, toastState } = useDesk();
  const known = NAV.some((x) => x.page === page) ? page : "desk";
  useEffect(() => {
    const a = id != null ? desk.accounts.find((x) => x.id === id) : undefined;
    document.title = `${a ? `${a.name} · ` : ""}${TITLES[known]} · Alpha Desk`;
  }, [known, id, desk.accounts]);

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <a className="mark" href="#desk" aria-label="Alpha Desk home"><Mark /></a>
        {NAV.map(({ page: p, label, icon: I }) => (
          <a key={p} href={`#${p}`} aria-current={known === p ? "page" : undefined}><I />{label}</a>
        ))}
        <span className="spacer" />
      </nav>
      <div className="main">
        <header className="topbar">
          <span className="wordmark"><span className="swipe">Alpha</span> Desk</span>
          <span className="for">Hiring signals for revenue teams</span>
          <span className="grow" />
          <span className="freshness" title={`Data generated ${dateTime(desk.generatedAt)}`}>
            <span className={`dot ${source === "snapshot" ? "snapshot" : ""}`} />
            <span className="label">{source === "live" ? "Live" : "Snapshot"}:</span>
            <span>boards read {ago(desk.stats.lastIngest)}</span>
          </span>
        </header>
        {source === "snapshot" && (
          <div className="banner">
            <span>You are viewing a saved snapshot from {dateTime(desk.generatedAt)}. The live app refreshes every few minutes and can read new postings.</span>
            <a href={LIVE_APP_URL} target="_blank" rel="noreferrer" style={{ whiteSpace: "nowrap" }}><b>Open the live app</b></a>
          </div>
        )}
        <main className="page" id="main">
          {known === "desk" && <Desk selected={id} />}
          {known === "plays" && <Plays />}
          {known === "impact" && <Impact />}
          {known === "pipeline" && <Pipeline />}
          {known === "read" && <Read />}
          {known === "about" && <About />}
        </main>
      </div>
      {toastState && <div className="toast" role="status">{toastState.text}</div>}
    </div>
  );
}

export default function App() {
  return (
    <DeskProvider fallback={(state, retry) => (
      <div className="empty" style={{ height: "100vh" }}>
        <Mark size={48} />
        {state === "loading" ? <p className="soft">Loading today's desk…</p> : (
          <>
            <h2>The desk could not load</h2>
            <p className="soft">Neither the live API nor the saved snapshot answered. Check your connection and try again.</p>
            <button className="btn primary" onClick={retry}>Try again</button>
          </>
        )}
      </div>
    )}>
      <Shell />
    </DeskProvider>
  );
}
