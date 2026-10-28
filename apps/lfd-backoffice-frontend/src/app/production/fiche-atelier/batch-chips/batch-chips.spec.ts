import { TestBed } from '@angular/core/testing';
import type { WorkshopBatch } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { hourLabel } from '../../worksheet-day';
import { BatchChips } from './batch-chips';

/** Une puce par fournée, et l'annulation en deux temps : ✕, puis « Annuler 48 ? ». */

const AT = '2026-09-15T04:30:00';
const BATCH: WorkshopBatch = { id: 'b1', quantity: 48, recordedAt: AT, initials: 'MJ' };

describe('les puces des fournées', () => {
  it('dit l’heure, les initiales et la quantité, et annule en deux temps', async () => {
    const fixture = TestBed.createComponent(BatchChips);
    fixture.componentRef.setInput('batches', [BATCH]);
    fixture.detectChanges();
    const cancelled: WorkshopBatch[] = [];
    fixture.componentInstance.cancelled.subscribe((batch) => cancelled.push(batch));
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.bc-said')?.textContent?.trim()).toBe(
      `${hourLabel(AT) ?? ''} · MJ · 48`,
    );

    el.querySelector<HTMLButtonElement>('fold-button-icon button')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(cancelled).toEqual([]);

    [...el.querySelectorAll('button')]
      .find((node) => node.textContent?.includes('Annuler 48 ?'))
      ?.click();

    expect(cancelled).toEqual([BATCH]);
  });
});

/** Régression : une annulation sur une journée du colisage semblait ne rien faire (2026-10-28). */
describe('les puces des fournées — retour au colisage', () => {
  function mount(batch: WorkshopBatch) {
    const fixture = TestBed.createComponent(BatchChips);
    fixture.componentRef.setInput('batches', [batch]);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('dit les pièces en retour, et garde la croix pour le reste', () => {
    const el = mount({ ...BATCH, pendingReturn: 24 });

    expect(el.querySelector('[data-batch-returning]')?.textContent?.trim()).toBe('↩ 24 en retour');
    expect(el.querySelector('fold-button-icon')).not.toBeNull();
  });

  it('retire la croix quand toute la fournée est déjà en retour', () => {
    const el = mount({ ...BATCH, pendingReturn: 48 });

    expect(el.querySelector('[data-batch-returning]')?.textContent?.trim()).toBe('↩ 48 en retour');
    expect(el.querySelector('fold-button-icon')).toBeNull();
  });

  it('ne dit rien sans retour en attente', () => {
    expect(
      mount({ ...BATCH, pendingReturn: 0 }).querySelector('[data-batch-returning]'),
    ).toBeNull();
  });
});
