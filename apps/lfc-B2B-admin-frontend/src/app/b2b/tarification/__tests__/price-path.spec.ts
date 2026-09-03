import type {
  ElasticityComparison,
  NegotiationRoom,
  PriceFloorView,
  PriceStepView,
  PricingItemView,
} from '@lfd/contracts';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { PricePath } from '../price-path/price-path';

import {
  floorRecoveryMillicents,
  gaugeWidth,
  pricePath,
  priceVerdict,
  signedEuros,
  stageTrail,
} from '../pricing-format';

/**
 * **Ce que l'écran ne savait pas dire.**
 *
 * `item.steps` était un tableau d'étapes résolues dont on n'affichait que la
 * longueur — « 3 étage(s) ». Ce fichier éprouve les trois faits que le moteur
 * calcule pour décider et qu'il jetait ensuite : quel étage a agi et à quelle
 * portée, lequel a été supplanté, et **combien la limite a repris** sur ce qui
 * avait été accordé. Le dernier est le plus cher, parce qu'il donne l'illusion
 * d'avoir consenti quelque chose.
 *
 * Les montants sont en millicentimes, comme partout dans le modèle : 140 000 =
 * 1,40 €. Les nombres du scénario principal sont ceux de la maquette, pour que
 * la comparaison reste possible à l'œil.
 */

function step(overrides: Partial<PriceStepView> = {}): PriceStepView {
  return {
    stage: 'promotion',
    ruleId: 'rule_promo',
    label: 'Citron vedette',
    scope: { type: 'product', id: 'TAR-CIT-T08' },
    resultMillicents: 123_000,
    supersedes: [],
    ...overrides,
  };
}

