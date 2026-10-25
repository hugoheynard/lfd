import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CustomerNudgesView } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../../commandes/orders.service';
import { NotifyService } from '../../notify.service';

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
    roundLine: null,
    departedAt: null,
    loaded: false,
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

interface World {
  readonly canWrite?: boolean;
  readonly remindHandover?: (id: string) => Promise<void>;
  readonly warnOfDelay?: (id: string) => Promise<void>;
  readonly nudges?: CustomerNudgesView | null;
}

/** Les relances lues : délais à 0, aucune trace. */
const NO_NUDGES: CustomerNudgesView = {
  date: '2026-09-11',
  pickupReminderDelayMinutes: 0,
  delayWarningDelayMinutes: 0,
  orders: [],
};

const notified = { success: vi.fn(), error: vi.fn() };

async function mount(board: HandoverBoard, world: World = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AdminOrdersService,
        useValue: {
          remindHandover: world.remindHandover ?? (() => Promise.resolve()),
          warnOfDelay: world.warnOfDelay ?? (() => Promise.resolve()),
        },
      },
      { provide: NotifyService, useValue: notified },
      { provide: PermissionsStore, useValue: { can: (): boolean => world.canWrite ?? true } },
    ],
  });
  const fixture = TestBed.createComponent(HandoverColumn);
  fixture.componentRef.setInput('board', board);
  fixture.componentRef.setInput('showLinks', true);
  fixture.componentRef.setInput('nudges', world.nudges === undefined ? NO_NUDGES : world.nudges);
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

