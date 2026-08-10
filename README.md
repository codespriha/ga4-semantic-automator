# ga4-semantic-automator

> **[Live demo](https://codespriha.github.io/ga4-semantic-automator/demo/)** — click the buttons and links, then watch the structured `ui_interaction` payloads land in the data layer.

Zero-dependency Google Analytics 4 (GA4) automation for vanilla JavaScript and
TypeScript projects. It initializes GA4 for you and **automatically captures
semantic user interactions across the entire DOM** using a single delegated
click listener — no per-element tracking boilerplate required.

- **Script injection** — loads the official `googletagmanager.com` loader, wires up `dataLayer` + `window.gtag`, and fires the initial `js` + `config` hits.
- **Global semantic listener** — one click listener on the document root captures `button`, `a`, and `role="button"` interactions anywhere in the page, extracting element metadata, structural context, and outbound-destination flags.
- **Declarative overrides** — control tracking from HTML with `data-ga-event`, `data-ga-label`, and `data-ga-ignore`.
- **SSR-safe** — nothing touches `window`/`document` until you call `initGA4()` in a browser, so Next.js build-time and server rendering stay safe.

## Install

```bash
npm install ga4-semantic-automator
```

## Quick start

```html
<button id="cta" class="btn primary">Get started</button>
```

```js
import { initGA4 } from 'ga4-semantic-automator';

initGA4('G-XXXXXXXXXX');
```

That's it. From now on every click on an interactive element dispatches a
custom GA4 event:

```js
gtag('event', 'ui_interaction', {
  element_id: 'cta',
  element_class: 'btn primary',
  element_tag: 'button',
  element_text: 'Get started',
  element_aria_label: null,
  element_label: null,
  structural_container: 'section#hero',
  destination: null,
  is_outbound: null,
});
```

## Initialization options

```js
import { initGA4 } from 'ga4-semantic-automator';

const controller = initGA4('G-XXXXXXXXXX', {
  config: { cookie_flags: 'SameSite=None;Secure' }, // extra config params
  debug: true, // debug_mode + verbose console logs
  sendPageView: true, // send the initial page_view hit (default true)
  dataLayerName: 'dataLayer', // custom data layer array name
});

// Later:
controller.destroy(); // removes the delegated listener
```

| Option          | Type      | Default       | Description                                                  |
| --------------- | --------- | ------------- | ------------------------------------------------------------ |
| `config`        | `object`  | `{}`          | Extra params merged into the `config` hit.                   |
| `debug`         | `boolean` | `false`       | Sets `debug_mode` on the config hit and logs tracked events. |
| `sendPageView`  | `boolean` | `true`        | Whether to send the initial `page_view`.                     |
| `dataLayerName` | `string`  | `'dataLayer'` | Name of the data layer array.                                |

`initGA4` returns a controller `{ gtag, destroy }` — or `undefined` if called
outside the browser (e.g. during SSR).

## Declarative data-attribute schema

Control how individual elements are tracked directly in your HTML.

### `data-ga-event`

Overrides the default `ui_interaction` event name.

```html
<button data-ga-event="pricing_cta_click">Buy now</button>
<!-- dispatches: gtag('event', 'pricing_cta_click', { ... }) -->
```

### `data-ga-label`

Injects an explicit descriptive label. When present it also overrides the
auto-extracted `element_text`.

```html
<a href="/pricing" data-ga-label="Pricing nav link">See plans</a>
<!-- element_label: 'Pricing nav link', element_text: 'Pricing nav link' -->
```

### `data-ga-ignore`

Completely bypasses tracking for that interaction when present on the element
**or any of its ancestors**.

```html
<button data-ga-ignore>Cookie banner button</button>

<section data-ga-ignore>
  <button>Also never tracked</button>
</section>
```

## What gets captured

Every tracked interaction produces a flat, GA4-friendly parameter set:

| Parameter              | Description                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `element_id`           | The element's `id`, or `null`.                                                                |
| `element_class`        | The element's `class`, or `null`.                                                             |
| `element_tag`          | Lowercased tag name (`button`, `a`, `div`, …).                                                |
| `element_text`         | Visible inner text (normalized, ≤ 120 chars), overridable via `data-ga-label` / `aria-label`. |
| `element_aria_label`   | The element's `aria-label`, or `null`.                                                        |
| `element_label`        | The `data-ga-label` override, or `null`.                                                      |
| `structural_container` | Closest ancestor with an `id` or a semantic tag (`section#pricing`, `nav`, `form#signup`, …). |
| `destination`          | Resolved URL for anchor clicks, or `null`.                                                    |
| `is_outbound`          | `true` when an anchor host differs from the current page host.                                |

### How it works under the hood

1. `initGA4()` creates the `dataLayer` array, defines the `window.gtag` wrapper, pushes `gtag('js', …)` + `gtag('config', …)`, and injects `<script async src="https://www.googletagmanager.com/gtag/js?id=…">`.
2. A single capture-phase click listener is attached to `document`. On click it resolves the nearest `button, a, [role="button"]` ancestor (so clicks on nested icons/spans still count).
3. It checks the declarative schema (`data-ga-ignore` short-circuits), builds the payload, and pushes `gtag('event', name, payload)` — synchronously, before navigation, so anchor clicks aren't lost.

## TypeScript

Types ship with the package (`src/index.d.ts`):

```ts
import { initGA4, type UIInteractionPayload } from 'ga4-semantic-automator';

initGA4('G-XXXXXXXXXX', { debug: true });
```

## Framework notes

- **Next.js / SSR**: import safely at module scope; only call `initGA4()` inside `useEffect` (client components).
- **React**: one call in the app root; the delegated listener covers all rendered content — no per-component tracking needed.

## License

MIT
