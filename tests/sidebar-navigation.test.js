import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');

test('sidebar contains six distinct navigation controls and no adjacent joined links',()=>{
  const nav=html.match(/<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav,'navigation exists');
  const items=nav.match(/<(?:a|button)\b[^>]*class="nav(?: active)?"[^>]*>/g)||[];
  assert.equal(items.length,6);
  assert.match(nav,/href="\/live-proof"/);
  assert.match(nav,/href="\/security-lab"/);
  assert.match(nav,/href="\/x402-gateway"/);
  assert.doesNotMatch(nav,/<\/a><a\s/);
});

test('desktop sidebar treats buttons and anchors as aligned full-width rows',()=>{
  assert.match(css,/\.sidebar nav\{display:flex;flex-direction:column;align-items:stretch/);
  assert.match(css,/\.sidebar nav>\.nav\{display:flex;align-items:center;flex:0 0 auto;width:100%/);
  assert.match(css,/\.sidebar nav>\.nav\{[^}]*white-space:nowrap/);
});

test('mobile navigation is horizontal and scrollable without wrapping',()=>{
  assert.match(css,/@media\(max-width:700px\)\{\s*\.sidebar nav\{flex-direction:row;align-items:center;overflow-x:auto;overflow-y:hidden/);
  assert.match(css,/@media\(max-width:700px\)\{[\s\S]*?\.sidebar nav>\.nav\{flex:0 0 auto;width:auto/);
});
