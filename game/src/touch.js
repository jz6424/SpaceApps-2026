// On-screen controls for phones and tablets: a joystick to walk, and Use, Jump and Light buttons.
// They are switched on only where the main way of pointing is a finger and nothing can hover
// (phones, iPads, Android tablets). On a computer, even one with a touch screen, the main
// pointer is a mouse or trackpad, so none of this runs and the controls stay hidden.
export const isTouch = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
if (isTouch) document.documentElement.classList.add('touch');

// The game's hints are written for a keyboard. On a touch screen the same hints are reworded
// for fingers: E becomes the Use button, WASD the joystick, a click a tap.
const REWORD = [
  [/\(or press <b>E<\/b> when close\)/g, '(or walk up and tap <b>Use</b>)'],
  [/press <b>E<\/b>/g, 'tap <b>Use</b>'],
  [/Press <b>E<\/b>/g, 'Tap <b>Use</b>'],
  [/press E\b/g, 'tap Use'],
  [/Press E\b/g, 'Tap Use'],
  [/ with WASD/g, ' with the joystick'],
  [/ Press (<b>T<\/b>|T) to speed up time( \(now \dx\))?\./g, ' Tap the speed button at the top to speed up time.'],
  [/, and <b>T<\/b> speeds up time/g, ''],
  [/<b>F<\/b> switches your chest light on/g, 'The <b>Light</b> button switches your chest light on'],
  [/press F for your chest light/g, 'tap Light for your chest light'],
  [/glowing rocks with E:/g, 'glowing rocks with Use:'],
  [/\bClick\b/g, 'Tap'],
  [/\bclick\b/g, 'tap'],
];
export function forTouch(text) {
  if (!isTouch || typeof text !== 'string') return text;
  return REWORD.reduce((out, [from, to]) => out.replace(from, to), text);
}

// Wires up the joystick and the two buttons. move(x, y) gets the stick's push from -1 to 1 each
// way (y is down the screen); jump() and use() fire the moment a button is touched.
export function setupTouch({ move, jump, use, light }) {
  const base = document.getElementById('touch-stick'), knob = document.getElementById('touch-knob');
  let finger = null;
  const push = e => {
    const box = base.getBoundingClientRect(), reach = box.width / 2 - knob.offsetWidth / 4;
    let dx = e.clientX - (box.left + box.width / 2), dy = e.clientY - (box.top + box.height / 2);
    const far = Math.hypot(dx, dy);
    if (far > reach) { dx *= reach / far; dy *= reach / far; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    move(dx / reach, dy / reach);
  };
  const letGo = () => { finger = null; knob.style.transform = ''; move(0, 0); };
  base.addEventListener('pointerdown', e => { e.preventDefault(); finger = e.pointerId; base.setPointerCapture(finger); push(e); });
  base.addEventListener('pointermove', e => { if (e.pointerId === finger) push(e); });
  for (const end of ['pointerup', 'pointercancel', 'lostpointercapture']) base.addEventListener(end, e => { if (e.pointerId === finger) letGo(); });
  const press = (id, act) => document.getElementById(id).addEventListener('pointerdown', e => { e.preventDefault(); act(); });
  press('touch-jump', jump);
  press('touch-use', use);
  press('touch-light', light);
  return { letGo };
}
