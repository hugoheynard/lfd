import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  WorkshopBatch,
  WorkshopLine as WorkshopLineView,
  WorkshopShortcutView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorkshopKeypadOpener } from '../workshop-keypad-opener';
import { WorksheetLine } from './worksheet-line';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - **le chiffre en gros est le manque du palier en cours**, avec son heure,
 *   « / q » seulement s'il y a plusieurs paliers, et le total dessous ;
 * - **le retard se voit** — badge en minutes, classe de liseré — et un palier
 *   tenu n'est jamais en retard ;
 * - **pas de « + 1 plaque » sans contenant**, et « Saisir » ouvre le pavé
 *   prérempli du manque du palier ;
 * - ce qui presse et le contrôle qualité s'affichent quand ils sont servis.
 */

const AT = '2026-09-15T04:30:00';
/** 7 h 56. */
const NOW = 7 * 60 + 56;

function line(over: Partial<WorkshopLineView> = {}): WorkshopLineView {
  return {
    sku: 'CRO',
    productName: 'Croissant au beurre',
    quantity: 240,
    containerLabel: null,
    done: false,
    initials: null,
    doneAt: null,
    produced: 180,
    remaining: 60,
    surplus: 0,
    batches: [],
    container: null,
    deadlines: [
      { quantity: 120, before: '07:00' },
      { quantity: 120, before: '09:30' },
    ],
    ...over,
  };
}

const BATCH: WorkshopBatch = { id: 'b1', quantity: 48, recordedAt: AT, initials: 'MJ' };

/** Le pavé doublé : il retient ce qu'on lui demande, et rend `answer`. */
class FakeKeypad {
  readonly asked: { preset: number; shortcuts: readonly WorkshopShortcutView[] }[] = [];
  answer: number | null = null;

  async openFor(
    _line: WorkshopLineView,
    preset: number,
    shortcuts: readonly WorkshopShortcutView[],
  ): Promise<number | null> {
    this.asked.push({ preset, shortcuts });
    return this.answer;
  }
}

let keypad: FakeKeypad;

beforeEach(() => {
  keypad = new FakeKeypad();
  TestBed.configureTestingModule({
    providers: [{ provide: WorkshopKeypadOpener, useValue: keypad }],
  });
});

function render(value: WorkshopLineView, busy = false, now = NOW): ComponentFixture<WorksheetLine> {
  const fixture = TestBed.createComponent(WorksheetLine);
  fixture.componentRef.setInput('line', value);
  fixture.componentRef.setInput('busy', busy);
  fixture.componentRef.setInput('now', now);
  fixture.detectChanges();
  return fixture;
}

const buttons = (el: HTMLElement): HTMLButtonElement[] => [...el.querySelectorAll('button')];
const button = (el: HTMLElement, label: string): HTMLButtonElement | undefined =>
  buttons(el).find((node) => node.textContent?.replace(/\s+/gu, ' ').trim().startsWith(label));
