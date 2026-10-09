// The Flipkart screen. The Flipkart checker is being built, so for now this
// screen shows only the marketplace tabs in the top bar (bar() below), with
// Flipkart chosen and Amazon one press away, and one plain box saying that
// nothing can be checked here yet. It asks the server for nothing and has no
// Amazon or Google login lines. Its look is the shared one (styles.css); the
// tabs look the same as on the Amazon screen, from views/flipkart.css.

/** The words in the box. */
export const BEING_BUILT = 'The Flipkart checker is being built. Nothing can be checked here yet.';

const icon = (h, name) => h('span', { class: `icon icon-${name}`, 'aria-hidden': 'true' });

/** The marketplace tabs: Amazon, which opens the Amazon screen, and Flipkart, chosen. */
function marketTabs(ctx) {
  const { h } = ctx;
  return h(
    'div',
    { class: 'fk-market', role: 'tablist', 'aria-label': 'Marketplace', key: 'market', 'data-id': 'market' },
    h('button', { type: 'button', role: 'tab', class: 'fk-market-tab', 'aria-selected': 'false', onclick: () => ctx.go('amazon'), 'data-id': 'market-amazon' }, icon(h, 'bag'), 'Amazon'),
    h('button', { type: 'button', role: 'tab', class: 'fk-market-tab', 'aria-selected': 'true', 'data-id': 'market-flipkart' }, icon(h, 'bag'), 'Flipkart'),
  );
}

/** The page: one plain box. */
function renderScreen(ctx) {
  const { h } = ctx;
  return h('section', { class: 'card fk-box', key: 'flipkart', 'data-id': 'flipkart-box' }, h('p', null, BEING_BUILT));
}

export default {
  id: 'flipkart',
  initial: () => ({}),
  // Nothing to load, and nothing running to stop.
  enter() {},
  reset() {},
  render: renderScreen,
  bar: marketTabs,
};
