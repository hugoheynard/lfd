import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { BillingCycleView } from '@lfd/contracts';

import { CycleBar } from './cycle-bar';

/**
 * 🔴 Ce que ces cas tiennent, et qu'aucun type ne tient : **les bornes se lisent
 * à l'heure de Paris**.
 *
 * Un cycle se ferme à minuit local, ce qui s'écrit `T22:00:00Z` en été et
 * `T23:00:00Z` en hiver. Lu par ses composantes UTC, il afficherait la veille —
 * une date parfaitement plausible, sur un écran qui décide de quel mois relève
 * une commande de fin de soirée.
 *
 * Les instants ci-dessous sont ceux du SUJET du test : ils ne sont comparés
 * qu'entre eux et à un `now` fourni, jamais à l'horloge du processus (cf. la
 * règle des dates de fixture).
 */
const SUMMER_CYCLE: BillingCycleView = {
  // Minuit à Paris le 1er septembre 2026 (UTC+2) et le 1er octobre 2026.
  startsAt: '2026-08-31T22:00:00.000Z',
  closesAt: '2026-09-30T22:00:00.000Z',
};

const WINTER_CYCLE: BillingCycleView = {
  // Minuit à Paris le 1er décembre 2026 (UTC+1) et le 1er janvier 2027.
  startsAt: '2026-11-30T23:00:00.000Z',
  closesAt: '2026-12-31T23:00:00.000Z',
};

async function render(cycle: BillingCycleView, now: number): Promise<ComponentFixture<CycleBar>> {
  // Deux rendus dans un même cas (avant / après la clôture) : sans remise à
  // zéro, le second échoue sur un module déjà instancié.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [CycleBar] });
  const fixture: ComponentFixture<CycleBar> = TestBed.createComponent(CycleBar);
  fixture.componentRef.setInput('cycle', cycle);
  fixture.componentRef.setInput('now', now);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<CycleBar>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

const fillWidth = (fixture: ComponentFixture<CycleBar>): string =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.cycle-fill')?.style.width ??
  '';

describe('CycleBar', () => {
  it('🔴 rend les bornes en heure LOCALE, pas en UTC (été)', async () => {
    const fixture = await render(SUMMER_CYCLE, Date.parse('2026-09-15T10:00:00.000Z'));

    expect(text(fixture)).toContain('1 septembre 2026');
    expect(text(fixture)).toContain('1 octobre 2026');
    // Les deux dates qu'une lecture UTC aurait affichées.
    expect(text(fixture)).not.toContain('31 août');
    expect(text(fixture)).not.toContain('30 septembre');
  });

  it('🔴 rend les bornes en heure LOCALE, pas en UTC (hiver, décalage +1)', async () => {
    const fixture = await render(WINTER_CYCLE, Date.parse('2026-12-15T10:00:00.000Z'));

    expect(text(fixture)).toContain('1 décembre 2026');
    expect(text(fixture)).toContain('1 janvier 2027');
    expect(text(fixture)).not.toContain('30 novembre');
    expect(text(fixture)).not.toContain('31 décembre');
  });

  it('🔴 dit « clôture … à 00h00 » et jamais « jusqu’au … inclus »', async () => {
    const fixture = await render(SUMMER_CYCLE, Date.parse('2026-09-15T10:00:00.000Z'));
    const body = text(fixture);

    expect(body).toContain('clôture à 00h00, exclue');
    expect(body).toContain('relève du cycle suivant');
    expect(body).not.toContain('inclus');
  });

  it('place le curseur là où on en est dans le cycle', async () => {
    // Le 16 septembre à midi local : quinze jours et demi sur trente.
    const fixture = await render(SUMMER_CYCLE, Date.parse('2026-09-16T10:00:00.000Z'));

    const width = Number.parseFloat(fillWidth(fixture));
    expect(width).toBeGreaterThan(48);
    expect(width).toBeLessThan(56);
  });

  it('ne déborde jamais, avant l’ouverture comme après la clôture', async () => {
    const before = await render(SUMMER_CYCLE, Date.parse('2026-08-01T10:00:00.000Z'));
    expect(Number.parseFloat(fillWidth(before))).toBe(0);

    const after = await render(SUMMER_CYCLE, Date.parse('2026-11-01T10:00:00.000Z'));
    expect(Number.parseFloat(fillWidth(after))).toBe(100);
    expect(text(after)).toContain('cycle clos');
  });

  it('compte en jours de loin, en heures quand la clôture approche', async () => {
    const far = await render(SUMMER_CYCLE, Date.parse('2026-09-10T22:00:00.000Z'));
    expect(text(far)).toContain('il reste 20 jours');

    const near = await render(SUMMER_CYCLE, Date.parse('2026-09-30T16:00:00.000Z'));
    expect(text(near)).toContain('il reste 6 h');
  });

  it('🔴 ne montre AUCUN montant — un cycle n’en a pas un seul', async () => {
    const fixture = await render(SUMMER_CYCLE, Date.parse('2026-09-15T10:00:00.000Z'));

    expect(text(fixture)).not.toContain('€');
    expect(text(fixture)).not.toMatch(/\d+[.,]\d{2}/u);
  });

  it('gradue les semaines aux lundis locaux', async () => {
    const fixture = await render(SUMMER_CYCLE, Date.parse('2026-09-15T10:00:00.000Z'));
    const ticks = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('.cycle-week-day'),
    ].map((tick) => tick.textContent);

    // Septembre 2026 : les lundis tombent les 7, 14, 21 et 28.
    expect(ticks).toEqual(['7', '14', '21', '28']);
  });
});
