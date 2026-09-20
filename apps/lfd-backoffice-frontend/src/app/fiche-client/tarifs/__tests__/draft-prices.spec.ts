import type { CompanyPricingView, PricingItemView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  draftFromView,
  eurosIn,
  millicentsIn,
  toLines,
  withEuros,
  withPrice,
  withoutPrice,
} from '../draft-prices';
import { openRoomMillicents } from '../negotiation-room';

/**
 * **La grille en cours de saisie**, éprouvée sur ce qui la ferait mentir : ce
 * qu'elle envoie au serveur, et ce qu'elle refuse d'envoyer.
 *
 * Un champ à moitié tapé n'est pas une décision. Un article vidé n'est pas un
 * article à zéro. Et pré-remplir avec le tarif catalogue ferait poser des règles
 * qui ne décident rien — les trois erreurs coûteraient un prix accordé par
 * accident.
 */

function item(overrides: Partial<PricingItemView> & { sku: string }): PricingItemView {
  return {
    name: overrides.sku,
    canonicalMillicents: 200_000,
    ownFloor: null,
    volumeTiers: null,
    effectiveFloor: null,
    rules: [],
    supersededRuleIds: [],
    sealedByRuleId: null,
    sealedRuleIds: [],
    steps: [],
    floored: false,
    clampedToZero: false,
    finalMillicents: 200_000,
    elasticity: null,
    negotiationRoom: null,
    ...overrides,
  };
}

function view(items: readonly PricingItemView[]): CompanyPricingView {
  return {
    companyId: 'co_1',
    at: new Date().toISOString(),
    categories: [{ id: 'viennoiserie', name: 'Viennoiseries', items }],
    mercuriales: [],
    negotiatedSkuCount: 0,
    averageGapBp: null,
  };
}

describe('ce qui part au serveur', () => {
  it('convertit les euros saisis en millicentimes', () => {
    const draft = withPrice(new Map(), 'CRO', '1,50');

    expect(toLines(draft)).toEqual([{ sku: 'CRO', unitPriceMillicents: 150_000 }]);
  });

  it('laisse tomber un champ à moitié tapé plutôt que de faire refuser la grille', () => {
    // « 1, » n'est pas une décision. L'envoyer ferait refuser la grille entière
    // pour une ligne que personne ne regardait.
    const draft = withPrice(withPrice(new Map(), 'CRO', '1,50'), 'PAC', ',');

    expect(toLines(draft)).toEqual([{ sku: 'CRO', unitPriceMillicents: 150_000 }]);
  });

  it('garde un prix à zéro — un article offert est réel', () => {
    expect(toLines(withPrice(new Map(), 'CRO', '0'))).toEqual([
      { sku: 'CRO', unitPriceMillicents: 0 },
    ]);
  });

  it('accepte les cinq décimales d’un prix négocié', () => {
    // « 2,13456 € HT » est une saisie normale sur un grand compte, pas un cas
    // limite : le prix unitaire vit en millicentimes.
    expect(millicentsIn(withPrice(new Map(), 'CRO', '2,13456'), 'CRO')).toBe(213_456);
  });
});

describe('vider un champ', () => {
  it('RETIRE l’article plutôt que d’y laisser une entrée illisible', () => {
    // « pas de prix » et « prix qu'on n'a pas fini de taper » ne doivent pas se
    // ressembler au moment de poser.
    const draft = withPrice(withPrice(new Map(), 'CRO', '1,50'), 'CRO', '   ');

    expect(draft.has('CRO')).toBe(false);
    expect(toLines(draft)).toEqual([]);
  });

  it('retire aussi par le bouton, sans toucher aux autres', () => {
    const draft = withPrice(withPrice(new Map(), 'CRO', '1,50'), 'PAC', '1,60');

    expect(toLines(withoutPrice(draft, 'CRO'))).toEqual([
      { sku: 'PAC', unitPriceMillicents: 160_000 },
    ]);
  });
});

