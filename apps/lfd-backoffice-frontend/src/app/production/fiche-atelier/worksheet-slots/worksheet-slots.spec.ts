import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { WorkshopLine } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { type SlotEntry, type SlotRecord, WorksheetSlots } from './worksheet-slots';

/**
 * La vue par tranche : une carte par heure, une seule « La prochaine », les
 * gestes remontent la ligne et le manque de SON palier.
 */

const NOW = 7 * 60 + 56;

function line(over: Partial<WorkshopLine> = {}): WorkshopLine {
  return {
    sku: 'CRO',
    productName: 'Croissant au beurre',
    quantity: 240,
    containerLabel: null,
    done: false,
    initials: null,
    doneAt: null,
    produced: 130,
    remaining: 110,
    surplus: 0,
    batches: [],
    container: { unitsPerContainer: 30, singular: 'plaque' },
    deadlines: [
      { quantity: 120, before: '07:00' },
      { quantity: 120, before: '09:30' },
    ],
    ...over,
  };
}

const TARTE = line({
  sku: 'TAR',
  productName: 'Tartelette citron',
  quantity: 24,
  produced: 0,
  remaining: 24,
  container: null,
  deadlines: [{ quantity: 24, before: '07:45' }],
});

function render(lines: readonly WorkshopLine[], compact = false): ComponentFixture<WorksheetSlots> {
  const fixture = TestBed.createComponent(WorksheetSlots);
  fixture.componentRef.setInput('lines', lines);
  fixture.componentRef.setInput('now', NOW);
  fixture.componentRef.setInput('compact', compact);
  fixture.detectChanges();
  return fixture;
}

const states = (el: HTMLElement): (string | null)[] =>
  [...el.querySelectorAll('[data-slot-state]')].map((node) => node.getAttribute('data-slot-state'));

describe('la vue par tranche', () => {
  it('range les cartes par heure, avec leur état', () => {
    const el: HTMLElement = render([line(), TARTE]).nativeElement;

    expect(states(el)).toEqual(['met', 'over', 'next']);
    expect(el.textContent).toContain('Dépassée · 11 min');
    expect(el.textContent).toContain('La prochaine');
    expect(el.textContent).toContain('Tenue');
  });

  it('dit le manque du palier et « palier 2 sur 2 · plaque de 30 »', () => {
    const el: HTMLElement = render([line()]).nativeElement;
    const rows = [...el.querySelectorAll('[data-slot-row]')];

    expect(rows[1]?.querySelector('.ws-miss')?.textContent?.trim()).toBe('110');
    expect(rows[1]?.querySelector('.ws-sub')?.textContent?.trim()).toBe(
      'palier 2 sur 2 · plaque de 30',
    );
    expect(rows[1]?.querySelector('.ws-figures')?.textContent?.trim()).toBe('10 / 120');
  });

  it('« + 1 plaque » remonte une fournée de la ligne', () => {
    const fixture = render([line()]);
    const recorded: SlotRecord[] = [];
    fixture.componentInstance.recorded.subscribe((value) => recorded.push(value));

    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .find((node) => node.textContent?.includes('+ 1 plaque'))
      ?.click();

    expect(recorded.map((value) => [value.line.sku, value.quantity])).toEqual([['CRO', 30]]);
  });

  it('« Saisir » demande le pavé, prérempli du manque du palier', () => {
    const fixture = render([line()]);
    const entered: SlotEntry[] = [];
    fixture.componentInstance.entered.subscribe((value) => entered.push(value));

    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .find((node) => node.textContent?.trim() === 'Saisir')
      ?.click();

    expect(entered.map((value) => value.preset)).toEqual([110]);
  });

  it('au téléphone, un seul bouton par rangée', () => {
    const el: HTMLElement = render([line(), TARTE], true).nativeElement;

    expect(
      [...el.querySelectorAll('.ws-actions')].map((node) => node.querySelectorAll('button').length),
    ).toEqual([1, 1]);
  });
});
