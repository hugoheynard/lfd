import type { ShopItemView, StaffSuggestionPreviewStatus } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { staffSuggestion } from '../staff-suggestion.testing';
import {
  dayAndMonth,
  defaultCardTitle,
  previewPayload,
  previewPrice,
  previewReason,
  previewSetupOf,
  type ReasonContext,
} from '../suggestion-preview';

const CHOICES = {
  articles: [
    { sku: 'VIE-001', name: 'Croissant', familyId: 'fam-vien' },
    { sku: 'PAI-001', name: 'Baguette', familyId: 'fam-pains' },
    { sku: 'BOI-001', name: 'Café', familyId: 'fam-boissons' },
  ],
  families: [{ id: 'fam-vien', name: 'Viennoiseries' }],
  sites: [],
};

const RULE = staffSuggestion({ endsOn: '2026-10-18', startsOn: '2026-10-12' });
const WINNER = staffSuggestion({ id: '01JWIN', phrase: { fr: 'La galette' } });
const CTX: ReasonContext = {
  choices: CHOICES,
  rules: new Map([
    [RULE.id, RULE],
    [WINNER.id, WINNER],
  ]),
  order: 'priority',
};

const say = (
  status: StaffSuggestionPreviewStatus,
  outrankedBy: string | null = null,
  sku?: string,
) => previewReason(RULE, { status, outrankedBy }, CTX, sku);

describe('previewReason', () => {
  it('dit chaque raison en français clair', () => {
    expect(say('shown')).toBe('Affichée');
    expect(say('ended')).toBe('Finie le 18 octobre');
    expect(say('not_started')).toBe('Commence le 12 octobre');
    expect(say('inactive')).toBe('Coupée');
    expect(say('wrong_audience')).toBe('Pas pour cette clientèle');
    expect(say('wrong_placement')).toBe('Pas à cet emplacement');
    expect(say('trigger_false')).toBe('« Croissant » n’est pas dans le panier');
    expect(say('item_not_served')).toBe('« Baguette » n’est pas en vente pour cette clientèle');
    expect(say('item_not_orderable_that_day', null, 'BOI-001')).toBe(
      '« Café » n’est pas commandable ce jour-là',
    );
    expect(say('item_in_cart')).toBe('« Baguette » est déjà dans le panier');
    expect(say('item_is_the_product')).toBe('« Baguette » est l’article de la fiche');
    expect(say('outranked_by', '01JWIN')).toBe('Battue par « La galette » (priorité)');
    expect(say('outranked_by', RULE.id)).toContain('Pas de place');
  });

  it('nomme le déclencheur d’une famille et d’une fiche', () => {
    const family = staffSuggestion({ trigger: { kind: 'category_in_cart', ref: 'fam-vien' } });
    const sheet = staffSuggestion({
      trigger: { kind: 'product_viewed', ref: 'PAI-001' },
      placement: 'product',
    });
    const verdict = { status: 'trigger_false', outrankedBy: null } as const;

    expect(previewReason(family, verdict, CTX)).toBe(
      'Aucun article de la famille « Viennoiseries » dans le panier',
    );
    expect(previewReason(sheet, verdict, CTX)).toBe('Ce n’est pas la fiche de « Baguette »');
  });
});

describe('previewSetupOf', () => {
  const TODAY = '2026-10-15';

  it('met au panier l’article qui déclenche, à la clientèle et au jour de la règle', () => {
    expect(
      previewSetupOf(staffSuggestion({ audience: 'pro', startsOn: '2026-10-20' }), CHOICES, TODAY),
    ).toEqual({
      placement: 'cart',
      cart: ['VIE-001'],
      viewedSku: null,
      audience: 'pro',
      day: '2026-10-20',
      time: '',
      cartTotal: '',
      siteId: null,
    });
  });

  it('une famille : un de ses articles ; une fiche « partout » : un article qu’elle ne suggère pas ; l’accueil : un panier vide', () => {
    const family = staffSuggestion({ trigger: { kind: 'category_in_cart', ref: 'fam-vien' } });
    const everywhere = staffSuggestion({
      trigger: { kind: 'everywhere', ref: null },
      placement: 'product',
      suggestedSkus: ['VIE-001'],
    });

    expect(previewSetupOf(family, CHOICES, TODAY).cart).toEqual(['VIE-001']);
    expect(previewSetupOf(everywhere, CHOICES, TODAY).viewedSku).toBe('PAI-001');
    expect(
      previewSetupOf(
        staffSuggestion({
          placement: 'home',
          trigger: { kind: 'everywhere', ref: null },
          startsOn: '2026-10-20',
        }),
        CHOICES,
        TODAY,
      ),
    ).toEqual({
      placement: 'home',
      cart: [],
      viewedSku: null,
      audience: 'public',
      day: '2026-10-20',
      time: '',
      cartTotal: '',
      siteId: null,
    });
  });
});

