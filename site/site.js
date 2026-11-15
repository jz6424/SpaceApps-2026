// The game is in its frame from the moment the page opens. This script handles full screen for the whole
// stage, the restart with simple graphics, and bringing the game into view when someone starts using it.
(() => {
  const stage = document.getElementById('play');
  const frame = document.getElementById('game');
  const status = document.getElementById('stage-status');
  const fsBtn = document.getElementById('fs');
  const fsLabel = document.getElementById('fs-label');
  const fsIcon = document.getElementById('fs-icon');
  const lowBtn = document.getElementById('low');
  const head = document.querySelector('.site-head');
  const root = document.documentElement;
  let low = false;
  let invited = false;   // has someone clicked, tabbed or pressed a button to go into the game yet?
  let tabbed = -1e9;     // when Tab was last pressed on the page

  const nativeEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const isFull = () => nativeEl() === stage || stage.classList.contains('is-max');

  // The frame starts loading with the page, so it may already be done by the time this script runs.
  const ready = () => { status.textContent = low ? 'Ready to play, with simple graphics' : 'Ready to play'; };
  const loaded = () => {
    try { return frame.contentWindow.location.href !== 'about:blank' && frame.contentDocument.readyState === 'complete'; }
    catch { return false; }
  };
  // The page and the game come from the same site, so the page can tell when the game is clicked.
  function hook() {
    try {
      frame.contentWindow.addEventListener('pointerdown', () => { invited = true; }, true);
      // Clicking the game when part of it is off screen settles the page so all of it shows.
      frame.contentWindow.addEventListener('pointerup', show, true);
    } catch { invited = true; }
  }
  frame.addEventListener('load', () => { hook(); ready(); });
  if (loaded()) { hook(); ready(); }

  // Scroll just enough to show the whole game, unless it is all on screen already.
  function show() {
    if (isFull()) return;
    const top = head.offsetHeight + 8;
    const r = stage.getBoundingClientRect();
    if (r.top >= top && r.bottom <= innerHeight) return;
    stage.scrollIntoView({ block: r.height <= innerHeight - top - 8 ? 'center' : 'start' });
  }

  function sync() {
    const full = isFull();
    fsBtn.setAttribute('aria-pressed', String(full));
    fsLabel.textContent = full ? 'Exit full screen' : 'Full screen';
    fsIcon.setAttribute('href', full ? '#i-min' : '#i-max');
    if (!nativeEl()) navigator.keyboard?.unlock?.();
    if (full) frame.focus({ preventScroll: true });
  }

  async function enter() {
    invited = true;
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
    // "Play now" further down the page: go back up to the game and hand it the keyboard.
    play() { invited = true; show(); frame.focus({ preventScroll: true }); },
    // Loads the game again with or without simple graphics. A mission in progress starts over.
    low() {
      low = !low;
      invited = true;
      status.textContent = 'Loading the game…';
      frame.src = frame.dataset.src + (low ? '?low' : '');
      lowBtn.textContent = low ? 'restart with full graphics' : 'restart with simple graphics';
      show();
    },
    fullscreen() { if (isFull()) leave(); else enter(); },
  };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-do]');
    if (el && actions[el.dataset.do]) actions[el.dataset.do]();
  });
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  // In the fill-the-window fallback, Esc on the page (not inside the game) leaves it.
  document.addEventListener('keydown', e => {
    if (e.key === 'Tab') tabbed = performance.now();
    if (e.key === 'Escape' && stage.classList.contains('is-max')) leave();
  });
  // When the game finishes loading it puts the keyboard on its own Play button. Here that would take the
  // keyboard away from the page (Space would press Play instead of scrolling down), so the page takes it
  // back until someone goes into the game on purpose.
  function keep() {
    if (invited || document.activeElement !== frame) return;
    if (performance.now() - tabbed < 300) invited = true;
    else frame.blur();
  }
  // A tick later, because the browser ignores a change of focus made while it is still moving it.
  window.addEventListener('blur', () => setTimeout(keep, 0));
  frame.addEventListener('load', keep);
  keep();
})();