describe('l’ouverture de la grille', () => {
  it('pré-remplit ce qui est SCELLÉ par une mercuriale', () => {
    const draft = draftFromView(
      view([item({ sku: 'CRO', sealedByRuleId: 'rule_1', finalMillicents: 150_000 })]),
    );

    expect(millicentsIn(draft, 'CRO')).toBe(150_000);
  });

  it('🔴 laisse VIDE un article au tarif catalogue', () => {
    // Pré-remplir tout le catalogue avec son propre tarif ferait poser
    // quatre-vingt-douze règles qui ne décident rien — et rendrait
    // indistinguable « je lui accorde le tarif public » de « je n'ai rien
    // accordé ».
    const draft = draftFromView(view([item({ sku: 'CRO' })]));

    expect(draft.has('CRO')).toBe(false);
    expect(toLines(draft)).toEqual([]);
  });

  it('n’écrit PAS le prix relevé par une limite comme s’il avait été négocié', () => {
    // Un article scellé dont la limite a relevé le prix s'ouvre sur le prix
    // FACTURÉ. C'est ce que le client paie, donc le bon point de départ d'une
    // renégociation — et le seul chiffre dont l'écran soit sûr.
    const draft = draftFromView(
      view([
        item({ sku: 'CRO', sealedByRuleId: 'rule_1', floored: true, finalMillicents: 120_000 }),
      ]),
    );

    expect(millicentsIn(draft, 'CRO')).toBe(120_000);
  });
});

describe('le pont entre le champ (euros) et le brouillon (millicentimes)', () => {
  it('rend au champ ce qu’on lui a donné, à la virgule près', () => {
    // Le champ parle euros, le brouillon millicentimes. Un aller-retour qui
    // dériverait ferait bouger un prix que personne n'a touché — sur un écran
    // où l'on relit ce qu'on a accordé, c'est le pire des défauts.
    for (const euros of [1.5, 2.1327, 0.98105, 19.99, 0, 2.13456]) {
      expect(eurosIn(withEuros(new Map(), 'CRO', euros), 'CRO')).toBe(euros);
    }
  });

  it('🔴 n’arrondit pas 19,99 € par la multiplication flottante', () => {
    // `19.99 * 100_000` vaut 1998999.9999999998 en binaire. La conversion passe
    // par une chaîne, jamais par ce produit.
    expect(toLines(withEuros(new Map(), 'CRO', 19.99))).toEqual([
      { sku: 'CRO', unitPriceMillicents: 1_999_000 },
    ]);
  });

  it('absorbe le bruit binaire d’un pas de 0,1 €', () => {
    // Un incrément répété donne « 1.7000000000000002 ». Borné à cinq décimales,
    // il redevient le prix que l'utilisateur croit avoir posé.
    expect(toLines(withEuros(new Map(), 'CRO', 1.7000000000000002))).toEqual([
      { sku: 'CRO', unitPriceMillicents: 170_000 },
    ]);
  });

  it('retire l’article quand le champ est vidé', () => {
    const draft = withEuros(withEuros(new Map(), 'CRO', 1.5), 'CRO', null);

    expect(draft.has('CRO')).toBe(false);
  });
});

describe('la marge disponible, avant toute décision', () => {
  it('rend le tarif catalogue moins la limite', () => {
    // La question qu'on se pose en ouvrant la fiche d'un client qu'on n'a pas
    // tarifé : jusqu'où puis-je descendre ? Un tiret n'y répondait pas.
    expect(openRoomMillicents(213_270, 120_000)).toBe(93_270);
  });

  it('rend `null` sans limite posée — pas un nombre', () => {
    // Un nombre annoncerait qu'on peut descendre jusqu'à zéro, ce que personne
    // n'a décidé.
    expect(openRoomMillicents(213_270, null)).toBeNull();
  });

  it('borne à zéro un tarif déjà sous sa propre limite', () => {
    // Sinon la colonne où l'on lit les remises afficherait une hausse déguisée
    // en remise négative.
    expect(openRoomMillicents(100_000, 120_000)).toBe(0);
  });
});
