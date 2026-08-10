/**
 * ga4-semantic-automator
 *
 * Zero-dependency GA4 auto-initialization plus semantic interaction tracking.
 * A single delegated click listener captures clicks on interactive elements
 * anywhere in the DOM and pushes a structured custom event to the GA4 data
 * layer, with declarative data-attribute overrides.
 *
 * Safe to import in SSR / Next.js build-time contexts: nothing touches
 * `window` or `document` until {@link initGA4} is called in a browser.
 */

/** Default custom event name for captured interactions. */
const DEFAULT_EVENT_NAME = 'ui_interaction';

/** Official GA4 loader script URL template. */
const GTAG_BASE_URL = 'https://www.googletagmanager.com/gtag/js?id=';

/** Elements treated as interactive for click capture. */
const INTERACTIVE_SELECTOR = 'button, a, [role="button"]';

/** Semantic structural containers used for contextual tracking. */
const STRUCTURAL_TAGS = ['section', 'nav', 'header', 'footer', 'main', 'form', 'article', 'aside'];

/** Guards against re-initialization and keeps a reference for teardown. */
let initialized = false;
let clickHandler = null;
let gtagRef = null;
let options = null;

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const log = (...args) => {
  if (options?.debug) {
    console.log('[ga4-semantic-automator]', ...args);
  }
};

const warn = (...args) => {
  console.warn('[ga4-semantic-automator]', ...args);
};

/**
 * Initializes GA4 for the given measurement ID and starts capturing semantic
 * interactions across the whole DOM.
 *
 * @param {string} measurementId - GA4 measurement ID (e.g. "G-XXXXXXXXXX").
 * @param {object} [options] - Configuration.
 * @param {object} [options.config] - Extra params merged into the `config` hit
 *   (e.g. `{ cookie_flags: 'SameSite=None;Secure' }`).
 * @param {boolean} [options.debug] - Enable `debug_mode` and verbose console logs.
 * @param {boolean} [options.sendPageView=true] - Send the initial `page_view` hit.
 * @param {string} [options.dataLayerName='dataLayer'] - Custom data layer array name.
 * @returns {{ gtag: Function, destroy: Function }|undefined} A controller with
 *   the gtag wrapper and a `destroy()` teardown, or `undefined` outside the browser.
 */
export function initGA4(measurementId, optionsValue = {}) {
  if (!isBrowser()) {
    return undefined;
  }
  if (typeof measurementId !== 'string' || !measurementId.trim()) {
    warn('initGA4 requires a non-empty measurementId. Aborting.');
    return undefined;
  }
  if (initialized) {
    warn('Already initialized. Ignoring duplicate initGA4() call.');
    return { gtag: gtagRef, destroy };
  }

  initialized = true;
  options = optionsValue;
  gtagRef = window.gtag;

  // Feature A: data layer buffer + global gtag wrapper.
  const dataLayerName =
    typeof options.dataLayerName === 'string' ? options.dataLayerName : 'dataLayer';
  if (!Array.isArray(window[dataLayerName])) {
    window[dataLayerName] = [];
  }
  const queue = window[dataLayerName];

  if (typeof gtagRef !== 'function') {
    gtagRef = function gtag() {
      queue.push(arguments);
    };
    window.gtag = gtagRef;
  }

  // Default global js configuration + initial config page-view hit.
  const sendPageView = options.sendPageView !== false;
  gtagRef('js', new Date());
  gtagRef('config', measurementId, {
    send_page_view: sendPageView,
    ...(options.debug ? { debug_mode: true } : {}),
    ...(options.config || {}),
  });

  // Inject the official GA4 loader script.
  injectLoader(measurementId);

  // Feature B: single delegated click listener on the document root.
  clickHandler = (event) => {
    handleClick(event, gtagRef);
  };
  document.addEventListener('click', clickHandler, true);

  log('Initialized GA4 for', measurementId, `(dataLayer: "${dataLayerName}")`);

  return { gtag: gtagRef, destroy };
}

/**
 * Removes the delegated listener and resets internal state.
 * @returns {void}
 */
export function destroy() {
  if (clickHandler) {
    document.removeEventListener('click', clickHandler, true);
  }
  clickHandler = null;
  gtagRef = null;
  options = null;
  initialized = false;
}

/**
 * Injects the official GA4 loader script into the document head.
 * @param {string} measurementId - GA4 measurement ID.
 * @returns {void}
 */
