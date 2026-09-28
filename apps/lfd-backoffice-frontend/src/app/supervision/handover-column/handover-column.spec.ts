import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { HandoverBoard, SlotGroup, SlotRow } from '../handover-slots';
import { NO_MATCHES } from '../supervision-search';
import { HandoverColumn } from './handover-column';

function row(reference: string, overrides: Partial<SlotRow> = {}): SlotRow {
  return {
    orderId: `o-${reference}`,
    reference,
    customerLabel: reference,
    state: 'ready',
    time: '7 h 15',
    totalUnits: 3,
    pickupLabel: 'Boutique',
    handedOverAt: null,
    readyAt: null,
    overdueMinutes: null,
    overdueCause: null,
    method: 'pickup',
    heldForQuality: false,
    ...overrides,
  };
}

const BOARD: HandoverBoard = {
  pickup: [
    {
      key: 'h07',
      kind: 'hour',
      label: '7 h – 8 h',
      expected: 3,
      handedOver: 1,
      endMinutes: 480,
      rows: [
        row('PRETE'),
        row('RETIREE', { state: 'handed_over', handedOverAt: '7 h 04' }),
        row('TARD', { state: 'overdue', overdueMinutes: 55, overdueCause: 'kitchen' }),
      ],
    },
  ],
  delivery: [
    {
      key: 'h08',
      kind: 'hour',
      label: '8 h – 9 h',
      expected: 1,
      handedOver: 0,
      endMinutes: 540,
      rows: [row('LIV', { method: 'delivery' })],
    },
  ],
  pickupExpected: 2,
  deliveryExpected: 1,
  overdue: 1,
  awaitingPacking: 0,
  overdueKitchen: 1,
  held: 0,
};

async function mount(board: HandoverBoard) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(HandoverColumn);
  fixture.componentRef.setInput('board', board);
  fixture.componentRef.setInput('showLinks', true);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('HandoverColumn', () => {
  /** Hugo, 2026-09-28 : le numéro de commande manquait, c'est lui qu'on lit sur le sac. */
  it('montre le numéro de commande à côté du client', async () => {
    const element: HTMLElement = (await mount(BOARD)).nativeElement;
    const reference = element.querySelector('[data-reference="RETIREE"] [data-row-reference]');

    expect(reference?.textContent?.trim()).toBe('RETIREE');
  });

  it('groupe par tranche et dit chaque état en toutes lettres', async () => {
    const fixture = await mount(BOARD);
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('[data-slot="h07"]')?.textContent).toContain(
      '3 attendues · 1 retirée',
    );
    expect(element.querySelector('[data-reference="RETIREE"]')?.textContent).toContain(
      'Remis 7 h 04',
    );
    expect(element.querySelector('[data-reference="TARD"]')?.textContent).toContain(
      'créneau dépassé par nous, 55 min',
    );
  });

  it('renvoie vers le retrait là où la maquette posait « Remettre »', async () => {
    const fixture = await mount(BOARD);
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('[data-reference="PRETE"] a')?.getAttribute('href')).toBe(
      '/comptoir/retrait',
    );
    expect(element.querySelector('[data-reference="RETIREE"] a')).toBeNull();
  });

  /** A4 : l'acheminement vient de la bande, par le `model()` que la page relie. */
  it('lit l’acheminement que la bande a choisi', async () => {
    const fixture = await mount(BOARD);
    fixture.componentRef.setInput('method', 'delivery');
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('[data-reference="LIV"]')).not.toBeNull();
    expect(element.querySelector('[data-reference="PRETE"]')).toBeNull();
  });

  it('ne montre que le point filtré, sans le répéter sur la ligne', async () => {
    const fixture = await mount(BOARD);
    fixture.componentRef.setInput('point', 'Boutique');
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('[data-reference="PRETE"]')).not.toBeNull();
    expect(element.querySelector('[data-row-point]')).toBeNull();
  });

  /** `plan-controle-qualite.md`, D7 : une commande retenue le dit, et sa carte passe en alerte. */
  it('dit « Retenue » sur une commande retenue, carte en alerte', async () => {
    const held = row('RETENUE', { heldForQuality: true });
    const board: HandoverBoard = {
      ...BOARD,
      pickup: [{ ...BOARD.pickup[0]!, rows: [held, row('PRETE')] }],
      held: 1,
    };
    const element: HTMLElement = (await mount(board)).nativeElement;
    const card = element.querySelector('[data-reference="RETENUE"]');

    expect(card?.textContent).toContain('Retenue · contrôle qualité bloquant');
    expect(card?.classList).toContain('is-held');
    expect(card?.classList).toContain('edge-alert');
    expect(element.querySelector('[data-reference="PRETE"]')?.textContent).not.toContain('Retenue');
  });

  describe('Supervision v2, A8', () => {
    const done = (key: string, end: number, refs: readonly string[]): SlotGroup => ({
      key,
      kind: 'hour',
      label: key,
      expected: refs.length,
      handedOver: refs.length,
      endMinutes: end,
      rows: refs.map((ref) => row(ref, { state: 'handed_over' })),
    });
    const DAY_BOARD: HandoverBoard = {
      ...BOARD,
      pickup: [done('h06', 420, ['TOT']), BOARD.pickup[0]!, done('h09', 600, ['LATER'])],
      clock: { minutes: 475, label: '7 h 55' },
    };
    const order = (element: HTMLElement): string[] =>
      [...element.querySelectorAll('[data-now], [data-finished], [data-slot]')].map(
        (node) => node.getAttribute('data-slot') ?? (node.hasAttribute('data-now') ? 'now' : 'fin'),
      );

    it('pose « Maintenant » entre les tranches et descend les terminées, repliées', async () => {
      const element: HTMLElement = (await mount(DAY_BOARD)).nativeElement;

      expect(order(element)).toEqual(['h07', 'now', 'h09', 'fin', 'h06']);
      expect(element.querySelector('[data-now]')?.textContent).toContain('Maintenant · 7 h 55');
      expect(element.querySelector('[data-slot="h06"]')?.textContent).toContain(
        '1 remise sur 1 · tout est parti',
      );
      expect(element.querySelector('[data-reference="TOT"]')).toBeNull();
    });

    it('déplie une tranche terminée, puis la replie', async () => {
      const fixture = await mount(DAY_BOARD);
      const element: HTMLElement = fixture.nativeElement;
      element.querySelector<HTMLElement>('[data-slot="h06"]')?.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(element.querySelector('[data-reference="TOT"]')).not.toBeNull();

      element.querySelector<HTMLElement>('[data-slot="h06"] button')?.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(element.querySelector('[data-reference="TOT"]')).toBeNull();
    });

    it('ouvre la tranche repliée qui porte une occurrence, et halo sur la courante', async () => {
      const fixture = await mount(DAY_BOARD);
      fixture.componentRef.setInput('matches', {
        ...NO_MATCHES,
        mode: 'search',
        references: new Set(['TOT']),
        current: 'TOT',
      });
      fixture.detectChanges();
      await fixture.whenStable();
      const card = (fixture.nativeElement as HTMLElement).querySelector('[data-hit-key="TOT"]');

      expect(card?.classList).toContain('is-match');
      expect(card?.classList).toContain('is-current');
    });

    it('dit le point de chaque ligne en « Tous les points »', async () => {
      const element: HTMLElement = (await mount(BOARD)).nativeElement;

      expect(
        element.querySelector('[data-reference="PRETE"] [data-row-point]')?.textContent?.trim(),
      ).toBe('Boutique');
    });
  });
});
