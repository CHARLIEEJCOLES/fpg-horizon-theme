/*
 * The Först pages (sections/fpg-forst-machine.liquid, sections/fpg-forst-range.liquid).
 * - Service kit: each part's link becomes an "Add" button that puts it in the basket without leaving the page,
 *   and "Add the whole kit" adds every part on sale at once. Without this file the links go to the parts' pages.
 * - Photos open enlarged, with arrow keys to move between them.
 * - After the enquiry form is sent, the thank-you is brought into view.
 * The basket is updated through FPGTools.addItemsToCart (assets/fpg-cart.js), so the cart icon and drawer follow.
 */

const tools = () => /** @type {any} */ (window).FPGTools;

/** Adds items to the basket; true when it worked. */
async function addToBasket(/** @type {{id: number, quantity: number}[]} */ items, /** @type {HTMLElement} */ source) {
  if (tools()?.addItemsToCart) {
    await tools().addItemsToCart(items, source);
    return true;
  }
  const r = await fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!r.ok) throw new Error((await r.json()).description || 'Could not add to the basket.');
  return true;
}

function kits() {
  for (const kit of document.querySelectorAll('[data-fo-kit]')) {
    const section = kit.closest('section');
    const status = section?.querySelector('[data-fo-kit-status]');
    const say = (/** @type {string} */ text) => {
      if (status) status.textContent = text;
    };
    /* Each part on sale arrives as a link to its product; here it becomes an Add button. */
    const buttons = [...kit.querySelectorAll('a[data-fo-add]')].map((a) => {
      const link = /** @type {HTMLAnchorElement} */ (a);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = link.className;
      b.textContent = 'Add';
      b.dataset.foAdd = link.dataset.foAdd;
      b.dataset.foQty = link.dataset.foQty;
      b.setAttribute('aria-label', `Add ${link.dataset.foName || 'this part'} to basket`);
      link.replaceWith(b);
      return b;
    });
    const item = (/** @type {HTMLButtonElement} */ b) => ({ id: Number(b.dataset.foAdd), quantity: Number(b.dataset.foQty) || 1 });

    for (const b of buttons) {
      b.addEventListener('click', async () => {
        const label = b.textContent;
        b.disabled = true;
        b.textContent = 'Adding…';
        try {
          await addToBasket([item(b)], b);
          b.textContent = 'Added';
          say('Added to your basket.');
        } catch (error) {
          b.textContent = label;
          say(error instanceof Error ? error.message : 'Could not add that to the basket.');
        }
        setTimeout(() => {
          b.textContent = label;
          b.disabled = false;
        }, 2200);
      });
    }

    const all = /** @type {HTMLButtonElement | null} */ (section?.querySelector('[data-fo-add-all]'));
    if (!all || buttons.length < 2) continue;
    all.hidden = false;
    const label = all.textContent;
    all.addEventListener('click', async () => {
      all.disabled = true;
      all.textContent = 'Adding the kit…';
      try {
        await addToBasket(buttons.map(item), all);
        all.textContent = 'Kit added';
        say(`${buttons.length} service parts added to your basket.`);
      } catch (error) {
        all.textContent = label;
        say(error instanceof Error ? error.message : 'Could not add the kit to the basket.');
      }
      setTimeout(() => {
        all.textContent = label;
        all.disabled = false;
      }, 2600);
    });
  }
}

function photos() {
  const shots = /** @type {HTMLAnchorElement[]} */ ([...document.querySelectorAll('[data-fo-shot]')]);
  if (!shots.length) return;
  /** @type {HTMLDialogElement | null} */
  let box = null;
  let at = 0;
  const show = (/** @type {number} */ i) => {
    at = (i + shots.length) % shots.length;
    const img = box?.querySelector('img');
    if (!img) return;
    img.src = shots[at].href;
    img.alt = shots[at].querySelector('img')?.alt || '';
  };
  const open = (/** @type {number} */ i) => {
    if (!box) {
      box = document.createElement('dialog');
      box.className = 'fpg-fo-box';
      box.setAttribute('aria-label', 'Photo');
      box.innerHTML =
        '<div class="fpg-fo-box__in"><img alt=""></div><button type="button" data-close aria-label="Close">×</button><button type="button" data-prev aria-label="Previous photo">‹</button><button type="button" data-next aria-label="Next photo">›</button>';
      document.body.append(box);
      box.addEventListener('click', (e) => {
        const t = /** @type {HTMLElement} */ (e.target);
        if (t.closest('[data-prev]')) return show(at - 1);
        if (t.closest('[data-next]')) return show(at + 1);
        if (t.closest('[data-close]') || !t.closest('img')) box?.close();
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') show(at - 1);
        if (e.key === 'ArrowRight') show(at + 1);
      });
      box.addEventListener('close', () => shots[at]?.focus());
    }
    show(i);
    box.showModal();
  };
  shots.forEach((a, i) =>
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      open(i);
    })
  );
}

function sent() {
  const note = /** @type {HTMLElement | null} */ (document.querySelector('[data-fo-sent]'));
  if (!note) return;
  note.scrollIntoView({ block: 'center' });
  note.focus({ preventScroll: true });
}

kits();
photos();
sent();