const text = (el: HTMLElement, selector: string): string =>
  el.querySelector(selector)?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('une ligne, vue par produit', () => {
  it('ouvre sur le manque du palier en cours, son heure et le total', () => {
    const el: HTMLElement = render(line()).nativeElement;

    expect(text(el, '.wl-left-big')).toBe('60 / 120');
    expect(text(el, '.wl-left-when')).toBe('avant 9 h 30');
    expect(text(el, '.wl-left-total')).toBe('total : 60 / 240');
    expect(text(el, '.wl-figures')).toBe('180 / 240 sorties');
  });

  it('ne dit pas « / q » quand la ligne n’a qu’un palier', () => {
    const el: HTMLElement = render(
      line({
        quantity: 50,
        produced: 0,
        remaining: 50,
        deadlines: [{ quantity: 50, before: '08:00' }],
      }),
      false,
      7 * 60,
    ).nativeElement;

    expect(text(el, '.wl-left-big')).toBe('50');
  });

  it('dit « ✓ fait » sur une ligne complète', () => {
    const el: HTMLElement = render(line({ produced: 240, remaining: 0, done: true })).nativeElement;

    expect(text(el, '.wl-left-big')).toBe('✓');
    expect(text(el, '.wl-left-when')).toBe('fait');
    expect(el.classList.contains('is-done')).toBe(true);
  });

  it('dit le retard en minutes, et pose le liseré', () => {
    const el: HTMLElement = render(line({ produced: 60, remaining: 180 })).nativeElement;

    expect(text(el, '.wl-late')).toBe('En retard · 56 min');
    expect(el.classList.contains('is-late')).toBe(true);
  });

  it('n’est pas en retard quand le palier dépassé est tenu', () => {
    const el: HTMLElement = render(line()).nativeElement;

    expect(el.querySelector('.wl-late')).toBeNull();
    expect(el.classList.contains('is-late')).toBe(false);
  });

  it('dit ce qui presse et la pastille du contrôle', () => {
    const el: HTMLElement = render(
      line({
        waitingOrders: { count: 1, earliestHandover: '08:45' },
        quality: {
          sku: 'CRO',
          verdict: 'ok',
          checkedAt: AT,
          quantitySeen: 240,
          currentQuantity: 240,
          stale: false,
        },
      }),
    ).nativeElement;

    expect(text(el, '.wl-waiting')).toBe('1 commande attend · remise 8 h 45');
    expect(text(el, '.wl-quality')).toBe('Contrôle · OK');
  });

  it('🔴 sans contenant, « Saisir » seul — ni plaque, ni unité', () => {
    const el: HTMLElement = render(line()).nativeElement;

    expect(buttons(el).map((node) => node.textContent?.trim())).toEqual(['Saisir']);
  });

  it('« + 1 plaque » remonte une fournée de la taille du contenant', () => {
    const fixture = render(line({ container: { unitsPerContainer: 30, singular: 'plaque' } }));
    const asked: number[] = [];
    fixture.componentInstance.recorded.subscribe((quantity) => asked.push(quantity));

    button(fixture.nativeElement, '+ 1 plaque')?.click();

    expect(text(fixture.nativeElement, '.wl-quick-size')).toBe('30 pièces');
    expect(asked).toEqual([30]);
  });

  it('« Saisir » ouvre le pavé prérempli du manque du palier, et remonte sa quantité', async () => {
    const fixture = render(line());
    const asked: number[] = [];
    fixture.componentInstance.recorded.subscribe((quantity) => asked.push(quantity));
    keypad.answer = 42;

    button(fixture.nativeElement, 'Saisir')?.click();
    await tick();

    expect(keypad.asked.map((call) => call.preset)).toEqual([60]);
    expect(asked).toEqual([42]);
  });

  it('un pavé fermé sans déclarer ne remonte rien', async () => {
    const fixture = render(line());
    const asked: number[] = [];
    fixture.componentInstance.recorded.subscribe((quantity) => asked.push(quantity));

    button(fixture.nativeElement, 'Saisir')?.click();
    await tick();

    expect(asked).toEqual([]);
  });

  it('un raccourci, discret, ouvre le pavé posé sur ses pièces', async () => {
    const fixture = TestBed.createComponent(WorksheetLine);
    fixture.componentRef.setInput('line', line());
    fixture.componentRef.setInput('now', NOW);
    fixture.componentRef.setInput('shortcuts', [{ id: 'bs-1', label: '1 chariot', pieces: 96 }]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    el.querySelector<HTMLButtonElement>('[data-worksheet-shortcut="bs-1"]')?.click();
    await tick();

    expect(keypad.asked[0]?.preset).toBe(96);
  });

  /** Régression : « 1 plaque · 30 » doublait « + 1 plaque » sur la ligne (2026-10-28). */
  it('ne montre pas le raccourci qui vaut un contenant', () => {
    const fixture = TestBed.createComponent(WorksheetLine);
    fixture.componentRef.setInput(
      'line',
      line({ container: { unitsPerContainer: 30, singular: 'plaque' } }),
    );
    fixture.componentRef.setInput('now', NOW);
    fixture.componentRef.setInput('shortcuts', [
      { id: 'bs-1', label: '1 plaque', pieces: 30 },
      { id: 'bs-2', label: '1 chariot', pieces: 96 },
    ]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-worksheet-shortcut="bs-1"]')).toBeNull();
    expect(el.querySelector('[data-worksheet-shortcut="bs-2"]')).not.toBeNull();
  });

  it('montre ses fournées en puces', () => {
    const el: HTMLElement = render(line({ batches: [BATCH] })).nativeElement;

    expect(el.querySelectorAll('[data-batch-chip]')).toHaveLength(1);
  });

  it('désarme tous ses gestes pendant un envoi', () => {
    const el: HTMLElement = render(
      line({ container: { unitsPerContainer: 12, singular: 'plaque' } }),
      true,
    ).nativeElement;

    expect(buttons(el).every((node) => node.disabled)).toBe(true);
  });
});
