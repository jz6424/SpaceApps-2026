// Read aloud: a button on the tour card and on every station panel reads its words out with the
// browser's own voice (speechSynthesis), for players who are still learning to read. Press it
// again to stop. Moving on (Next, Close, Esc) stops it too. Browsers without a voice hide the buttons.
const voice = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
if (!voice) document.documentElement.classList.add('no-voice');

let reading = null; // the button whose words are being read

// Stops reading. Also called by the HUD, the tour and the menus whenever what was being read goes
// away (a panel closes, a card moves on, the mission ends).
export function stop() {
  if (!voice || !reading) return;
  reading.setAttribute('aria-pressed', 'false');
  reading = null;
  queue = [];
  speechSynthesis.cancel();
}

// The words a player sees in a panel, in reading order, without the button labels around them
// (the station's choice buttons stay: their names and notes are part of what to read).
function wordsIn(box) {
  const copy = box.cloneNode(true);
  copy.querySelectorAll('.read-aloud, #station-close, #tour-card .row, [aria-hidden="true"], svg, canvas, [hidden]').forEach(el => el.remove());
  // innerText keeps the line breaks between blocks, which become pauses, but only on a laid-out
  // element, so the copy is put on the page for a moment, out of sight.
  copy.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;';
  // Headings drawn in capitals are read in normal case, or some voices spell them letter by letter.
  for (const el of [copy, ...copy.querySelectorAll('*')]) el.style.textTransform = 'none';
  document.body.appendChild(copy);
  const text = copy.innerText.replace(/\n+/g, '.\n').replace(/\.\.+/g, '.').replace(/\s+/g, ' ').trim();
  copy.remove();
  return text;
}

// Spoken a sentence at a time: some voices (the online ones on Chromebooks) stop after about 15
// seconds of one long utterance. The utterances are kept in `queue` so the browser can't drop
// them half way (a Chrome bug that also loses their "end" event).
let queue = [];
function read(button) {
  if (reading === button) { stop(); return; }
  stop();
  const box = button.closest(button.dataset.read);
  if (!box) return;
  const sentences = wordsIn(box).match(/[^.!?]+[.!?]*/g)?.map(t => t.trim()).filter(Boolean) ?? [];
  if (!sentences.length) return;
  queue = sentences.map(text => {
    const say = new SpeechSynthesisUtterance(text);
    say.lang = 'en-US';
    say.rate = 0.95;
    return say;
  });
  const last = queue.at(-1);
  last.onend = () => { if (reading === button) stop(); };
  queue.forEach(say => { say.onerror = () => { if (reading === button) stop(); }; });
  reading = button;
  button.setAttribute('aria-pressed', 'true');
  queue.forEach(say => speechSynthesis.speak(say));
}

if (voice) {
  document.addEventListener('click', e => {
    const button = e.target.closest('.read-aloud');
    if (button) { read(button); return; }
    if (e.target.closest('#tour-next, #tour-skip, #tour-more, #tour-alt, #station-close, [data-do]')) stop();
  });
  addEventListener('keydown', e => { if (e.code === 'Escape') stop(); });
  addEventListener('pagehide', stop);
}

export { stop as stopReading };
