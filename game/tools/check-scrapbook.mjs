// `npm run scrapbook`: checks the Scrapbook pages in src/scrapbook.js.
//   - every "Read more from NASA" link still answers, without being sent somewhere else
//   - every picture file exists, and every Research Tree id is a real one
//   - each page has a link for both reading levels
// It also prints how hard each write-up is to read (Flesch-Kincaid US school grade), so the
// easy version stays easy: aim for about grade 5 or below for `easy` and 6 to 9 for `deep`.
// Needs the internet. Run it before a release: NASA moves pages now and then.
import { existsSync } from 'node:fs';
import { PAGES } from '../src/scrapbook.js';
import { NODES } from '../src/research.js';

const syllables = word => Math.max(1, (word.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g) ?? []).length);
function grade(paragraphs) {
  const text = paragraphs.join(' '), words = text.match(/[A-Za-z'’-]+/g) ?? [];
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter(s => s.trim()).length;
  return { words: words.length, grade: 0.39 * words.length / sentences + 11.8 * words.reduce((n, w) => n + syllables(w), 0) / words.length - 15.59 };
}
const picture = name => new URL(`../public/scrapbook/${name}`, import.meta.url);
// NASA's site turns away requests that don't look like a browser.
const headers = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' };

const problems = [];
for (const page of PAGES) {
  const easy = grade(page.easy), deep = grade(page.deep);
  console.log(`${page.name.padEnd(20)} easy: ${String(easy.words).padStart(3)} words, grade ${easy.grade.toFixed(1).padStart(4)}   deep: ${String(deep.words).padStart(3)} words, grade ${deep.grade.toFixed(1).padStart(4)}`);
  if (easy.grade >= deep.grade) problems.push(`${page.name}: the easy version reads harder than the deep one`);
  for (const pic of [page.real, page.model].filter(Boolean)) {
    if (!existsSync(picture(pic.src))) problems.push(`${page.name}: picture ${pic.src} is missing from public/scrapbook/`);
  }
  for (const id of [...(page.upgrades ?? []), ...(page.needs ? [page.needs] : [])]) {
    if (!NODES.some(node => node.id === id)) problems.push(`${page.name}: "${id}" is not in the Research Tree`);
  }
  for (const level of ['easy', 'deep']) {
    if (!page.links.some(link => link.for === level || link.for === 'both')) problems.push(`${page.name}: no NASA link for the ${level} version`);
  }
  for (const link of page.links) {
    const res = await fetch(link.url, { headers }).catch(err => ({ ok: false, status: err.message }));
    if (!res.ok) problems.push(`${page.name}: ${link.url} answered ${res.status}`);
    else if (res.url !== link.url) problems.push(`${page.name}: ${link.url} now redirects to ${res.url}`);
  }
}
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${problems.join('\n  ')}` : `\nAll ${PAGES.reduce((n, page) => n + page.links.length, 0)} links and all pictures are fine.`);
process.exit(problems.length ? 1 : 0);
