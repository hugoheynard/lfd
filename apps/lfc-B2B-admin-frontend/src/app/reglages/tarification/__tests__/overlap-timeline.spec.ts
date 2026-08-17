import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { PriceOverlapView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OverlapTimeline, type TimelineBand } from '../overlap-timeline/overlap-timeline';
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

function rule(id: string, from: string, to: string | null): TimelineBand {
  return {
    id,
    label: `Promo ${id}`,
    summary: `Promotion ${id}`,
    validFrom: iso(from),
    validTo: to === null ? null : iso(to),
  };
}

function overlap(over: Partial<PriceOverlapView> = {}): PriceOverlapView {
  return {
    from: iso('15'),
    to: iso('20'),
    ruleIds: ['a', 'b'],
    evictedRuleIds: [],
    kind: 'compose',
    composedBp: 2_800,
    composedTopBp: 2_800,
    ...over,
  };
}

function mount(
  bands: readonly TimelineBand[],
  overlaps: readonly PriceOverlapView[],
): ComponentFixture<OverlapTimeline> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(OverlapTimeline);
  fixture.componentRef.setInput('bands', bands);
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
    expect(composedLabel(overlap({ composedBp: null, composedTopBp: null }))).toBeNull();
  });

  /**
   * **Un barème n'a pas un cumul, il en a autant que de paliers.** Un chiffre
   * unique serait faux pour toutes les quantités sauf une : la frise annonce donc
   * les deux bouts de l'échelle.
   */
  it('annonce une fourchette quand un barème compose', () => {
    expect(composedLabel(overlap({ composedBp: 2_800, composedTopBp: 3_600 }))).toBe(
      'de −28,0 % à −36,0 %',
    );
  });

  it('dit la période, et laisse une fin ouverte ouverte', () => {
    expect(periodLabel(overlap())).toContain('du 15');
    expect(periodLabel(overlap({ to: null }))).toContain('à partir du');
  });
});

describe("la frise à l'écran", () => {
  /** Une seule règle : il n'y a rien à croiser, donc rien à montrer. */
  it("ne s'affiche pas sur une règle seule", () => {
    expect(textOf(mount([rule('a', '01', '10')], []))).toBe('');
  });

  /**
   * Deux règles qui ne se touchent pas : la frise s'affiche quand même. Voir
   * deux barres disjointes répond à la question ; une frise absente la laisse
   * entière — on ne sait pas si rien ne se croise, ou si l'écran se tait.
   */
  it('se montre dès deux règles, même sans chevauchement', () => {
    const text = textOf(mount([rule('a', '01', '10'), rule('b', '15', '20')], []));

    expect(text).toContain("Aucune de ces altérations n'en croise une autre");
    expect(text).toContain('Promo a');
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
    const fixture = mount(
      [rule('a', '01', '20'), rule('b', '15', '30')],
      [overlap({ kind: 'supersede', composedBp: null })],
    );

    // La ligne du recouvrement, pas l'intro : c'est ELLE qui ne doit pas
    // annoncer de cumul là où il n'y a qu'une relève.
    const line = String(fixture.nativeElement.querySelector('.overlaps')?.textContent ?? '');
    expect(line).toContain('la plus précise gagne');
    expect(line).not.toContain('cumul');
  });

  /**
   * **La barre creuse.** Sur la tranche où une plus précise l'évince, la règle
   * du catalogue ne produit plus rien — la frise la creuse plutôt que de la
   * couper : le tracé continue, la matière s'en va.
   */
  it('creuse la barre de la règle évincée, sur la seule tranche où elle perd', () => {
    const fixture = mount(
      [rule('a', '01', '30'), rule('b', '10', '20')],
      [overlap({ from: iso('10'), to: iso('20'), kind: 'supersede', evictedRuleIds: ['a'] })],
    );

    const holes = fixture.nativeElement.querySelectorAll('.bar-evicted');
    expect(holes.length).toBe(1);
  });

  /** Une règle qui gagne partout ne se creuse jamais. */
  it('ne creuse pas la barre de celle qui gagne', () => {
    const fixture = mount(
      [rule('a', '01', '30'), rule('b', '10', '20')],
      [overlap({ from: iso('10'), to: iso('20'), kind: 'supersede', evictedRuleIds: ['a'] })],
    );

    const rows = fixture.nativeElement.querySelectorAll('.rows:first-of-type .row');
    expect(rows[1]?.querySelectorAll('.bar-evicted').length).toBe(0);
  });
});
