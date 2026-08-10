import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'http://localhost/',
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;

import { initGA4, destroy } from '../src/index.js';

let controller;
let dl;

function lastEvent() {
  for (let i = dl.length - 1; i >= 0; i--) {
    const e = dl[i];
    if (e && e[0] === 'event') {
      return e;
    }
  }
  return null;
}

function eventCount() {
  let n = 0;
  for (const e of dl) {
    if (e && e[0] === 'event') {
      n += 1;
    }
  }
  return n;
}

before(() => {
  controller = initGA4('G-TEST123');
  dl = window.dataLayer;
});

test('returns a controller exposing gtag and destroy', () => {
  assert.equal(typeof controller.gtag, 'function');
  assert.equal(typeof controller.destroy, 'function');
});

test('injects the official GA4 loader script into the head', () => {
  const script = document.getElementById('ga4-semantic-automator-G-TEST123');
  assert.ok(script, 'loader script should exist');
  assert.equal(script.tagName, 'SCRIPT');
  assert.equal(script.async, true);
  assert.equal(script.src, 'https://www.googletagmanager.com/gtag/js?id=G-TEST123');
  assert.equal(script.getAttribute('data-ga4-automator'), 'true');
});

test('creates the dataLayer and pushes js + config hits', () => {
  assert.ok(Array.isArray(dl));
  const jsPush = dl.find((e) => e && e[0] === 'js');
  assert.ok(jsPush, 'gtag("js") should be pushed');
  assert.ok(jsPush[1] instanceof Date);
  const configPush = dl.find((e) => e && e[0] === 'config');
  assert.ok(configPush, 'gtag("config") should be pushed');
  assert.equal(configPush[1], 'G-TEST123');
  assert.equal(configPush[2].send_page_view, true);
});

test('ignores duplicate initGA4 calls without double-injecting', () => {
  const originalWarn = console.warn;
  let warned = '';
  console.warn = (...args) => {
    warned = args.join(' ');
  };
  const again = initGA4('G-OTHER');
  console.warn = originalWarn;
  assert.ok(warned.includes('Already initialized'));
  assert.equal(again.gtag, controller.gtag);
  assert.equal(document.querySelectorAll('[data-ga4-automator]').length, 1);
});

test('captures button clicks with semantic metadata', () => {
  document.body.innerHTML = '<button id="signup" class="btn primary">Sign up free</button>';
  document.querySelector('#signup').click();
  const ev = lastEvent();
  assert.equal(ev[0], 'event');
  assert.equal(ev[1], 'ui_interaction');
  assert.deepEqual(ev[2], {
    element_id: 'signup',
    element_class: 'btn primary',
    element_tag: 'button',
    element_text: 'Sign up free',
    element_aria_label: null,
    element_label: null,
  });
});

test('resolves clicks on children to the interactive ancestor', () => {
  document.body.innerHTML =
    '<button id="cta"><span class="icon">rocket</span><span>Launch</span></button>';
  document.querySelector('.icon').click();
  const ev = lastEvent();
  assert.equal(ev[2].element_id, 'cta');
  assert.equal(ev[2].element_tag, 'button');
  assert.ok(ev[2].element_text.includes('Launch'));
});

test('ignores clicks on non-interactive elements', () => {
  document.body.innerHTML = '<div id="plain">Hello</div>';
  const beforeCount = eventCount();
  document.querySelector('#plain').click();
  assert.equal(eventCount(), beforeCount);
});

test('flags outbound anchor destinations and resolves internal ones', () => {
  document.body.innerHTML = '<a id="ext" href="https://example.com/path">External</a>';
  document.querySelector('#ext').addEventListener('click', (e) => e.preventDefault());
  document.querySelector('#ext').click();
  let ev = lastEvent();
  assert.equal(ev[2].destination, 'https://example.com/path');
  assert.equal(ev[2].is_outbound, true);

  document.body.innerHTML = '<a id="int" href="/about">Internal</a>';
  document.querySelector('#int').addEventListener('click', (e) => e.preventDefault());
  document.querySelector('#int').click();
  ev = lastEvent();
  assert.equal(ev[2].destination, 'http://localhost/about');
  assert.equal(ev[2].is_outbound, false);
});

test('records the closest structural container with an id or semantic tag', () => {
  document.body.innerHTML =
    '<section id="pricing"><div><button id="buy">Buy</button></div></section>';
  document.querySelector('#buy').click();
  assert.equal(lastEvent()[2].structural_container, 'section#pricing');

  document.body.innerHTML = '<nav><a href="/x">X</a></nav>';
  const navLink = document.querySelector('a');
  navLink.addEventListener('click', (e) => e.preventDefault());
  navLink.click();
  assert.equal(lastEvent()[2].structural_container, 'nav');
});

test('data-ga-event overrides the event name', () => {
  document.body.innerHTML = '<button id="vip" data-ga-event="vip_click">VIP</button>';
  document.querySelector('#vip').click();
  assert.equal(lastEvent()[1], 'vip_click');
});

test('data-ga-label overrides element_label and element_text', () => {
  document.body.innerHTML = '<button id="lbl" data-ga-label="Pricing CTA">Buy now</button>';
  document.querySelector('#lbl').click();
  const params = lastEvent()[2];
  assert.equal(params.element_label, 'Pricing CTA');
  assert.equal(params.element_text, 'Pricing CTA');
});

test('data-ga-ignore on the element bypasses tracking', () => {
  document.body.innerHTML = '<button id="no1" data-ga-ignore>No</button>';
  const beforeCount = eventCount();
  document.querySelector('#no1').click();
  assert.equal(eventCount(), beforeCount);
});

test('data-ga-ignore on an ancestor bypasses tracking for descendants', () => {
  document.body.innerHTML = '<div data-ga-ignore><button id="no2">No</button></div>';
  const beforeCount = eventCount();
  document.querySelector('#no2').click();
  assert.equal(eventCount(), beforeCount);
});

test('captures aria-label and falls back to text', () => {
  document.body.innerHTML = '<button id="xbtn" aria-label="Close dialog">&times;</button>';
  document.querySelector('#xbtn').click();
  const params = lastEvent()[2];
  assert.equal(params.element_aria_label, 'Close dialog');
  assert.equal(params.element_text, '×');
});

test('captures elements with role="button"', () => {
  document.body.innerHTML = '<div id="rb" role="button" tabindex="0">Custom</div>';
  document.querySelector('#rb').click();
  const params = lastEvent()[2];
  assert.equal(params.element_tag, 'div');
  assert.equal(params.element_id, 'rb');
});

test('is SSR-safe: returns undefined outside the browser without throwing', () => {
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  delete globalThis.window;
  delete globalThis.document;
  try {
    let result;
    assert.doesNotThrow(() => {
      result = initGA4('G-TEST');
    });
    assert.equal(result, undefined);
  } finally {
    globalThis.window = savedWindow;
    globalThis.document = savedDocument;
  }
});

test('destroy removes the delegated listener', () => {
  const beforeCount = eventCount();
  document.body.innerHTML = '<button id="bye">Bye</button>';
  destroy();
  document.querySelector('#bye').click();
  assert.equal(eventCount(), beforeCount);
});
