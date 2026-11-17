import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TrackingLevelsPreview } from './tracking-levels-preview';

/**
 * Ce que ces cas tiennent : un palier passe « sorti » à son heure plus la
 * marge quand l'horloge avance, un rouge arrive dans la cloche et reste en
 * Supervision jusqu'à être traité, une correction après le colisage le dit,
 * et changer de niveau change les gestes offerts.
 */
describe('TrackingLevelsPreview', () => {
  let fixture: ComponentFixture<TrackingLevelsPreview>;
  let page: TrackingLevelsPreview;

  const row = (sku: string) => page.rows().find((r) => r.product.sku === sku);
  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TrackingLevelsPreview] }).compileComponents();
    fixture = TestBed.createComponent(TrackingLevelsPreview);
    page = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('passe le premier palier en vert à 7 h 15 avec 15 min de marge, pas avant', () => {
    page.advance(2 * 60); // 7 h 00
    expect(row('CRO')?.status).toBe('waiting');
    page.advance(15); // 7 h 15
    expect(row('CRO')).toMatchObject({ status: 'partial', produced: 120 });
    page.advance(3 * 60); // 10 h 15
    expect(row('CRO')).toMatchObject({ status: 'out', produced: 240 });
  });

  it('suit la marge réglée', () => {
    page.margin.set(0);
    page.advance(2 * 60);
    expect(row('CRO')?.produced).toBe(120);
  });

  it('envoie un rouge à la cloche et à la Supervision, jusqu’à ce qu’il soit traité', async () => {
    page.openRed('ECL');
    page.redQuantity.set(20);
    page.redReason.set('fournée ratée');
    page.confirmRed();
    await fixture.whenStable();

    expect(page.alerts()).toHaveLength(1);
    expect(page.openAlerts()[0]).toMatchObject({ expected: 36, produced: 20 });
    expect(row('ECL')?.status).toBe('problem');
    expect(host().querySelectorAll('.supervision-item')).toHaveLength(1);
    expect(host().textContent).toContain('il en manque 16');

    page.markTreated(page.openAlerts()[0]?.id ?? 0);
    await fixture.whenStable();
    expect(page.openAlerts()).toHaveLength(0);
    expect(host().querySelectorAll('.bell-item')).toHaveLength(1);
    expect(host().querySelectorAll('.supervision-item')).toHaveLength(0);
  });

  it('corrige un vert après coup, et renvoie au colisage quand des pièces y sont', () => {
    page.advance(2 * 60 + 15); // 7 h 15 : 120 croissants réputés sortis
    page.openRed('CRO');
    expect(page.red()).toMatchObject({ expected: 120, correction: true, viaPacking: false });
    page.cancelRed();

    page.advance(30); // 7 h 45 : le colisage a commencé
    page.openRed('CRO');
    expect(page.red()).toMatchObject({ correction: true, viaPacking: true });
    page.redQuantity.set(80);
    page.confirmRed();
    expect(row('CRO')).toMatchObject({ status: 'problem', produced: 80 });
    expect(page.alerts()[0]?.viaPacking).toBe(true);
  });

  it('offre « Fait » en simple et la fiche détaillée en détaillé', async () => {
    expect(host().textContent).not.toContain('Fait');
    page.level.set('simple');
    await fixture.whenStable();
    expect(host().textContent).toContain('Fait');
    page.markDone('CRO');
    expect(row('CRO')).toMatchObject({ status: 'done', produced: 240 });

    page.level.set('detailed');
    await fixture.whenStable();
    expect(host().querySelectorAll('app-worksheet-line')).toHaveLength(7);
    page.recordBatch('CRO', 20);
    expect(page.lines().find((l) => l.line.sku === 'CRO')?.line.produced).toBe(20);
  });
});
