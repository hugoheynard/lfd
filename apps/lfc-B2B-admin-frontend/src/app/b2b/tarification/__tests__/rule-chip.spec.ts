import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { PriceRuleView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { RuleChip } from '../rule-chip/rule-chip';

/**
 * **La règle telle qu'elle se voit sur son nœud.**
 *
 * Deux marques à ne jamais confondre : **supplantée** (une règle plus précise
 * gagne son étage) et **en pause** (quelqu'un l'a arrêtée). Les mélanger
 * laisserait croire qu'une remise s'ajoute à une autre, ou qu'une promo tourne
 * encore. Et l'étage doit rester lisible **en mots**, pas seulement en couleur.
 */

function rule(overrides: Partial<PriceRuleView> = {}): PriceRuleView {
  return {
    id: 'rule_1',
    stage: 'promotion',
    scope: { type: 'category', id: 'viennoiserie' },
    audience: { type: 'all', id: null },
    minQuantity: null,
    effect: { nature: 'alter', direction: 'decrease', mode: 'percent', value: 1000 },
    label: 'Promo de rentrée',
    validFrom: '2026-08-01T00:00:00.000Z',
    validTo: null,
    createdBy: 'staff',
    stacksOverMercuriale: false,
    createdAt: '2026-07-20T00:00:00.000Z',
    status: 'active',
    pausedAt: null,
    pausedBy: null,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    ...overrides,
  };
}

function mount(view: PriceRuleView, superseded = false): ComponentFixture<RuleChip> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(RuleChip);
  fixture.componentRef.setInput('rule', view);
  fixture.componentRef.setInput('superseded', superseded);
  fixture.detectChanges();
  return fixture;
}

const textOf = (fixture: ComponentFixture<RuleChip>): string =>
  String(fixture.nativeElement.textContent ?? '');

const classesOf = (fixture: ComponentFixture<RuleChip>): string =>
  String(fixture.nativeElement.getAttribute('class') ?? '');

describe('la règle sur son nœud', () => {
  it("nomme l'étage et ce qu'il fait", () => {
    expect(textOf(mount(rule()))).toContain('Promotion −10 %');
  });

  it('dit le palier quand la règle en porte un', () => {
    expect(textOf(mount(rule({ stage: 'volume', minQuantity: 100 })))).toContain('dès 100');
  });

  it('dit un prix posé comme un prix, pas comme une remise', () => {
    const posed = rule({ effect: { nature: 'replace', amountMillicents: 180_000 } });

    // `formatEuros` sépare le montant de l'unité par une espace INSÉCABLE :
    // l'assertion porte sur le nombre, pas sur la façon dont l'espace est codée.
    expect(textOf(mount(posed))).toContain('à 1,80');
  });

  /**
   * La teinte de l'étage **double** un mot déjà présent dans le résumé. La
   * couleur n'est donc jamais seule à porter l'information — elle la renforce.
   */
  it("porte l'étage comme classe, en plus du mot", () => {
    expect(classesOf(mount(rule()))).toContain('is-stage-promotion');
    expect(classesOf(mount(rule({ stage: 'geste' })))).toContain('is-stage-geste');
  });

  it('annonce « en pause » quand elle est suspendue', () => {
    const paused = mount(rule({ status: 'paused' }));

    expect(textOf(paused)).toContain('en pause');
    expect(classesOf(paused)).toContain('is-paused');
  });

  it('annonce « supplantée » — un fait sans rapport avec la pause', () => {
    const superseded = mount(rule(), true);

    expect(textOf(superseded)).toContain('supplantée');
    expect(classesOf(superseded)).not.toContain('is-paused');
  });

  /** Le bouton propose l'INVERSE de l'état courant, jamais son nom. */
  it('propose de suspendre ce qui tourne, de reprendre ce qui est arrêté', () => {
    expect(mount(rule()).nativeElement.innerHTML).toContain('Suspendre Promo de rentrée');
    expect(mount(rule({ status: 'paused' })).nativeElement.innerHTML).toContain(
      'Reprendre Promo de rentrée',
    );
  });
});
