// The Scrapbook screen. It opens on the contents, which lists every page (locked ones included)
// across both pages of the open book.
// Coming in from another screen, the book starts shut: its cover shows for a moment, then swings
// open onto the left page. Going back to the mission menu, the cover swings shut again first.
// Picking a page opens it as a two-page spread: pictures on the left, the write-up on the right.
// A locked page opens too, but it only shows the picture from the game: the other pictures are
// question marks, the write-up is covered, and it says how to unlock it.
// The words and the rules for collecting pages are in scrapbook.js; this file only draws them.
import './scrapbook.css';
import { CONFIG } from './config.js';
import { CHAPTERS, LEVELS, PAGES, discover, pageById, pageOpen } from './scrapbook.js';
import { nodeById } from './research.js';
import { icon } from './hud.js';
import { sampleSound } from './sound.js';

const $ = id => document.getElementById(id);
const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LEVEL_AGES = { easy: 'ages 7 to 9', deep: 'ages 10 and up' };

// Line drawings for the page stickers, in the same thin style as the HUD icons. A name that is
// not here is looked up in the HUD's set.
const GLYPHS = {
  home: '<path d="M2 20h20"/><path d="M5 20v-6a7 7 0 0 1 14 0v6"/><path d="M10 20v-4h4v4"/>',
  flask: '<path d="M9 3h6M10 3v6l-5.2 9.6A1.6 1.6 0 0 0 6.2 21h11.6a1.6 1.6 0 0 0 1.4-2.4L14 9V3"/><path d="M7.6 15h8.8"/>',
  battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M6 10v4M10 10v4"/>',
  helmet: '<path d="M5 19v-7a7 7 0 0 1 14 0v7z"/><path d="M8 12a4 4 0 0 1 8 0v2H8z"/><path d="M3 19h18"/>',
  rover: '<path d="M3 9h13l3 5H3z"/><path d="M7 9V5h4"/><circle cx="7" cy="17.5" r="2.5"/><circle cx="16" cy="17.5" r="2.5"/>',
  drill: '<path d="M12 2v5"/><path d="M8 7h8l-4 15z"/><path d="M9.3 12h5.4M10.6 17h2.8"/>',
  lander: '<path d="M8 4h8l3 7H5z"/><path d="M5 11 2 21M19 11l3 10M9 11v4h6v-4"/>',
  layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  lock: '<path d="M6 11h12v10H6z"/><path d="M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  back: '<path d="m11 6-6 6 6 6M19 6l-6 6 6 6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  out: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
const glyph = (name, size = 24) => (GLYPHS[name]
  ? `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[name]}</svg>`
  : icon(name, size));

// getSave: the current save.  commit: store it.  unlocks: Research Tree ids owned now.
// allOpen: the teacher and judge switch.  snapshot: a still from the 3D world, by name.
// cover: the picture of the base from the start screen.
export function createScrapbook({ getSave, commit, unlocks, allOpen, snapshot, cover }) {
  let at = null;        // id of the page showing, or null for the contents
  let paid = null;      // id of the page that has just earned its points, so its stamp can land
  const stills = new Map();

  const isOpen = page => pageOpen(page, { unlocks: unlocks(), found: getSave().found, all: allOpen() });
  const isRead = page => getSave().read.includes(page.id);
  const openPages = () => PAGES.filter(isOpen);
  const pageNumber = page => PAGES.indexOf(page) + 2;   // the contents is page 1
  const points = n => `${n} research point${n === 1 ? '' : 's'}`;

  function stillFor(page) {
    if (!stills.has(page.id)) {
      const still = snapshot(page.shot);
      if (!still) return null;   // the 3D world is busy or not loaded: try again next time
      stills.set(page.id, still);
    }
    return stills.get(page.id);
  }

  // How to unlock a page: the same words in the contents and on the locked page.
  const unlockText = page => `To unlock: ${esc(page.hint)}`;

  // --- Contents ---
  function rowHtml(page) {
    const number = `<span class="sb-pg">p. ${pageNumber(page)}</span>`;
    if (!isOpen(page)) {
      return `<li><button class="sb-row locked" data-do="page" data-id="${page.id}">
        <span class="sb-sticker">${glyph('lock', 20)}</span>
        <span class="sb-row-name">${esc(page.name)}</span><span class="sb-dots"></span>
        <span class="sb-tag">Locked</span>${number}
        <span class="sb-hint">${unlockText(page)}</span>
      </button></li>`;
    }
    const tag = isRead(page)
      ? `<span class="sb-tag read">${glyph('check', 14)} Read</span>`
      : `<span class="sb-tag new">New${allOpen() ? '' : ` +${CONFIG.science.pageRP}`}</span>`;
    return `<li><button class="sb-row" data-do="page" data-id="${page.id}">
      <span class="sb-sticker">${glyph(page.icon, 20)}</span>
      <span class="sb-row-name">${esc(page.name)}</span><span class="sb-dots"></span>
      ${tag}${number}
    </button></li>`;
  }

  // The contents fills both pages of the open book: the title and the first chapters on the left,
  // the rest on the right, split where the two lists come out about the same length.
  function contentsHtml() {
    const open = openPages(), read = open.filter(isRead), pay = CONFIG.science.pageRP;
    const picture = cover();
    const rowsIn = chapter => PAGES.filter(page => page.chapter === chapter.id);
    let listed = 0;
    const left = CHAPTERS.filter(chapter => { const first = listed < PAGES.length / 2; listed += rowsIn(chapter).length; return first; });
    const right = CHAPTERS.filter(chapter => !left.includes(chapter));
    const chaptersHtml = chapters => chapters.map(chapter => `
          <h4>${esc(chapter.name)}</h4>
          <ol>${rowsIn(chapter).map(rowHtml).join('')}</ol>`).join('');
    return `
    <article class="sb-spread" aria-labelledby="sb-title">
      <section class="sb-leaf sb-toc" aria-labelledby="sb-contents">
        <p class="sb-label">Mission scrapbook · page 1 of ${PAGES.length + 1}</p>
        <div class="sb-top">
          <div>
            <h2 id="sb-title" tabindex="-1">My Moon Base Scrapbook</h2>
            <p class="sb-intro">Every big part of your base gets a page: what it is, how the real one works, and where to read more from NASA.</p>
          </div>
          ${picture ? `<figure class="sb-photo tilt-r">
            <img src="${picture}" width="800" height="800" alt="Your moon base: a white habitat on legs, solar panels and a robot on grey ground under a black sky.">
            <figcaption><b>Your base</b></figcaption>
          </figure>` : ''}
        </div>
        <dl class="sb-tally">
          <div><dt>Pages collected</dt><dd>${open.length} of ${PAGES.length}</dd></div>
          <div><dt>Pages read</dt><dd>${read.length}</dd></div>
          <div><dt>Points from reading</dt><dd>${read.length * pay}</dd></div>
        </dl>
        <h3 id="sb-contents">Contents</h3>${chaptersHtml(left)}
      </section>
      <section class="sb-leaf sb-toc" aria-label="Contents, continued">
        <p class="sb-label">Contents, continued</p>${chaptersHtml(right)}
        <aside class="sb-fact">
          <h3>How to fill your scrapbook</h3>
          <p>Use a station or a machine during a mission and its page is added to the book. Two pages come from the Research Tree.</p>
          <p>The first time you read a page, you earn ${points(pay)}.</p>
        </aside>
      </section>
    </article>`;
  }

  function photoHtml(tilt, label, src, alt, caption, credit = '', size = '') {
    return `<figure class="sb-photo ${tilt} ${size}">
      <img src="${src}" alt="${esc(alt)}" loading="lazy">
      <figcaption><b>${label}</b> ${esc(caption)}${credit ? ` <span class="sb-credit">Photo: ${esc(credit)}</span>` : ''}</figcaption>
    </figure>`;
  }

  // A picture that is still locked: the same taped frame with a question mark in it.
  function mysteryHtml(tilt, label, size = '') {
    return `<figure class="sb-photo ${tilt} ${size}">
      <div class="sb-mystery" role="img" aria-label="A locked picture, shown as a question mark">?</div>
      <figcaption><b>${label}</b> Locked. Unlock this page to see the picture.</figcaption>
    </figure>`;
  }

  // The way back to the contents, in the top left corner of every page.
  const backHtml = `<button class="sb-back" data-do="scrapbook">${glyph('back', 20)} Contents</button>`;

  // Turning pages goes through the whole book, locked pages too.
  function navHtml(page) {
    const i = PAGES.indexOf(page), prev = PAGES[i - 1], next = PAGES[i + 1];
    const lock = other => (isOpen(other) ? '' : `${glyph('lock', 16)}<span class="sr-only">Locked: </span> `);
    return `
    <nav class="sb-nav" aria-label="Scrapbook pages">
      ${prev ? `<button class="btn small" data-do="page" data-id="${prev.id}">${glyph('left', 18)} ${lock(prev)}${esc(prev.name)}</button>` : '<span></span>'}
      <button class="btn small" data-do="scrapbook">Contents</button>
      ${next ? `<button class="btn small" data-do="page" data-id="${next.id}">${lock(next)}${esc(next.name)} ${glyph('right', 18)}</button>` : '<span></span>'}
    </nav>`;
  }

  // A page that has not been collected yet. The picture from the game stays, so you know what to
  // look for. Everything else waits until the page is unlocked.
  function lockedHtml(page) {
    const chapter = CHAPTERS.find(c => c.id === page.chapter).name, still = stillFor(page);
    return `
    <article class="sb-spread is-locked" aria-labelledby="sb-title">
      ${backHtml}
      <section class="sb-leaf sb-photos" aria-label="Pictures">
        ${still ? photoHtml('tilt-l', 'In the game', still, `A picture from the game. ${page.shotCaption}`, page.shotCaption) : ''}
        ${mysteryHtml('tilt-r', 'In real life', page.real.tall ? 'tall' : '')}
        ${page.model ? mysteryHtml('tilt-l', 'Built in Blender', 'small') : ''}
      </section>
      <section class="sb-leaf sb-text">
        <header class="sb-head">
          <div>
            <p class="sb-label">${esc(chapter)} · page ${pageNumber(page)} of ${PAGES.length + 1}</p>
            <h2 id="sb-title" tabindex="-1">${esc(page.name)}</h2>
          </div>
          <p class="sb-stamp locked">${glyph('lock', 14)} Locked</p>
        </header>
        <div class="sb-covered">
          <p class="sb-covered-title">${glyph('lock', 20)} This page is locked</p>
          <p>The write-up, the real-life photo and the NASA links are hidden until you unlock it.</p>
          <div class="sb-scribble" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        </div>
        <p class="sb-game"><b>How to unlock</b> ${esc(page.hint)}${page.needs ? ' <button class="sb-link" data-do="research">Open the Research Tree</button>' : ''}</p>
        <p class="sb-upgrades">When it is unlocked, reading it for the first time earns ${points(CONFIG.science.pageRP)}.</p>
      </section>
    </article>
    ${navHtml(page)}`;
  }

  function pageHtml(page) {
    if (!isOpen(page)) return lockedHtml(page);
    const level = getSave().reading, pay = CONFIG.science.pageRP;
    const chapter = CHAPTERS.find(c => c.id === page.chapter).name;
    const still = stillFor(page);
    const links = page.links.filter(link => link.for === level || link.for === 'both');
    const upgrades = (page.upgrades ?? []).map(id => nodeById(id)?.name).filter(Boolean);
    const stamp = paid === page.id
      ? `<p class="sb-stamp new" role="status">+${points(pay)}</p>`
      : `<p class="sb-stamp">${glyph('check', 14)} Read</p>`;
    return `
    <article class="sb-spread" aria-labelledby="sb-title">
      ${backHtml}
      <section class="sb-leaf sb-photos" aria-label="Pictures">
        ${still ? photoHtml('tilt-l', 'In the game', still, `A picture from the game. ${page.shotCaption}`, page.shotCaption) : ''}
        ${photoHtml('tilt-r', 'In real life', `scrapbook/${page.real.src}`, page.real.alt, page.real.caption, page.real.credit, page.real.tall ? 'tall' : '')}
        ${page.model ? photoHtml('tilt-l', 'Built in Blender with SI help', `scrapbook/${page.model.src}`, page.model.alt, page.model.caption, '', 'small') : ''}
      </section>
      <section class="sb-leaf sb-text">
        <header class="sb-head">
          <div>
            <p class="sb-label">${esc(chapter)} · page ${pageNumber(page)} of ${PAGES.length + 1}</p>
            <h2 id="sb-title" tabindex="-1">${esc(page.name)}</h2>
          </div>
          ${stamp}
        </header>
        <div class="sb-tabs" role="group" aria-label="Reading level">
          ${Object.entries(LEVELS).map(([key, name]) => `<button class="sb-tab" data-do="level" data-id="${key}" aria-pressed="${key === level}">${name} <small>${LEVEL_AGES[key]}</small></button>`).join('')}
        </div>
        <div class="sb-body ${level}">${page[level].map(text => `<p>${esc(text)}</p>`).join('')}</div>
        <p class="sb-game"><b>In the game</b> ${esc(page.game)}</p>
        <aside class="sb-fact"><h3>Did you know?</h3><p>${esc(page.fact)}</p></aside>
        ${level === 'deep' ? `<div class="sb-words"><h3>Science words</h3><dl>${page.words.map(([word, meaning]) => `<div><dt>${esc(word)}</dt><dd>${esc(meaning)}</dd></div>`).join('')}</dl></div>` : ''}
        <div class="sb-links">
          <h3>Read more from NASA</h3>
          <ul>${links.map(link => `<li><a href="${esc(link.url)}" target="_blank" rel="noopener">${glyph('out', 16)} ${esc(link.title)}<span class="sr-only"> (opens the NASA website in a new tab)</span></a></li>`).join('')}</ul>
        </div>
        ${upgrades.length ? `<p class="sb-upgrades"><b>In the Research Tree</b> ${upgrades.length > 1 ? 'Upgrades' : 'An upgrade'} for this: ${esc(upgrades.join(', '))}. <button class="sb-link" data-do="research">Open the Research Tree</button></p>` : ''}
      </section>
    </article>
    ${navHtml(page)}`;
  }

  // The front of the binder: a label with the book's name and the picture of the base.
  // It is only for show, so it is hidden from screen readers; the page under it has the same title.
  function coverHtml() {
    const picture = cover();
    return `<div class="sb-cover" aria-hidden="true">
      <div class="sb-cover-name">
        <p class="sb-label">Mission scrapbook</p>
        <p class="sb-cover-title">My Moon Base Scrapbook</p>
      </div>
      ${picture ? `<figure class="sb-photo tilt-r"><img src="${picture}" width="800" height="800" alt=""></figure>` : ''}
      <p class="sb-cover-foot">Moon Base Trainer</p>
    </div>`;
  }

  // Lays the cover over the book and lets scrapbook.css swing it open. The cover's own animation
  // lasts as long as the whole opening, so when it ends (or is cut short by leaving the screen,
  // or by a click on the cover) the cover is taken away and the book is left open as usual.
  function shut() {
    const spread = $('scrapbook-book').querySelector('.sb-spread');
    spread.insertAdjacentHTML('beforeend', coverHtml());
    spread.classList.add('opening');
    const front = spread.lastElementChild;
    const done = e => {
      if (e.type !== 'click' && (e.target !== front || e.pseudoElement)) return;
      front.remove();
      spread.classList.replace('opening', 'opened');
    };
    for (const type of ['animationend', 'animationcancel', 'click']) front.addEventListener(type, done);
  }

  // Shuts the book before leaving: the opening played backwards, a little faster. done is called
  // once the cover is down, or straight away if the book is asked to shut again (that skips it),
  // if the cover is clicked, or with reduced motion.
  let shutNow = null;
  function close(done) {
    if (shutNow) return shutNow();
    const spread = $('scrapbook-book').querySelector('.sb-spread');
    if (!spread || matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
    spread.querySelector('.sb-cover')?.remove();   // it may still have been opening
    spread.insertAdjacentHTML('beforeend', coverHtml());
    spread.classList.remove('opening', 'opened');
    spread.classList.add('closing');
    const front = spread.lastElementChild;
    const finish = e => {
      if (shutNow !== finish || (e && e.type !== 'click' && (e.target !== front || e.pseudoElement))) return;
      clearTimeout(timer);
      shutNow = null;
      done();
    };
    const timer = setTimeout(finish, 1200);   // in case the animation never reports back
    shutNow = finish;
    for (const type of ['animationend', 'animationcancel', 'click']) front.addEventListener(type, finish);
  }

  function render() {
    const page = at && pageById(at);
    $('scrapbook-points').textContent = getSave().points;
    $('scrapbook-book').innerHTML = page ? pageHtml(page) : contentsHtml();
  }

  // Opens the contents, or one page. A locked page opens as a locked page, and pays nothing.
  // closed: start with the book shut and open its cover first.
  function open(id, { closed = false } = {}) {
    const page = id && pageById(id), save = getSave();
    shutNow = null;   // a page opened while the book was shutting keeps it open
    at = page ? page.id : null;
    paid = null;
    // With every mission opened (the teacher and judge switch) pages can be read but pay nothing,
    // as the README and the site promise.
    if (page && isOpen(page) && !allOpen() && !save.read.includes(at)) {
      save.read.push(at);
      save.points += CONFIG.science.pageRP;
      commit();
      paid = at;
      sampleSound();
    }
    render();
    if (closed) shut();
    $('scrapbook').scrollTop = 0;
    $('sb-title').focus({ preventScroll: true });
  }

  function setLevel(level) {
    if (!Object.hasOwn(LEVELS, level)) return;
    getSave().reading = level;
    commit();
    paid = null;
    render();
    $('scrapbook-book').querySelector(`.sb-tab[data-id="${level}"]`)?.focus();
  }

  // Called while a mission runs. Returns the pages it has just added to the book.
  function collect(sim) {
    const save = getSave(), fresh = discover(sim, save.found);
    if (fresh.length) {
      save.found.push(...fresh.map(page => page.id));
      commit();
    }
    return fresh;
  }

  // Two little arrows float over the book and show where the rest of it is: one at the bottom
  // of the screen while part of the book is below it, one at the top while part is above.
  // A click on an arrow scrolls that way. They only repeat what scrolling does, so they are left
  // out of the tab order and hidden from screen readers.
  const screen = $('scrapbook'), book = $('scrapbook-book');
  const arrows = ['up', 'down'].map(way => {
    screen.insertAdjacentHTML('beforeend', `<button class="sb-more ${way}" tabindex="-1" aria-hidden="true" title="More of the Scrapbook is ${way === 'up' ? 'above' : 'below'}">${glyph(way, 22)}</button>`);
    const arrow = screen.lastElementChild;
    arrow.addEventListener('click', () => {
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      screen.scrollBy({ top: (way === 'up' ? -0.8 : 0.8) * screen.clientHeight, behavior: calm ? 'auto' : 'smooth' });
    });
    return arrow;
  });
  function pointToRest() {
    if (screen.hidden) return;
    const box = book.getBoundingClientRect(), HIDDEN = 16;   // px of book out of sight before an arrow shows
    arrows[0].classList.toggle('on', box.top < -HIDDEN);
    arrows[1].classList.toggle('on', box.bottom > screen.clientHeight + HIDDEN);
  }
  screen.addEventListener('scroll', pointToRest, { passive: true });
  addEventListener('resize', pointToRest);
  new ResizeObserver(pointToRest).observe(book);   // a new page, or its pictures arriving

  // Left and right arrow keys turn the pages.
  addEventListener('keydown', e => {
    if ($('scrapbook').hidden || !at || e.altKey || e.ctrlKey || e.metaKey) return;
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.code];
    if (!step) return;
    const next = PAGES[PAGES.findIndex(page => page.id === at) + step];
    if (next) { e.preventDefault(); open(next.id); }
  });

  return {
    open, close, setLevel, collect,
    get page() { return at; },   // the page showing, or null on the contents
    // Pages in the book that have not been read yet.
    unread: () => openPages().filter(page => !isRead(page)).length,
  };
}
