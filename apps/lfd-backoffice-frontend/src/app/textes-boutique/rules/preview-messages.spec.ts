import { describe, expect, it } from 'vitest';

import { acceptPreviewMessage } from './preview-messages';

const ORIGIN = 'https://apercu.example';
const FRAME = { name: 'notre iframe' };
const source = 'lfc-shop-copy-preview';

describe('acceptPreviewMessage — la garde des messages de l’aperçu', () => {
  it('accepte un message du protocole, de la bonne origine et de notre iframe', () => {
    const event = {
      origin: ORIGIN,
      source: FRAME,
      data: { source, type: 'pick', key: 'cart.title' },
    };
    expect(acceptPreviewMessage(event, ORIGIN, FRAME)).toEqual({
      source,
      type: 'pick',
      key: 'cart.title',
    });
  });

  it('refuse une autre origine, même depuis notre iframe', () => {
    const event = {
      origin: 'https://ailleurs.example',
      source: FRAME,
      data: { source, type: 'ready' },
    };
    expect(acceptPreviewMessage(event, ORIGIN, FRAME)).toBeNull();
  });

  it('refuse la bonne origine venue d’une autre fenêtre', () => {
    const event = {
      origin: ORIGIN,
      source: { name: 'un autre onglet' },
      data: { source, type: 'ready' },
    };
    expect(acceptPreviewMessage(event, ORIGIN, FRAME)).toBeNull();
  });

  it('refuse tout tant que l’iframe n’est pas attachée', () => {
    const event = { origin: ORIGIN, source: null, data: { source, type: 'ready' } };
    expect(acceptPreviewMessage(event, ORIGIN, null)).toBeNull();
  });

  it('refuse tout quand l’aperçu n’est pas configuré', () => {
    const event = { origin: 'null', source: FRAME, data: { source, type: 'ready' } };
    expect(acceptPreviewMessage(event, null, FRAME)).toBeNull();
  });

  it('ignore un message d’une autre provenance ou mal formé', () => {
    const base = { origin: ORIGIN, source: FRAME };
    expect(
      acceptPreviewMessage({ ...base, data: { source: 'devtools', type: 'ready' } }, ORIGIN, FRAME),
    ).toBeNull();
    expect(
      acceptPreviewMessage({ ...base, data: { source, type: 'pick' } }, ORIGIN, FRAME),
    ).toBeNull();
    expect(
      acceptPreviewMessage(
        { ...base, data: { source, type: 'visible-keys', keys: [1] } },
        ORIGIN,
        FRAME,
      ),
    ).toBeNull();
    expect(
      acceptPreviewMessage({ ...base, data: { source, type: 'inconnu' } }, ORIGIN, FRAME),
    ).toBeNull();
  });

  it('rend les clés visibles', () => {
    const event = {
      origin: ORIGIN,
      source: FRAME,
      data: { source, type: 'visible-keys', keys: ['a', 'b'] },
    };
    expect(acceptPreviewMessage(event, ORIGIN, FRAME)).toEqual({
      source,
      type: 'visible-keys',
      keys: ['a', 'b'],
    });
  });
});