/** Hugo, 2026-10-25 : « on devrait avoir plus d'info sur les cartes livraison ». */
describe('HandoverColumn — la carte de livraison', () => {
  function deliveryBoard(rows: readonly SlotRow[]): HandoverBoard {
    return {
      ...BOARD,
      delivery: [
        {
          key: 'd07:30',
          kind: 'deadline',
          label: 'Avant 7 h 30',
          expected: rows.length,
          handedOver: 0,
          endMinutes: 450,
          rows,
        },
      ],
    };
  }

  async function mountDelivery(rows: readonly SlotRow[]): Promise<HTMLElement> {
    const fixture = await mount(deliveryBoard(rows));
    fixture.componentRef.setInput('method', 'delivery');
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: HTMLElement, selector: string) =>
    el.querySelector(selector)?.textContent?.trim();

  it('dit la tournée, le rang et l’état chargée', async () => {
    const el = await mountDelivery([
      row('LIV', {
        method: 'delivery',
        time: 'avant 7 h 30',
        roundLine: 'Kangoo blanc · arrêt 3 · départ prévu 6 h 45',
        loaded: true,
      }),
    ]);
    expect(text(el, '[data-reference="LIV"] [data-row-round]')).toBe(
      'Kangoo blanc · arrêt 3 · départ prévu 6 h 45',
    );
    expect(text(el, '[data-reference="LIV"] .sub')).toBe('Chargée');
    expect(text(el, '[data-reference="LIV"] .time')).toBe('avant 7 h 30');
  });

  it('dit « Partie à » une fois la tournée partie, et « Pas encore dans une tournée » sinon', async () => {
    const el = await mountDelivery([
      row('PARTIE', {
        method: 'delivery',
        roundLine: 'Kangoo blanc · arrêt 1',
        departedAt: '7 h 02',
        loaded: true,
      }),
      row('SEULE', { method: 'delivery', roundLine: 'Pas encore dans une tournée' }),
    ]);
    expect(text(el, '[data-reference="PARTIE"] .sub')).toBe('Partie à 7 h 02');
    expect(text(el, '[data-reference="SEULE"] [data-row-round]')).toBe(
      'Pas encore dans une tournée',
    );
    expect(text(el, '[data-reference="SEULE"] .sub')).toBe('Prête');
  });

  describe('les relances d’un retrait en retard (Supervision, Hugo le 2026-10-25)', () => {
    const absent = row('ABSENT', {
      state: 'overdue',
      readyAt: '6 h 48',
      overdueMinutes: 20,
      overdueCause: 'customer',
    });
    const board: HandoverBoard = {
      ...BOARD,
      pickup: [{ ...BOARD.pickup[0]!, rows: [...BOARD.pickup[0]!.rows, absent] }],
    };
    const button = (el: HTMLElement, ref: string, kind: 'remind' | 'warn') =>
      el.querySelector<HTMLButtonElement>(`[data-reference="${ref}"] button[data-nudge="${kind}"]`);
    const sentLine = (el: HTMLElement, ref: string): string | undefined =>
      el.querySelector(`[data-reference="${ref}"] [data-nudge-sent]`)?.textContent?.trim();

    it('prête et client pas venu : « Rappel au client » ; pas prête : « Avertir le client »', async () => {
      const el: HTMLElement = (await mount(board)).nativeElement;

      expect(button(el, 'ABSENT', 'remind')?.textContent).toContain('Rappel au client');
      expect(button(el, 'ABSENT', 'warn')).toBeNull();
      expect(button(el, 'TARD', 'warn')?.textContent).toContain('Avertir le client');
      expect(button(el, 'TARD', 'remind')).toBeNull();
      expect(button(el, 'PRETE', 'remind')).toBeNull();
    });

    it('n’apparaît qu’après le délai réglé depuis la fin du créneau', async () => {
      const el: HTMLElement = (
        await mount(board, {
          nudges: { ...NO_NUDGES, pickupReminderDelayMinutes: 30, delayWarningDelayMinutes: 55 },
        })
      ).nativeElement;

      expect(button(el, 'ABSENT', 'remind')).toBeNull();
      expect(button(el, 'TARD', 'warn')).not.toBeNull();
    });

    it('déjà fait : la trace remplace le bouton, même sans le droit d’écrire', async () => {
      const el: HTMLElement = (
        await mount(board, {
          canWrite: false,
          nudges: {
            ...NO_NUDGES,
            orders: [
              {
                orderId: 'o-ABSENT',
                pickupReminder: { at: '2026-09-11T06:20:00.000Z', byName: 'Léa Martin' },
                delayWarning: null,
              },
            ],
          },
        })
      ).nativeElement;

      expect(sentLine(el, 'ABSENT')).toMatch(/^Rappel envoyé le .+ par Léa Martin$/u);
      expect(button(el, 'ABSENT', 'remind')).toBeNull();
    });

    it('🔴 sans `b2b_orders:write`, aucun bouton ne promet un 403', async () => {
      const el: HTMLElement = (await mount(board, { canWrite: false })).nativeElement;

      expect(button(el, 'ABSENT', 'remind')).toBeNull();
      expect(button(el, 'TARD', 'warn')).toBeNull();
    });

    it('sans lecture des relances, aucun bouton : un second envoi n’est pas à risquer', async () => {
      const el: HTMLElement = (await mount(board, { nudges: null })).nativeElement;

      expect(button(el, 'ABSENT', 'remind')).toBeNull();
    });

    it('envoie le rappel, le dit, demande la relecture des traces, et ne se réarme pas', async () => {
      const sent: string[] = [];
      const fixture = await mount(board, {
        remindHandover: (id) => {
          sent.push(id);
          return Promise.resolve();
        },
      });
      let reread = 0;
      fixture.componentInstance.nudged.subscribe(() => {
        reread += 1;
      });
      const el: HTMLElement = fixture.nativeElement;

      button(el, 'ABSENT', 'remind')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(sent).toEqual(['o-ABSENT']);
      expect(reread).toBe(1);
      expect(notified.success).toHaveBeenCalledWith('Rappel envoyé pour ABSENT.');
      expect(button(el, 'ABSENT', 'remind')).toBeNull();
      expect(sentLine(el, 'ABSENT')).toBe('Rappel envoyé');
    });

    it('avertit le client du retard', async () => {
      const warned: string[] = [];
      const fixture = await mount(board, {
        warnOfDelay: (id) => {
          warned.push(id);
          return Promise.resolve();
        },
      });
      const el: HTMLElement = fixture.nativeElement;

      button(el, 'TARD', 'warn')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(warned).toEqual(['o-TARD']);
      expect(notified.success).toHaveBeenCalledWith('Client averti du retard de TARD.');
      expect(sentLine(el, 'TARD')).toBe('Client averti');
    });

    it('un échec est dit, et le bouton reste', async () => {
      const fixture = await mount(board, { remindHandover: () => Promise.reject(new Error('x')) });
      const el: HTMLElement = fixture.nativeElement;

      button(el, 'ABSENT', 'remind')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(notified.error).toHaveBeenCalled();
      expect(button(el, 'ABSENT', 'remind')).not.toBeNull();
    });
  });
});