function floorView(): PriceFloorView {
  return {
    id: 'category:tartelettes',
    scope: { type: 'category', id: 'tartelettes' },
    mode: 'amount',
    value: 122_000,
    dynamic: null,
    drift: null,
    createdBy: 'staff',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function room(overrides: Partial<NegotiationRoom> = {}): NegotiationRoom {
  return { floorMillicents: 122_000, maxDiscountMillicents: 0, maxDiscountBp: 0, ...overrides };
}

function item(overrides: Partial<PricingItemView> = {}): PricingItemView {
  return {
    sku: 'TAR-CIT-T08',
    name: 'Tartelette citron 8 cm',
    canonicalMillicents: 140_000,
    ownFloor: null,
    effectiveFloor: null,
    rules: [],
    supersededRuleIds: [],
    sealedByRuleId: null,
    sealedRuleIds: [],
    steps: [],
    floored: false,
    clampedToZero: false,
    finalMillicents: 140_000,
    volumeTiers: [],
    elasticity: null,
    negotiationRoom: null,
    ...overrides,
  };
}

/**
 * Le scénario de la maquette : une promotion d'article évince une promotion de
 * famille, un geste catalogue passe derrière, et la limite reprend une partie de
 * ce geste.
 */
function absorbedGesture(): PricingItemView {
  return item({
    steps: [
      step({ supersedes: [{ ruleId: 'rule_famille', label: 'Tartelettes d’automne' }] }),
      step({
        stage: 'geste',
        ruleId: 'rule_geste',
        label: 'Arrondi commercial',
        scope: { type: 'global', id: null },
        resultMillicents: 118_000,
      }),
    ],
    effectiveFloor: floorView(),
    floored: true,
    finalMillicents: 122_000,
    negotiationRoom: room(),
  });
}

describe('le montant signé', () => {
  /**
   * Le signe est ÉCRIT, avec le − de la maison (U+2212) et non celui d'`Intl`.
   * L'espace devant l'euro, elle, VIENT d'`Intl` : c'est une insécable
   * (U+00A0), et l'écrire en espace ordinaire dans une attente ferait échouer un
   * test sur une différence qu'aucun diff ne montre.
   */
  it('écrit le signe, et le moins typographique', () => {
    expect(signedEuros(-17_000)).toBe('−0,17 €');
    expect(signedEuros(4_000)).toBe('+0,04 €');
  });

  it('ne met aucun signe sur zéro : il n’y a pas de sens à donner', () => {
    expect(signedEuros(0)).toBe('0,00 €');
  });
});

describe('ce que la limite a repris', () => {
  /**
   * **Le cas le plus coûteux du moteur.** Un geste de 0,05 € posé, 0,04 €
   * repris par la limite : la règle existe, elle n'a accordé qu'un centime, et
   * rien à l'écran ne le disait. Il faut `steps` ET `floored` réunis pour
   * l'établir — donc la trace, jamais la grille.
   */
  it('mesure ce que la limite a repris sur le bout de la chaîne', () => {
    expect(floorRecoveryMillicents(absorbedGesture())).toBe(4_000);
  });

  it('ne reprend rien quand la limite n’a pas mordu', () => {
    expect(floorRecoveryMillicents(item({ steps: [step()], finalMillicents: 123_000 }))).toBe(0);
  });

  /** Sans le moindre étage, la limite se mesure contre le tarif catalogue. */
  it('se mesure contre le canonique quand aucun étage n’a agi', () => {
    const raised = item({ floored: true, finalMillicents: 150_000 });

    expect(floorRecoveryMillicents(raised)).toBe(10_000);
  });
});

describe('le chemin du prix', () => {
  it('déplie le tarif d’entrée, chaque étage, la limite et le prix final', () => {
    const legs = pricePath(absorbedGesture());

    expect(legs.map((leg) => leg.kind)).toEqual(['canonical', 'stage', 'stage', 'floor', 'final']);
  });

  /**
   * L'effet est la DIFFÉRENCE réellement produite, pas ce que la règle
   * demandait. C'est elle qui reflète la composition — et c'est elle qui, mise
   * en regard du prix final, révèle ce que la limite a absorbé.
   */
  it('chiffre l’effet de chaque étage par différence, signe écrit', () => {
    const legs = pricePath(absorbedGesture());

    expect(legs[1]?.effect).toBe('−0,17 €');
    expect(legs[2]?.effect).toBe('−0,05 €');
  });

  it('écrit la portée de chaque étage, en toutes lettres', () => {
    const legs = pricePath(absorbedGesture());

    expect(legs[1]?.scopeLabel).toBe('portée article');
    expect(legs[2]?.scopeLabel).toBe('portée catalogue');
  });

  /**
   * `scope` est `null` sur une trace antérieure au 2026-09-03. La portée ne
   * s'invente pas : on n'affiche rien plutôt que d'en supposer une.
   */
  it('n’invente aucune portée sur une trace qui n’en porte pas', () => {
    const legs = pricePath(item({ steps: [step({ scope: null })], finalMillicents: 123_000 }));

    expect(legs[1]?.scopeLabel).toBeNull();
  });

  /** Le perdant apparaît dans la cellule du GAGNANT, barré. */
  it('rapproche la règle supplantée de celle qui l’a évincée', () => {
    const legs = pricePath(absorbedGesture());

    expect(legs[1]?.supersedes).toEqual(['Tartelettes d’automne supplantée']);
    expect(legs[2]?.supersedes).toEqual([]);
  });

  it('dit « absorbé par la limite » sur l’étage que la limite a mangé', () => {
    const legs = pricePath(absorbedGesture());

    expect(legs[2]?.notes.map((note) => note.text)).toContain('absorbé par la limite');
    expect(legs[1]?.notes.map((note) => note.text)).not.toContain('absorbé par la limite');
  });

  /**
   * **La limite n'est pas un étage.** Elle s'applique en fin de chaîne quelle
   * que soit sa place dans la lecture : pointillé, et la mention le redit —
   * un pointillé seul se lirait aussi bien « provisoire ».
   */
  it('dessine la limite en pointillé et l’écrit hors chaîne', () => {
    const floor = pricePath(absorbedGesture()).find((leg) => leg.kind === 'floor');

    expect(floor?.dashed).toBe(true);
    expect(floor?.stage).toBeNull();
    expect(floor?.notes.map((note) => note.text)).toContain('hors chaîne · s’applique après');
  });

  it('n’ajoute aucun tronçon de limite quand aucune n’est posée', () => {
    const legs = pricePath(item({ steps: [step()], finalMillicents: 123_000 }));

    expect(legs.some((leg) => leg.kind === 'floor')).toBe(false);
  });

  /**
   * Les hauteurs partent de ZÉRO. Un axe tronqué aurait fait passer 13 % d'écart
   * pour un effondrement — la cascade répond à « d'où vient ce prix », pas à
   * « regardez comme ça chute ».
   */
  it('mesure les barres depuis zéro, sur le plus haut prix de la chaîne', () => {
    const legs = pricePath(absorbedGesture());

    expect(legs[0]?.heightPercent).toBe(100);
    expect(legs[4]?.heightPercent).toBe(87.1);
  });

  /** Un article offert n'a aucune barre à dessiner, et surtout aucune division. */
  it('survit à un article entièrement offert', () => {
    const legs = pricePath(item({ canonicalMillicents: 0, finalMillicents: 0 }));

    expect(legs.every((leg) => leg.heightPercent === 0)).toBe(true);
  });

  it('dit « pas de référence » sous un prix final sans limite posée', () => {
    const legs = pricePath(item());

    expect(legs.at(-1)?.notes.map((note) => note.text)).toEqual(['pas de référence']);
  });

  it('signale en alerte un prix que la chaîne a ramené à zéro', () => {
    const legs = pricePath(item({ clampedToZero: true, finalMillicents: 0 }));
    const zeroed = legs.at(-1)?.notes.find((note) => note.text === 'ramené à zéro');

    expect(zeroed?.tone).toBe('alert');
  });
});

describe('la phrase de verdict', () => {
  /** Le livrable de la trace : elle répond avant tout graphique. */
  it('énonce les trois faits d’un coup, comme une phrase', () => {
    expect(priceVerdict(absorbedGesture())).toBe(
      'Deux étages ont agi, un a été supplanté, et la limite a repris 0,04 €.',
    );
  });

  it('dit qu’aucun étage n’a agi, et pourquoi le prix est celui-là', () => {
    expect(priceVerdict(item())).toBe('Aucun étage n’a agi. Le prix est le tarif catalogue.');
  });

  it('accorde le singulier sur un seul étage', () => {
    expect(priceVerdict(item({ steps: [step()], finalMillicents: 123_000 }))).toBe(
      'Un étage a agi.',
    );
  });

  /**
   * Une limite qui relève un tarif déjà sous elle, sans qu'aucune règle n'ait
   * agi : le moteur le produit, et la phrase doit rester lisible.
   */
  it('parle de la limite même quand aucun étage n’a agi', () => {
    const raised = item({
      floored: true,
      finalMillicents: 150_000,
      effectiveFloor: floorView(),
      negotiationRoom: room({ floorMillicents: 150_000 }),
    });

    expect(priceVerdict(raised)).toBe('Aucun étage n’a agi et la limite a repris 0,10 €.');
  });

  it('accorde le pluriel sur plusieurs règles supplantées', () => {
    const contested = item({
      steps: [
        step({
          supersedes: [
            { ruleId: 'a', label: 'Été prolongé' },
            { ruleId: 'b', label: 'Remise fidélité' },
          ],
        }),
      ],
      finalMillicents: 123_000,
    });

    expect(priceVerdict(contested)).toBe('Un étage a agi et deux ont été supplantés.');
  });
});

describe('les étages nommés plutôt que comptés', () => {
  it('nomme les étages qui ont agi, dans leur ordre', () => {
    expect(stageTrail(absorbedGesture())).toBe('promotion · geste');
  });

  it('ne dit rien quand aucun étage n’a agi', () => {
    expect(stageTrail(item())).toBeNull();
  });
});

describe('la jauge d’effort', () => {
  function comparison(attainmentBp: number | null): ElasticityComparison {
    const window = { from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T00:00:00.000Z', days: 30 };
    return {
      baseline: window,
      baselineVolume: 100,
      observed: window,
      observedVolume: 120,
      targetVolume: 125,
      attainmentBp,
      conclusive: true,
    };
  }

  it('donne une largeur proportionnelle à l’atteinte', () => {
    expect(gaugeWidth(comparison(7_800))).toBe('78%');
  });

  /** Au-delà de l'objectif, la barre sature — le chiffre, lui, dit « 112 % ». */
  it('sature la barre à cent pour cent sans écrêter le libellé', () => {
    expect(gaugeWidth(comparison(11_200))).toBe('100%');
  });

  /**
   * **Le cas qui compte.** Sans référence, une barre vide se lirait « 0 % de
   * l'objectif », ce qui est faux : la bonne réponse est de ne rien dessiner.
   */
  it('ne dessine aucune barre sans référence', () => {
    expect(gaugeWidth(comparison(null))).toBeNull();
  });
});

/**
 * **Le gabarit ne calcule rien** — il déroule les tronçons. Ces cas ne
 * revérifient donc pas l'arithmétique : ils vérifient que ce que `pricePath`
 * décide arrive bien jusqu'au DOM, y compris les deux choses qu'un modèle juste
 * peut encore perdre en chemin — la teinte d'étage, portée par un attribut, et
 * les mentions qui sont la copie du produit.
 */
describe('le panneau du chemin du prix', () => {
  function mount(view: PricingItemView): ComponentFixture<PricePath> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(PricePath);
    fixture.componentRef.setInput('item', view);
    fixture.detectChanges();
    return fixture;
  }

  const html = (fixture: ComponentFixture<PricePath>): string =>
    String(fixture.nativeElement.innerHTML ?? '');

  const text = (fixture: ComponentFixture<PricePath>): string =>
    String(fixture.nativeElement.textContent ?? '');

  it('écrit la phrase de verdict en clair', () => {
    expect(text(mount(absorbedGesture()))).toContain('Deux étages ont agi');
  });

  /**
   * La classe de nature est LIÉE et la colonne est statique : les deux doivent
   * cohabiter sur le même élément, sinon la mise en forme d'une cascade entière
   * disparaît sans qu'aucun test de modèle ne s'en aperçoive.
   */
  it('garde la classe de colonne en plus de la nature du tronçon', () => {
    const markup = html(mount(absorbedGesture()));

    expect(markup).toContain('class="column is-canonical"');
    expect(markup).toContain('class="column is-final"');
  });

  it('porte l’étage en attribut, pour que le liseré prenne sa teinte', () => {
    const markup = html(mount(absorbedGesture()));

    expect(markup).toContain('data-stage="promotion"');
    expect(markup).toContain('data-stage="geste"');
  });

  /** Les mentions sont la copie du produit : elles doivent arriver au DOM. */
  it('rend les mentions qui portent la décision', () => {
    const rendered = text(mount(absorbedGesture()));

    expect(rendered).toContain('portée article');
    expect(rendered).toContain('Tartelettes d’automne supplantée');
    expect(rendered).toContain('absorbé par la limite');
    expect(rendered).toContain('hors chaîne · s’applique après');
  });

  it('n’affiche aucune ligne de plancher quand aucune limite n’est posée', () => {
    expect(html(mount(item()))).not.toContain('floor-line');
  });
});
