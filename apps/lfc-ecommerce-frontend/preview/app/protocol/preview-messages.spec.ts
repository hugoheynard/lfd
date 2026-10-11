import { SHOP_COPY_PREVIEW_SOURCE } from '@lfd/contracts/shop-copy-preview';

import { outbound, readShowMessage } from './preview-messages';

const EDITOR = 'https://lfd-backoffice.com';
const ALLOWED = [EDITOR, 'https://lfd-backoffice.pages.dev'];
const parent = { name: 'la fenêtre du back-office' };

function show(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: SHOP_COPY_PREVIEW_SOURCE,
    type: 'show',
    audience: 'visitor',
    step: 'welcome',
    locale: 'fr',
    viewport: 'mobile',
    drafts: { 'cart.whoTitle': 'Qui commande ?' },
    published: {},
    highlight: 'cart.whoTitle',
    ...overrides,
  };
}

describe('la garde des messages de l’aperçu', () => {
  it('accepte un `show` complet, venu du back-office, émis par la fenêtre parente', () => {
    const message = readShowMessage(
      { origin: EDITOR, source: parent, data: show() },
      ALLOWED,
      parent,
    );

    expect(message).toEqual(show());
  });

  it('refuse une origine hors de la liste — même un sous-domaine', () => {
    for (const origin of [
      'https://evil.example',
      'https://x.lfd-backoffice.com',
      'http://lfd-backoffice.com',
    ]) {
      expect(readShowMessage({ origin, source: parent, data: show() }, ALLOWED, parent)).toBeNull();
    }
  });

  it("refuse un émetteur qui n'est pas la fenêtre parente, même de la bonne origine", () => {
    expect(
      readShowMessage({ origin: EDITOR, source: {}, data: show() }, ALLOWED, parent),
    ).toBeNull();
    expect(
      readShowMessage({ origin: EDITOR, source: null, data: show() }, ALLOWED, null),
    ).toBeNull();
  });

  it('refuse un message d’un autre protocole ou d’un autre type', () => {
    for (const data of [show({ source: 'autre' }), show({ type: 'ready' }), 'show', null]) {
      expect(readShowMessage({ origin: EDITOR, source: parent, data }, ALLOWED, parent)).toBeNull();
    }
  });

  it('refuse un champ mal formé, sans rien en garder', () => {
    const malformed = [
      show({ step: 'inconnu' }),
      show({ audience: 'inconnu' }),
      // Une étape que la clientèle n'a pas : un visiteur n'a pas de fidélité.
      show({ step: 'loyalty' }),
      show({ locale: 'de' }),
      show({ viewport: 'tablet' }),
      show({ drafts: { 'cart.whoTitle': 3 } }),
      show({ published: ['texte'] }),
      show({ highlight: 4 }),
    ];
    for (const data of malformed) {
      expect(readShowMessage({ origin: EDITOR, source: parent, data }, ALLOWED, parent)).toBeNull();
    }
  });

  it('estampille chaque message sortant de la source du protocole', () => {
    expect(outbound({ type: 'pick', key: 'cart.whoTitle' })).toEqual({
      source: SHOP_COPY_PREVIEW_SOURCE,
      type: 'pick',
      key: 'cart.whoTitle',
    });
  });
});
