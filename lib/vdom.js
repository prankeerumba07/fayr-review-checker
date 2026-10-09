// A tiny virtual DOM. h() makes plain objects; render() patches the real DOM
// in place, so focus and typing survive a re-render. Text is always a text
// node: there is no way to put HTML in, on purpose.

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'open']);

function flatten(children, out) {
  for (const child of children) {
    if (Array.isArray(child)) flatten(child, out);
    else if (child === null || child === undefined || child === false || child === true) continue;
    else if (typeof child === 'object' && (child.tag || child.text !== undefined)) out.push(child);
    else out.push({ text: String(child) });
  }
  return out;
}

export function h(tag, attrs, ...children) {
  const a = attrs && typeof attrs === 'object' && !Array.isArray(attrs) && !attrs.tag && attrs.text === undefined
    ? attrs
    : null;
  const kids = a === null && attrs !== null && attrs !== undefined ? [attrs, ...children] : children;
  const { key = null, ...rest } = a ?? {};
  return { tag, attrs: rest, key: key === null ? null : String(key), children: flatten(kids, []) };
}

/** Every piece of text in a tree, joined, for tests and for reading a screen. */
export function textOf(tree) {
  if (tree === null || tree === undefined) return '';
  if (Array.isArray(tree)) return tree.map(textOf).join('');
  if (tree.text !== undefined) return tree.text;
  return (tree.children ?? []).map(textOf).join('');
}

/** Every element node in a tree that passes test(node). */
export function findAll(tree, test) {
  const out = [];
  const walk = (n) => {
    if (n === null || n === undefined) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.tag === undefined) return;
    if (test(n)) out.push(n);
    (n.children ?? []).forEach(walk);
  };
  walk(tree);
  return out;
}

/** The first element with this data-id, or null. */
export function byId(tree, id) {
  return findAll(tree, (n) => n.attrs?.['data-id'] === id)[0] ?? null;
}

// ---- patching the real DOM ----

function sameKind(el, v) {
  if (v.text !== undefined) return el.nodeType === 3;
  return el.nodeType === 1 && el.__tag === v.tag && (el.__key ?? null) === v.key;
}

function create(doc, v) {
  if (v.text !== undefined) return doc.createTextNode(v.text);
  const el = doc.createElement(v.tag);
  el.__tag = v.tag;
  el.__key = v.key;
  return el;
}

function setAttrs(el, attrs) {
  const old = el.__attrs ?? {};
  for (const name of Object.keys(old)) {
    if (name in attrs) continue;
    if (name.startsWith('on')) el.__on[name.slice(2)] = null;
    else if (PROPS.has(name)) el[name] = name === 'value' ? '' : false;
    else el.removeAttribute(name);
  }
  for (const [name, val] of Object.entries(attrs)) {
    if (name.startsWith('on')) {
      const type = name.slice(2);
      el.__on = el.__on ?? {};
      if (!(type in el.__on)) el.addEventListener(type, (e) => el.__on[type]?.(e));
      el.__on[type] = typeof val === 'function' ? val : null;
    } else if (PROPS.has(name)) {
      continue; // after the children, so a <select> has its options first
    } else if (val === null || val === undefined || val === false) {
      el.removeAttribute(name);
    } else {
      const s = val === true ? '' : String(val);
      if (el.getAttribute(name) !== s) el.setAttribute(name, s);
    }
  }
}

function setProps(el, attrs) {
  for (const [name, val] of Object.entries(attrs)) {
    if (!PROPS.has(name)) continue;
    if (name === 'value') {
      if (el.type === 'file') continue;
      const s = val === null || val === undefined ? '' : String(val);
      if (el.value !== s) el.value = s;
    } else if (el[name] !== Boolean(val)) {
      el[name] = Boolean(val);
    }
  }
}

function patch(doc, el, v) {
  if (v.text !== undefined) {
    if (el.data !== v.text) el.data = v.text;
    return;
  }
  setAttrs(el, v.attrs);
  patchChildren(doc, el, v.children);
  setProps(el, v.attrs);
  el.__attrs = v.attrs;
}

function patchChildren(doc, parent, vchildren) {
  const existing = Array.from(parent.childNodes);
  const keyed = new Map();
  const loose = [];
  for (const el of existing) {
    if (el.nodeType === 1 && el.__key !== null && el.__key !== undefined) keyed.set(`${el.__tag}\u0000${el.__key}`, el);
    else loose.push(el);
  }
  const used = new Set();
  let li = 0;
  vchildren.forEach((v, i) => {
    let el = null;
    if (v.tag !== undefined && v.key !== null) {
      const hit = keyed.get(`${v.tag}\u0000${v.key}`);
      if (hit && !used.has(hit)) el = hit;
    } else if (li < loose.length) {
      const cand = loose[li++];
      if (sameKind(cand, v)) el = cand;
    }
    if (!el) el = create(doc, v);
    used.add(el);
    const at = parent.childNodes[i] ?? null;
    if (at !== el) parent.insertBefore(el, at);
    patch(doc, el, v);
  });
  for (const el of existing) if (!used.has(el)) parent.removeChild(el);
}

/** Draw tree (a node or a list of nodes) into container, reusing what is there. */
export function render(container, tree) {
  const list = flatten([tree], []);
  patchChildren(container.ownerDocument, container, list);
}
