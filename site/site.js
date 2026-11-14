// Loads the game into its frame on demand and handles full screen for the whole stage.
(() => {
  const stage = document.getElementById('play');
  const frame = document.getElementById('game');
  const poster = document.getElementById('poster');
  const status = document.getElementById('stage-status');
  const fsBtn = document.getElementById('fs');
  const fsLabel = document.getElementById('fs-label');
  const fsIcon = document.getElementById('fs-icon');
  const root = document.documentElement;

  const nativeEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const isFull = () => nativeEl() === stage || stage.classList.contains('is-max');

  // The game only starts downloading and drawing once someone asks for it.
  function start(low) {
    if (!frame.getAttribute('src')) {
      frame.src = frame.dataset.src + (low ? '?low' : '');
      status.textContent = 'Loading the base…';
      frame.addEventListener('load', () => { status.textContent = 'Moon Base Trainer'; frame.focus(); }, { once: true });
    }
    poster.hidden = true;
    frame.hidden = false;
    stage.classList.add('is-live');
    frame.focus();
  }

  function sync() {
    const full = isFull();
    fsBtn.setAttribute('aria-pressed', String(full));
    fsLabel.textContent = full ? 'Exit full screen' : 'Full screen';
    fsIcon.setAttribute('href', full ? '#i-min' : '#i-max');
    if (!nativeEl()) navigator.keyboard?.unlock?.();
    if (!frame.hidden) frame.focus();
  }

  async function enter() {
    try {
      if (stage.requestFullscreen) await stage.requestFullscreen();
      else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
      else throw new Error('no fullscreen');
      // Where the browser allows it, let Esc reach the game (pause) instead of leaving full screen.
      navigator.keyboard?.lock?.(['Escape']).catch(() => {});
    } catch {
      // No full-screen support (for example iPhone): fill the browser window instead.
      stage.classList.add('is-max');
      root.classList.add('no-scroll');
    }
    sync();
  }

  function leave() {
    if (nativeEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    stage.classList.remove('is-max');
    root.classList.remove('no-scroll');
    sync();
  }

  const actions = {
    play() { start(false); stage.scrollIntoView({ block: 'center' }); },
    low() { start(true); stage.scrollIntoView({ block: 'center' }); },
    fullscreen() { if (isFull()) leave(); else { start(false); enter(); } },
  };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-do]');
    if (el && actions[el.dataset.do]) actions[el.dataset.do]();
  });
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  // In the fill-the-window fallback, Esc on the page (not inside the game) leaves it.
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && stage.classList.contains('is-max')) leave(); });
})();
