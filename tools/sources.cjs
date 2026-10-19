// Where the desktop app's source lives — one answer for the build, the tests
// and Tailwind, so they cannot disagree about what the app is made of.
//
// The desktop app was one 24,000-line retirement-planner.jsx. It is now a set
// of parts in src/desktop/, named NN-what-it-holds.jsx and joined in name
// order. Joined, they ARE the old file: every part ends at a line boundary and
// they are concatenated with nothing in between, so the source hash, the
// compiled bundle and every line number Babel reports in a stack trace match
// what the single file produced.
//
// The parts share one scope, as the single file did: a component in one part
// may use a constant from any other. Order matters only where top-level code
// runs at load (a `const` read while the file is still being evaluated), and
// the numbering keeps the original order. To add a part, give it a number that
// puts it where it belongs and rebuild — the page learns the list from the
// build stamp.
const fs = require('fs');
const path = require('path');

const DESKTOP_DIR = 'src/desktop';
const PART_NAME = /^\d\d-[a-z0-9-]+\.jsx$/;

const desktopParts = (root) => fs.readdirSync(path.join(root, DESKTOP_DIR))
  .filter((f) => PART_NAME.test(f))
  .sort()
  .map((f) => `${DESKTOP_DIR}/${f}`);

const readDesktopSource = (root) => desktopParts(root)
  .map((f) => fs.readFileSync(path.join(root, f), 'utf8'))
  .join('');

// What app.css is built from: every file whose class names it carries, plus
// the palette and the Tailwind setup.
const cssInputs = (root) => [
  ...desktopParts(root),
  'retirement-planner-mobile.jsx',
  'theme.js',
  'tools/tailwind.config.cjs',
  'tools/tailwind.input.css',
  'tools/looks.css',
];

module.exports = { DESKTOP_DIR, PART_NAME, desktopParts, readDesktopSource, cssInputs };
