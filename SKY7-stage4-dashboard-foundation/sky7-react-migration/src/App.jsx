import { useEffect } from 'react';
import './styles.css';
import Dashboard from './Dashboard.jsx';

function PublicMenu() {
  useEffect(() => {
    let cancelled = false;
    let cleanupScene;

    // Import only after React has mounted the DOM nodes queried by the scene.
    import('./scene.js')
      .then(({ mountScene }) => {
        // StrictMode may clean up an effect before the dynamic import resolves.
        if (cancelled) return;
        cleanupScene = mountScene();
      })
      .catch((error) => {
        if (!cancelled) console.error('SKY7 scene failed to initialize:', error);
      });

    return () => {
      cancelled = true;
      cleanupScene?.();
    };
  }, []);

  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <canvas id="scene" aria-label="SKY7 interactive 3D menu" />
      <div className="daylight" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header>
        <button className="logo" id="logoBtn" aria-label="SKY7 home">SKY<b>7</b></button>
        <button className="back" id="backBtn" aria-label="Return to categories">←&nbsp; Categories</button>
        <a className="dashboard-entry" href="/dashboard">Owner / Staff</a>
      </header>

      <main>
        <section className="hero" id="hero" aria-label="Introduction">
          <h1>SKY<span>7</span></h1>
          <p className="tag">Dinner above the noise of the city.</p>
          <button className="explore" id="exploreBtn">Explore the menu</button>
        </section>

        <p className="wallhint hidden" id="wallhint">Select an opening to begin</p>

        <aside className="story hidden" id="story" aria-live="polite">
          <div className="cat" id="infoCat" />
          <h2 id="infoName" />
          <p className="desc" id="infoDesc" />
          <div className="meta"><span className="price" id="infoPrice" /><span className="note" id="infoNote" /></div>
        </aside>

        <div className="dishnav hidden" id="dishnav">
          <button id="upBtn" aria-label="Previous dish"><svg viewBox="0 0 14 14"><path d="M2 9l5-5 5 5" /></svg></button>
          <button id="downBtn" aria-label="Next dish"><svg viewBox="0 0 14 14"><path d="M2 5l5 5 5-5" /></svg></button>
          <span className="ct"><b id="infoIdx">01</b> / <span id="infoTotal">05</span></span>
        </div>
        <nav className="cats hidden" id="catnav" aria-label="Menu categories" />
      </main>
    </>
  );
}


export default function App() {
  if (window.location.pathname.startsWith('/dashboard')) return <Dashboard />;
  return <PublicMenu />;
}
