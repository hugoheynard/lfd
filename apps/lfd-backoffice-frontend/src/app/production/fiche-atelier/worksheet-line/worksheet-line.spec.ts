import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { WorkshopBatch, WorkshopLine as WorkshopLineView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { hourLabel } from '../../worksheet-day';
import { WorksheetLine } from './worksheet-line';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - **la barre montre les chiffres servis**, et le surplus se DIT (« +4 »,
 *   ton warning) au lieu de disparaître dans une barre qui plafonne ;
 * - **pas de « + 1 plaque » sans contenant réglé** — on ne fabrique pas une
 *   plaque que personne n'a déclarée —, et le bouton porte le mot du réglage ;
 * - **« Saisir » s'ouvre prérempli de ce qui reste**, au moins une pièce, et
 *   refuse zéro ;
 * - **chaque fournée s'annule**, et la ligne ne décide rien elle-même.
 */

const AT = '2026-09-15T04:30:00';

function line(over: Partial<WorkshopLineView> = {}): WorkshopLineView {
  return {
    sku: 'CRO',
    productName: 'Croissant',
    quantity: 200,
    containerLabel: '4 tourneuses',
    done: false,
    initials: null,
    doneAt: null,
    produced: 96,
    remaining: 104,
    surplus: 0,
    batches: [],
    container: null,
    ...over,
  };
}

const BATCH: WorkshopBatch = { id: 'b1', quantity: 48, recordedAt: AT, initials: 'MJ' };

function render(value: WorkshopLineView, busy = false): ComponentFixture<WorksheetLine> {
  const fixture = TestBed.createComponent(WorksheetLine);
  fixture.componentRef.setInput('line', value);
  fixture.componentRef.setInput('busy', busy);
  fixture.detectChanges();
  return fixture;
}

const buttons = (el: HTMLElement): HTMLButtonElement[] => [...el.querySelectorAll('button')];
const button = (el: HTMLElement, label: string): HTMLButtonElement | undefined =>
  buttons(el).find((node) => node.textContent?.trim() === label);
const field = (el: HTMLElement): HTMLInputElement | null =>
  el.querySelector('.wl-entry-field input');

describe('une ligne de fiche d’atelier', () => {
  it('montre la quantité et le nom, le contenant à côté', () => {
    const el: HTMLElement = render(line()).nativeElement;

    expect(el.querySelector('.wl-qty')?.textContent?.trim()).toBe('200');
    expect(el.querySelector('.wl-name')?.textContent?.trim()).toBe('Croissant');
    expect(el.querySelector('.wl-container')?.textContent?.trim()).toBe('4 tourneuses');
  });

  it('laisse la colonne du contenant vide quand rien n’est réglé', () => {
    const el: HTMLElement = render(line({ containerLabel: null })).nativeElement;

    expect(el.querySelector('.wl-container')).toBeNull();
  });

  it('montre la barre et les chiffres servis, sans surplus', () => {
    const el: HTMLElement = render(line()).nativeElement;

    expect(el.querySelector('fold-meter')).not.toBeNull();
    expect(el.querySelector('.wl-figures')?.textContent?.trim()).toBe('96 / 200');
    expect(el.querySelector('.wl-surplus')).toBeNull();
  });

  it('dit le surplus « +4 » quand il est sorti plus que prévu', () => {
    const el: HTMLElement = render(
      line({ quantity: 48, produced: 52, remaining: 0, surplus: 4, done: true }),
    ).nativeElement;

    expect(el.querySelector('.wl-figures')?.textContent?.trim()).toBe('52 / 48');
    expect(el.querySelector('.wl-surplus')?.textContent?.trim()).toBe('+4');
    expect(el.classList.contains('is-done')).toBe(true);
  });

  it('🔴 n’offre aucun « + 1 » sans contenant réglé — ni plaque, ni unité', () => {
    const el: HTMLElement = render(line()).nativeElement;

    expect(buttons(el).map((node) => node.textContent?.trim())).toEqual(['Saisir']);
  });

  it('« + 1 tourneuse » remonte une fournée de la taille du contenant', () => {
    const fixture = render(line({ container: { unitsPerContainer: 12, singular: 'tourneuse' } }));
    const asked: number[] = [];
    fixture.componentInstance.recorded.subscribe((quantity) => asked.push(quantity));

    button(fixture.nativeElement, '+ 1 tourneuse')?.click();

    expect(asked).toEqual([12]);
  });

  it('ouvre la saisie préremplie de ce qui reste, et la valide d’un geste', async () => {
    const fixture = render(line());
    const asked: number[] = [];
    fixture.componentInstance.recorded.subscribe((quantity) => asked.push(quantity));
    const el: HTMLElement = fixture.nativeElement;

    button(el, 'Saisir')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(field(el)?.value).toBe('104');

    button(el, 'Déclarer')?.click();
    fixture.detectChanges();

    expect(asked).toEqual([104]);
    expect(el.querySelector('.wl-entry')).toBeNull();
  });

  it('préremplit une pièce, jamais zéro, sur une ligne déjà complète', async () => {
    const fixture = render(line({ produced: 200, remaining: 0, done: true }));
    const el: HTMLElement = fixture.nativeElement;

    button(el, 'Saisir')?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(field(el)?.value).toBe('1');
  });

  it('refuse une saisie de zéro pièce', async () => {
    const fixture = render(line());
    const asked: number[] = [];
    fixture.componentInstance.recorded.subscribe((quantity) => asked.push(quantity));
    const el: HTMLElement = fixture.nativeElement;
    button(el, 'Saisir')?.click();
    fixture.detectChanges();

    const input = field(el);
    if (input !== null) {
      input.value = '0';
      input.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();

    expect(button(el, 'Déclarer')?.disabled).toBe(true);
    el.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(asked).toEqual([]);
  });

  it('liste les fournées — heure, initiales, quantité — et remonte celle à annuler', () => {
    const fixture = render(line({ batches: [BATCH] }));
    const cancelled: WorkshopBatch[] = [];
    fixture.componentInstance.cancelled.subscribe((batch) => cancelled.push(batch));
    const el: HTMLElement = fixture.nativeElement;

    const row = el.querySelector('.wl-batch')?.textContent?.replace(/\s+/gu, ' ') ?? '';
    expect(row).toContain(hourLabel(AT) ?? '?');
    expect(row).toContain('MJ');
    expect(row).toContain('48');

    button(el, 'Annuler')?.click();
    expect(cancelled).toEqual([BATCH]);
  });

  it('désarme tous ses gestes pendant un envoi', () => {
    const el: HTMLElement = render(
      line({ batches: [BATCH], container: { unitsPerContainer: 12, singular: 'plaque' } }),
      true,
    ).nativeElement;

    expect(buttons(el).every((node) => node.disabled)).toBe(true);
  });
});