describe('la carte', () => {
  const item: ShopItemView = {
    sku: 'BOI-001',
    name: 'Café',
    note: null,
    image: null,
    thumbnail: null,
    unitPriceMillicents: 123_456,
    unitPriceTtcCents: 130,
    vatRatePercent: 5.5,
    shelfId: 'fam-boissons',
    isFeatured: false,
  };

  it('écrit le prix HT au pro, arrondi au centime, et TTC au particulier', () => {
    expect(previewPrice(item, 'pro').replace(/\s/gu, ' ')).toBe('1,23 € HT');
    expect(previewPrice(item, 'public').replace(/\s/gu, ' ')).toBe('1,30 € TTC');
  });

  it('prend le titre de l’emplacement sans phrase, et ne demande rien sans article de fiche', () => {
    expect(defaultCardTitle('cart')).toBe('Notre conseil');
    expect(defaultCardTitle('product')).toBe('Vous aimerez aussi');
    expect(defaultCardTitle('home')).toBe('Notre sélection');
    expect(dayAndMonth('2026-01-05')).toBe('5 janvier');
    const setup = {
      cart: [],
      audience: 'public',
      day: '2026-10-18',
      time: '',
      cartTotal: '',
      siteId: null,
    } as const;
    expect(previewPayload({ ...setup, placement: 'product', viewedSku: null })).toBeNull();
    expect(previewPayload({ ...setup, placement: 'home', viewedSku: null })?.placement).toBe(
      'home',
    );
    expect(previewPayload({ ...setup, placement: 'cart', viewedSku: null })).toEqual({
      placement: 'cart',
      skus: [],
      audience: 'public',
      day: '2026-10-18',
      pickupAddressId: null,
    });
  });
});

describe('les conditions dans l’aperçu (RS8)', () => {
  const conditioned = staffSuggestion({
    startsOn: '2026-10-17',
    endsOn: '2026-10-31',
    conditions: {
      weekdays: ['mon', 'tue'],
      hours: { from: '07:00', to: '11:00' },
      minCartTotalCents: 2_000,
      cartWithoutFamilyId: 'fam-vien',
      pickupAddressIds: ['site-centre'],
    },
  });
  const ctx: ReasonContext = {
    ...CTX,
    choices: { ...CHOICES, sites: [{ id: 'site-centre', label: 'Centre' }] },
  };
  const reason = (status: StaffSuggestionPreviewStatus) =>
    previewReason(conditioned, { status, outrankedBy: null }, ctx);

  it('dit chaque condition non tenue avec ce qu’elle demande', () => {
    expect(reason('outside_weekdays')).toBe('Pas ce jour-là : elle vaut le lundi et le mardi');
    expect(reason('outside_hours')).toBe('Pas à cette heure : elle vaut de 7 h à 11 h');
    expect(reason('no_site_yet')).toContain('Aucun point de retrait choisi');
    expect(reason('wrong_site')).toBe(
      'Pas pour ce point de retrait : elle vaut en retrait à Centre',
    );
    expect(reason('cart_below_threshold')).toContain('n’atteint pas 20 €');
    expect(reason('cart_has_family')).toBe(
      'Le panier contient un article de la famille « Viennoiseries »',
    );
  });

  it('ouverte depuis la règle : un jour choisi, le début de la plage, le seuil, le premier point', () => {
    // Le 2026-10-17 est un samedi : le premier jour choisi qui suit est le lundi 19.
    expect(previewSetupOf(conditioned, CHOICES, '2026-10-15')).toMatchObject({
      day: '2026-10-19',
      time: '07:00',
      cartTotal: '20,00',
      siteId: 'site-centre',
    });
  });

  it('envoie l’heure, le total en centimes et le point quand ils sont donnés', () => {
    expect(
      previewPayload({
        placement: 'cart',
        cart: [],
        viewedSku: null,
        audience: 'public',
        day: '2026-10-19',
        time: '07:30',
        cartTotal: '20',
        siteId: 'site-centre',
      }),
    ).toEqual({
      placement: 'cart',
      skus: [],
      audience: 'public',
      day: '2026-10-19',
      pickupAddressId: 'site-centre',
      time: '07:30',
      cartTotalCents: 2_000,
    });
  });
});