function injectLoader(measurementId) {
  const scriptId = `ga4-semantic-automator-${measurementId}`;
  if (document.getElementById(scriptId)) {
    return;
  }
  const script = document.createElement('script');
  script.id = scriptId;
  script.async = true;
  script.src = `${GTAG_BASE_URL}${encodeURIComponent(measurementId)}`;
  script.setAttribute('data-ga4-automator', 'true');
  const head = document.head || document.documentElement;
  head.appendChild(script);
}

/**
 * Delegated click handler: resolves the nearest interactive element, honors the
 * declarative override schema, builds the semantic payload, and dispatches it.
 * @param {MouseEvent} event - The click event.
 * @param {Function} gtag - The gtag wrapper.
 * @returns {void}
 */
function handleClick(event, gtag) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') {
    return;
  }

  // Feature B: only interactive elements (or clicks landing on their children).
  const interactive = target.closest(INTERACTIVE_SELECTOR);
  if (!interactive) {
    return;
  }

  // Feature C: data-ga-ignore bypasses tracking for this interaction.
  if (interactive.closest('[data-ga-ignore]')) {
    return;
  }

  const payload = collectPayload(interactive);
  const eventName = interactive.getAttribute('data-ga-event') || DEFAULT_EVENT_NAME;

  dispatch(eventName, payload, gtag);
  log('Tracked', eventName, payload);
}

/**
 * Builds the semantic payload for an interactive element.
 * @param {Element} el - The interactive element that was clicked.
 * @returns {object} Flat GA4-compatible event parameters.
 */
function collectPayload(el) {
  const tag = el.tagName.toLowerCase();
  const id = el.getAttribute('id');
  const className = el.getAttribute('class');
  const ariaLabel = el.getAttribute('aria-label');
  const overrideLabel = el.getAttribute('data-ga-label');

  let text = overrideLabel || getVisibleText(el);
  if (!text) {
    text = ariaLabel;
  }

  const payload = {
    element_id: id || null,
    element_class: className ? className.trim() : null,
    element_tag: tag,
    element_text: text || null,
    element_aria_label: ariaLabel || null,
    element_label: overrideLabel || null,
  };

  // Structural context: nearest wrapping container with an id or semantic tag.
  const structure = findStructure(el);
  if (structure) {
    payload.structural_container = structure;
  }

  // Destination tracking for anchors.
  if (tag === 'a') {
    const destination = getDestination(el);
    if (destination) {
      payload.destination = destination.href;
      payload.is_outbound = destination.isOutbound;
    }
  }

  return payload;
}

/**
 * Extracts visible text (falling back to textContent when innerText is
 * unavailable, e.g. jsdom), normalized and length-capped.
 * @param {Element} el - The element to read.
 * @returns {string|null} Normalized text, or null when empty.
 */
function getVisibleText(el) {
  const raw = typeof el.innerText === 'string' ? el.innerText : el.textContent;
  if (!raw) {
    return null;
  }
  const normalized = raw.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 120) : null;
}

/**
 * Walks up the DOM from an element to find the closest structural container
 * that carries an id or is a known semantic tag (section, nav, form, ...).
 * @param {Element} el - The interactive element.
 * @returns {string|null} e.g. "section#pricing", "nav", or null.
 */
function findStructure(el) {
  let node = el.parentElement;
  while (
    node &&
    node.nodeType === 1 &&
    node !== document.body &&
    node !== document.documentElement
  ) {
    const tag = node.tagName.toLowerCase();
    const id = node.getAttribute('id');
    if (id || STRUCTURAL_TAGS.includes(tag)) {
      return id ? `${tag}#${id}` : tag;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Resolves an anchor's destination and outbound status.
 * @param {HTMLAnchorElement} el - The anchor element.
 * @returns {{ href: string, isOutbound: boolean }|null} Destination info.
 */
function getDestination(el) {
  const raw = el.getAttribute('href');
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw, window.location.href);
    const isOutbound =
      (url.protocol === 'http:' || url.protocol === 'https:') && url.host !== window.location.host;
    return { href: url.href, isOutbound };
  } catch {
    return { href: raw, isOutbound: false };
  }
}

/**
 * Pushes a custom event to the GA4 data layer.
 * @param {string} eventName - The event name (defaults to "ui_interaction").
 * @param {object} params - Flat event parameters.
 * @param {Function} gtag - The gtag wrapper.
 * @returns {void}
 */
function dispatch(eventName, params, gtag) {
  if (typeof gtag !== 'function') {
    return;
  }
  gtag('event', eventName, params);
}

export default initGA4;
