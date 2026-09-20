import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type {
  OrderLineView,
  OrderLinePricingTrace,
  RejectedRuleView,
  UnexplainedRuleView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AdminOrdersService } from '../orders.service';
import { PriceExplain } from './price-explain';
import { frozenChainOf } from './frozen-chain';

/**
 * **« Pourquoi ce prix », sur une commande déjà partie.**
 *
 * Ces cas visent surtout une chose : les trois états de `rejected`. `null` (la
 * commande est antérieure à la colonne), `[]` (le moteur n'a écarté personne) et
 * une valeur se dessinent naturellement pareil — un écran vide —, et c'est
 * exactement ainsi qu'on détruirait la distinction que toute la colonne
 * construit, sans que personne ne s'en aperçoive (R25).
 */
const TRACE: OrderLinePricingTrace = {
  basePriceMillicents: 200_000,
  steps: [
    {
      stage: 'mercuriale',
      ruleId: 'merc',
      label: 'Mercuriale Dupont',
      scope: { type: 'global', id: null },
      resultMillicents: 180_000,
      supersedes: [],
    },
  ],
  floored: false,
  clampedToZero: false,
  floorDecision: null,
  commitment: null,
  rejected: [],
};

function line(pricing: OrderLinePricingTrace | null = TRACE): OrderLineView {
  return {
    sku: 'VIE-001',
    productName: 'Croissant',
    unitPriceMillicents: 180_000,
    vatRate: 5.5,
    quantity: 12,
    lineTotalCents: 2_160,
    pricing,
    allergens: null,
  };
}

function rejected(...entries: readonly RejectedRuleView[]): OrderLineView {
  return line({ ...TRACE, rejected: entries });
}

/**
 * Le doublé rend une liste vide par défaut : les cas de la trace FIGÉE ne
 * doivent rien devoir à la reconstruction, qui a les siens plus bas.
 */
function mount(
  view: OrderLineView,
  rules: readonly UnexplainedRuleView[] | Error = [],
): ComponentFixture<PriceExplain> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AdminOrdersService,
        useValue: {
          lineRules: (): Promise<{ at: string; rules: readonly UnexplainedRuleView[] }> =>
            rules instanceof Error
              ? Promise.reject(rules)
              : Promise.resolve({ at: '2026-03-10T09:00:00.000Z', rules }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PriceExplain);
  fixture.componentRef.setInput('line', view);
  fixture.componentRef.setInput('orderId', 'ord_1');
  fixture.detectChanges();
  return fixture;
}

/** Le rendu APRÈS la lecture asynchrone — sans quoi on n'observe que l'attente. */
async function mounted(
  view: OrderLineView,
  rules: readonly UnexplainedRuleView[] | Error = [],
): Promise<ComponentFixture<PriceExplain>> {
  const fixture = mount(view, rules);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<PriceExplain>): string =>
  String(fixture.nativeElement.textContent ?? '');

describe('frozenChainOf', () => {
  it("rend null sur une ligne sans trace, plutôt qu'une chaîne vide", () => {
    // Une chaîne vide affirmerait « aucun étage n'a joué » sur la seule commande
    // qu'on ne peut plus vérifier.
    expect(frozenChainOf(line(null))).toBeNull();
  });

  it("se dit FIGÉE, et n'invente aucune marge de négociation", () => {
    const chain = frozenChainOf(line());

    expect(chain?.origin).toBe('frozen');
    // La marge est une notion du jour : sur une commande close, il n'y a plus
    // rien à lâcher. Un nombre ici serait une invitation à négocier le passé.
    expect(chain?.room).toBeNull();
  });

  it('prend le prix FACTURÉ sur la ligne, pas au bout de la chaîne', () => {
    // Les deux coïncident presque toujours ; « presque » est le sujet. C'est la
    // ligne qui fait foi, et un écart doit se voir plutôt que se lisser.
    const chain = frozenChainOf({ ...line(), unitPriceMillicents: 177_000 });

    expect(chain?.finalMillicents).toBe(177_000);
  });
});

