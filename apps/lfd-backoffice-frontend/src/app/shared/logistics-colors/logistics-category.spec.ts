import type { SitePaletteEntryView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { inkOn, logisticsCategoryOf, transferColorOf } from './logistics-category';

const NO_COLORS = {
  pickupColorB2b: null,
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
  resupplyColor: null,
  transferColor: null,
} as const;

const FOURNIL: SitePaletteEntryView = {
  id: 'fournil',
  label: 'Fournil',
  supply: 'on_site',
  isDeparture: true,
  ...NO_COLORS,
  deliveryColorB2b: '#1e88e5',
  pickupColorB2b: '#fdd835',
};
const ADROIT: SitePaletteEntryView = {
  id: 'adroit',
  label: 'Adroit',
  supply: 'on_site',
  isDeparture: false,
  ...NO_COLORS,
  pickupColorB2b: '#fdd835',
  pickupColorB2c: '#fb8c00',
};
const VILLAGE: SitePaletteEntryView = {
  id: 'vv',
  label: 'Val Village',
  supply: 'transfer',
  isDeparture: false,
  ...NO_COLORS,
  pickupColorB2c: '#9e9e9e',
};
const PALETTE = [FOURNIL, ADROIT, VILLAGE];

describe('logisticsCategoryOf — la catégorie et la couleur d’une commande (§4)', () => {
  it('une livraison prend la couleur de livraison du site de DÉPART, par clientèle', () => {
    expect(
      logisticsCategoryOf({ fulfillmentMethod: 'delivery', clientele: 'pro' }, PALETTE),
    ).toEqual({ key: 'delivery:pro', label: 'Livraison pro', color: '#1e88e5' });
    expect(
      logisticsCategoryOf({ fulfillmentMethod: 'delivery', clientele: 'public' }, PALETTE),
    ).toEqual({ key: 'delivery:public', label: 'Livraison particulier', color: null });
  });

  it('un retrait prend la couleur de retrait de SON site', () => {
    expect(
      logisticsCategoryOf(
        { fulfillmentMethod: 'pickup', clientele: 'public', siteId: 'adroit' },
        PALETTE,
      ),
    ).toEqual({
      key: 'pickup:adroit:public',
      label: 'Retrait particulier Adroit',
      color: '#fb8c00',
    });
  });

  it('un site servi par transfert se titre « Transfert … »', () => {
    expect(
      logisticsCategoryOf(
        { fulfillmentMethod: 'pickup', clientele: 'public', siteId: 'vv' },
        PALETTE,
      ),
    ).toMatchObject({ label: 'Transfert Val Village · particulier', color: '#9e9e9e' });
  });

  it('dans l’encadré du transfert (`as-pickup`), il se dit « Retrait … » comme tout retrait', () => {
    expect(
      logisticsCategoryOf(
        { fulfillmentMethod: 'pickup', clientele: 'public', siteId: 'vv' },
        PALETTE,
        'as-pickup',
      ),
    ).toMatchObject({ label: 'Retrait particulier Val Village', color: '#9e9e9e' });
  });

  it('l’encadré du transfert : sa couleur posée, sinon la livraison du départ, sinon neutre', () => {
    expect(transferColorOf({ ...VILLAGE, transferColor: '#7c3aed' }, PALETTE)).toBe('#7c3aed');
    expect(transferColorOf(VILLAGE, PALETTE)).toBe('#1e88e5');
    expect(transferColorOf(VILLAGE, [ADROIT, VILLAGE])).toBeNull();
  });

  it('🔴 neutre, jamais inventée : clientèle inconnue, retrait sans site, site inconnu', () => {
    expect(
      logisticsCategoryOf({ fulfillmentMethod: 'delivery', clientele: null }, PALETTE).color,
    ).toBeNull();
    expect(
      logisticsCategoryOf({ fulfillmentMethod: 'pickup', clientele: 'pro', siteId: null }, PALETTE),
    ).toEqual({ key: 'pickup', label: 'Retrait', color: null });
    expect(
      logisticsCategoryOf({ fulfillmentMethod: 'pickup', clientele: 'pro', siteId: 'x' }, PALETTE)
        .color,
    ).toBeNull();
    expect(logisticsCategoryOf({ fulfillmentMethod: 'pickup', siteId: 'adroit' }, PALETTE)).toEqual(
      { key: 'pickup:adroit', label: 'Retrait Adroit', color: null },
    );
  });

  it('palette vide (illisible) : toute commande est neutre', () => {
    expect(
      logisticsCategoryOf({ fulfillmentMethod: 'delivery', clientele: 'pro' }, []).color,
    ).toBeNull();
  });

  it('lit la palette passée : une couleur changée se voit au prochain calcul', () => {
    const repainted = [{ ...FOURNIL, deliveryColorB2b: '#000080' }];
    expect(
      logisticsCategoryOf({ fulfillmentMethod: 'delivery', clientele: 'pro' }, repainted).color,
    ).toBe('#000080');
  });
});

describe('inkOn — l’encre lisible sur une couleur libre', () => {
  it('encre sombre sur une teinte claire (un jaune), claire sur une sombre (un bleu nuit)', () => {
    expect(inkOn('#fdd835')).toBe('dark');
    expect(inkOn('#ffffff')).toBe('dark');
    expect(inkOn('#000080')).toBe('light');
    expect(inkOn('#000000')).toBe('light');
  });

  it('une forme illisible prend l’encre sombre de la teinte neutre', () => {
    expect(inkOn('bleu')).toBe('dark');
  });
});
