import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { PriceOverlapView, PriceRuleView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OverlapTimeline } from '../overlap-timeline/overlap-timeline';
import {
  barOf,
  composedLabel,
  periodLabel,
  timelineWindow,
} from '../overlap-timeline/timeline-model';

/**
 * **La frise des chevauchements.**
 *
 * Deux choses à garantir : la géométrie ne ment pas (une barre reste dans
 * l'axe, une fin ouverte a une largeur), et l'écran ne confond pas un CUMUL
 * avec une ÉVICTION — deux règles du même étage ne s'ajoutent pas, la plus
 * précise gagne.
 */

const iso = (day: string): string => `2026-08-${day}T00:00:00.000Z`;

function rule(id: string, from: string, to: string | null): PriceRuleView {
  return {
    id,
    stage: 'promotion',
    scope: { type: 'global', id: null },
    audience: { type: 'all', id: null },
    minQuantity: null,
    effect: { nature: 'alter', direction: 'decrease', mode: 'percent', value: 1_000 },
    label: `Promo ${id}`,
    validFrom: iso(from),
    validTo: to === null ? null : iso(to),
    createdBy: 'staff',
    createdAt: iso('01'),
    status: 'active',
    pausedAt: null,
    pausedBy: null,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
  };
}

function overlap(over: Partial<PriceOverlapView> = {}): PriceOverlapView {
  return {
    from: iso('15'),
    to: iso('20'),
    ruleIds: ['a', 'b'],
    kind: 'compose',
    composedBp: 2_800,
    ...over,
  };
}

function mount(
  rules: readonly PriceRuleView[],
  overlaps: readonly PriceOverlapView[],
): ComponentFixture<OverlapTimeline> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(OverlapTimeline);
  fixture.componentRef.setInput('rules', rules);
  fixture.componentRef.setInput('overlaps', overlaps);
  fixture.detectChanges();
  return fixture;
}

const textOf = (fixture: ComponentFixture<OverlapTimeline>): string =>
  String(fixture.nativeElement.textContent ?? '');

describe("l'échelle de la frise", () => {
  it("n'a pas d'échelle sans règle", () => {
    expect(timelineWindow([])).toBeNull();
  });

  /** Diviser par zéro donnerait des barres de largeur infinie. */
  it("n'a pas d'échelle quand tout tient sur le même instant", () => {
    expect(timelineWindow([rule('a', '01', '01')])).toBeNull();
  });

  /** Une fin ouverte n'a pas de borne : sans horizon, sa barre n'aurait pas de largeur. */
  it('donne un horizon à une fin ouverte', () => {
    const window = timelineWindow([rule('a', '01', null)]);

    expect(window).not.toBeNull();
    expect(window?.to).toBeGreaterThan(window?.from ?? 0);
  });

  it('place une barre proportionnellement à sa période', () => {
    const window = { from: Date.parse(iso('01')), to: Date.parse(iso('11')) };

    const bar = barOf(window, iso('06'), iso('11'));

    expect(Math.round(bar.leftPercent)).toBe(50);
    expect(Math.round(bar.widthPercent)).toBe(50);
  });

  /** Une barre qui déborderait de l'axe se lirait comme une erreur d'affichage. */
  it('borne une barre qui sortirait de la fenêtre', () => {
    const window = { from: Date.parse(iso('10')), to: Date.parse(iso('20')) };

    const bar = barOf(window, iso('01'), iso('30'));

    expect(bar.leftPercent).toBe(0);
    expect(bar.widthPercent).toBe(100);
  });

  /** Une période d'un jour doit rester visible, sinon elle disparaît de l'écran. */
  it('garde une largeur minimale à une période très courte', () => {
    const window = { from: Date.parse(iso('01')), to: Date.parse(iso('31')) };

    expect(barOf(window, iso('10'), iso('11')).widthPercent).toBeGreaterThanOrEqual(1.5);
  });
});

describe('ce que la frise annonce', () => {
  it('dit le cumul en clair', () => {
    expect(composedLabel(overlap())).toBe('−28,0 %');
  });

  /** Un montant ne se cumule pas en fraction sans connaître l'article. */
  it("ne dit rien quand le cumul ne s'exprime pas en pourcentage", () => {
    expect(composedLabel(overlap({ composedBp: null }))).toBeNull();
  });

  it('dit la période, et laisse une fin ouverte ouverte', () => {
    expect(periodLabel(overlap())).toContain('du 15');
    expect(periodLabel(overlap({ to: null }))).toContain('à partir du');
  });
});

describe("la frise à l'écran", () => {
  /** Pas de chevauchement, pas de frise : elle ne doit pas peser quand tout va bien. */
  it("ne s'affiche pas sans chevauchement", () => {
    expect(textOf(mount([rule('a', '01', '10')], []))).toBe('');
  });

  it('pose une ligne par règle et annonce le cumul', () => {
    const text = textOf(mount([rule('a', '01', '20'), rule('b', '15', '30')], [overlap()]));

    expect(text).toContain('Promo a');
    expect(text).toContain('Promo b');
    expect(text).toContain('−28,0 %');
  });

  /**
   * Deux règles du même étage ne s'ajoutent pas : la plus précise gagne.
   * Annoncer un cumul ici ferait crier au danger là où il n'y a qu'une relève.
   */
  it("dit « la plus précise gagne » au lieu d'un cumul, sur un même étage", () => {
    const text = textOf(
      mount(
        [rule('a', '01', '20'), rule('b', '15', '30')],
        [overlap({ kind: 'supersede', composedBp: null })],
      ),
    );

    expect(text).toContain('la plus précise gagne');
    expect(text).not.toContain('%');
  });
});
