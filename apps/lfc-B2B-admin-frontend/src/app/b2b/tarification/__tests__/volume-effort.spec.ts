import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { ElasticityComparison, ItemElasticityView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { VolumeEffort } from '../volume-effort/volume-effort';

/**
 * **Ce que l'altération oblige à vendre.**
 *
 * Deux comparaisons qui ne répondent pas à la même question — « la règle
 * tient-elle ? » et « où en est-on ? » — et un cas où la seule réponse honnête
 * est « trop tôt ».
 */

function window(days: number): ElasticityComparison['observed'] {
  return { from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T00:00:00.000Z', days };
}

function comparison(over: Partial<ElasticityComparison> = {}): ElasticityComparison {
  return {
    baseline: window(30),
    baselineVolume: 100,
    observed: window(30),
    observedVolume: 120,
    targetVolume: 125,
    attainmentBp: 9_600,
    conclusive: true,
    ...over,
  };
}

function elasticity(over: Partial<ItemElasticityView> = {}): ItemElasticityView {
  return {
    fromMillicents: 200,
    toMillicents: 160,
    isoRevenueRatioBp: 12_500,
    sinceChange: comparison(),
    rolling: comparison(),
    ...over,
  };
}

function mount(view: ItemElasticityView | null): ComponentFixture<VolumeEffort> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(VolumeEffort);
  fixture.componentRef.setInput('elasticity', view);
  fixture.detectChanges();
  return fixture;
}

const textOf = (fixture: ComponentFixture<VolumeEffort>): string =>
  String(fixture.nativeElement.textContent ?? '');

describe("l'effort de volume", () => {
  it('annonce le volume qu’il faut vendre pour le même chiffre', () => {
    expect(textOf(mount(elasticity()))).toContain('×1,25 pour le même chiffre');
  });

  /** Un article offert n'atteint le chiffre à aucun volume : le dire vaut mieux que « ×∞ ». */
  it('le dit quand aucun volume ne compense', () => {
    expect(textOf(mount(elasticity({ isoRevenueRatioBp: null })))).toContain('offert');
  });

  it('montre les deux comparaisons, avec leurs volumes', () => {
    const text = textOf(mount(elasticity()));

    expect(text).toContain('depuis la règle');
    expect(text).toContain('30 derniers jours');
    expect(text).toContain('120 vendus / 125 visés');
  });

  /**
   * Quelques jours après la pose, l'écart n'a aucun sens. L'afficher comme un
   * résultat ferait juger une décision sur du bruit.
   */
  it('dit « trop tôt » plutôt qu’un pourcentage sur une fenêtre trop courte', () => {
    const early = elasticity({
      sinceChange: comparison({ conclusive: false, observed: window(4) }),
    });

    expect(textOf(mount(early))).toContain('trop tôt (4 j)');
  });

  it("le dit aussi quand il n'y a pas de référence pour juger", () => {
    const blind = elasticity({ rolling: comparison({ attainmentBp: null }) });

    expect(textOf(mount(blind))).toContain('pas de référence');
  });

  /** Prix inchangé : il n'y a rien à compenser, et rien à afficher non plus. */
  it("se contente de « prix inchangé » quand rien n'a bougé", () => {
    expect(textOf(mount(null))).toContain('prix inchangé');
  });
});