describe('le panneau « pourquoi ce prix »', () => {
  it('se tait quand la ligne ne porte aucune trace', () => {
    expect(text(mount(line(null)))).toContain('Pas de trace sur cette ligne');
  });

  it('dessine le chemin figé et le DIT', () => {
    expect(text(mount(line()))).toContain('figé à la commande');
  });

  /**
   * 🔴 Le cas qui garde le lot entier. `null` = la commande est antérieure au
   * jour où l'on a commencé à consigner les règles écartées ; l'afficher comme
   * « aucune règle écartée » serait une affirmation fabriquée.
   */
  it("avoue son ignorance sur une commande antérieure, au lieu d'affirmer", () => {
    const rendered = text(mount(line({ ...TRACE, rejected: null })));

    expect(rendered).toContain('On ne sait pas ce que le moteur avait regardé');
    expect(rendered).not.toContain('Aucune règle écartée');
  });

  it('affirme, quand le moteur a bien regardé sans rien écarter', () => {
    expect(text(mount(line()))).toContain('Aucune règle écartée');
  });

  it('nomme la règle écartée et sa raison', () => {
    const rendered = text(
      mount(
        rejected({
          stage: 'promotion',
          ruleId: 'promo',
          label: 'Promo de rentrée',
          scope: { type: 'global', id: null },
          cause: 'sealed',
        }),
      ),
    );

    expect(rendered).toContain('Promo de rentrée');
    expect(rendered).toContain('écartée par le tarif négocié');
  });

  it("parle du moment de la commande, pas d'aujourd'hui", () => {
    // Une règle expirée depuis a pu être en vigueur ce jour-là — et l'inverse.
    const rendered = text(
      mount(
        rejected({
          stage: 'promotion',
          ruleId: 'promo',
          label: "Promo d'été",
          scope: { type: 'global', id: null },
          cause: 'expired',
        }),
      ),
    );

    expect(rendered).toContain('à cette date');
  });
});

/**
 * **L'autre moitié** : ce qui n'a jamais atteint le moteur, donc ce que la trace
 * ne pouvait pas garder. Elle est RECONSTRUITE, et ces cas tiennent surtout ça.
 */
describe('les décisions reconstruites', () => {
  const rule = (over: Partial<UnexplainedRuleView> = {}): UnexplainedRuleView => ({
    ruleId: 'ciblee',
    label: 'Promo grands comptes',
    stage: 'promotion',
    scope: { type: 'global', id: null },
    cause: 'out_of_audience',
    ...over,
  });

  it("dit qu'elle est reconstruite, jamais figée", async () => {
    expect(text(await mounted(line(), [rule()]))).toContain('reconstruit');
  });

  it("nomme la règle et pourquoi elle n'a pas joué", async () => {
    const rendered = text(await mounted(line(), [rule()]));

    expect(rendered).toContain('Promo grands comptes');
    expect(rendered).toContain('ne visait pas ce client');
  });

  it("avertit que les libellés sont ceux d'aujourd'hui", async () => {
    // Une règle se renomme : le nom affiché n'est pas forcément celui qui a
    // facturé, et c'est le genre de détail qui décide d'un litige.
    expect(text(await mounted(line(), [rule()]))).toContain("ceux d'aujourd'hui");
  });

  /**
   * 🔴 Une absence de raison n'est pas une raison. Le cas « ouverte à tous et
   * pourtant sans effet » doit ressortir, pas se ranger sous une phrase
   * rassurante.
   */
  it("montre qu'il n'a pas de raison plutôt que d'en inventer une", async () => {
    expect(text(await mounted(line(), [rule({ cause: null })]))).toContain('à regarder');
  });

  it("affirme le vide quand rien d'autre n'était en vigueur", async () => {
    expect(text(await mounted(line(), []))).toContain('Aucune autre décision');
  });

  /**
   * 🔴 Une panne de lecture n'affirme RIEN. Retomber sur une liste vide dirait
   * « rien d'autre n'était en vigueur » — une phrase qu'on aurait fabriquée.
   */
  it("n'affirme rien quand la relecture échoue", async () => {
    const rendered = text(await mounted(line(), new Error('réseau')));

    expect(rendered).toContain('Impossible de relire');
    expect(rendered).not.toContain('Aucune autre décision');
  });
});
