import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  CycleStatementOrderView,
  CycleStatementTotalsView,
  CycleStatementView,
  StaffPermission,
  StatementCycleView,
  StatementCyclesView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { CycleStatementService } from '../cycle-statement.service';
import { CycleStatementCard } from './cycle-statement-card';

/** Des dates seulement affichées : aucune n'est comparée à l'horloge. */
const CURRENT: StatementCycleView = {
  month: '2026-10',
  startsAt: '2026-09-30T22:00:00.000Z',
  closesAt: '2026-10-31T23:00:00.000Z',
  inProgress: true,
};
const CYCLES: StatementCyclesView = {
  cycles: [
    CURRENT,
    {
      month: '2026-09',
      startsAt: '2026-08-31T22:00:00.000Z',
      closesAt: '2026-09-30T22:00:00.000Z',
      inProgress: false,
    },
  ],
};

const ORDER: CycleStatementOrderView = {
  id: 'o1',
  orderNumber: 'CMD-1',
  placedAt: '2026-09-12T08:00:00.000Z',
  companyId: 'c1',
  siteName: 'Boulangerie du Port',
  paidBy: null,
  subtotalCents: 10_000,
  discountCents: 500,
  voucherDiscountCents: 0,
  htCents: 9_500,
  deliveryFeeCents: 1_500,
  lateFeeCents: 0,
  vatShares: [{ rate: 5.5, amountCents: 523 }],
  vatVentilated: true,
  vatCents: 523,
  totalCents: 11_523,
};

function totalsOf(unventilatedVatCents = 0, count = 1): CycleStatementTotalsView {
  return {
    orderCount: count,
    subtotalCents: 10_000 * count,
    discountCents: 500 * count,
    voucherDiscountCents: 0,
    htCents: 9_500 * count,
    deliveryFeeCents: 1_500 * count,
    lateFeeCents: 0,
    vatByRate: [{ rate: 5.5, amountCents: 523 * count }],
    unventilatedVatCents,
    vatCents: 523 * count + unventilatedVatCents,
    totalCents: 11_523 * count + unventilatedVatCents,
  };
}

function statementOf(month: string, unventilatedVatCents = 0): CycleStatementView {
  return {
    companyId: 'c1',
    companyName: 'Boulangerie du Port',
    cycle: CYCLES.cycles.find((cycle) => cycle.month === month) ?? CURRENT,
    provisional: true,
    scope: 'Périmètre : commandes passées au compte. Hors commandes payées par carte.',
    groups: [
      {
        companyId: 'c1',
        label: 'Boulangerie du Port',
        ownOrders: true,
        orders: [ORDER],
        totals: totalsOf(unventilatedVatCents),
      },
    ],
    totals: totalsOf(unventilatedVatCents),
    selfPayingEntities: [],
  };
}

/** Un principal, un chalet suivi, et une entité qui règle seule. */
function payerStatementOf(month: string): CycleStatementView {
  const chalet: CycleStatementOrderView = {
    ...ORDER,
    id: 'o2',
    orderNumber: 'CMD-2',
    companyId: 'chalet',
    siteName: 'Chalet Edelweiss',
  };
  return {
    ...statementOf(month),
    groups: [
      ...statementOf(month).groups,
      {
        companyId: 'chalet',
        label: 'Chalet Edelweiss',
        ownOrders: false,
        orders: [chalet],
        totals: totalsOf(),
      },
    ],
    totals: totalsOf(0, 2),
    selfPayingEntities: [{ companyId: 'club', name: 'Club Med Tignes' }],
  };
}

interface Wire {
  readonly asked: string[];
  unventilated: number;
  /** Remplace le relevé simple. */
  view: ((month: string) => CycleStatementView) | null;
}

function boot(permissions: readonly StaffPermission[]): {
  fixture: ComponentFixture<CycleStatementCard>;
  wire: Wire;
} {
  const wire: Wire = { asked: [], unventilated: 0, view: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      {
        provide: CycleStatementService,
        useValue: {
          cycles: () => Promise.resolve(CYCLES),
          statement: (_id: string, month: string) => {
            wire.asked.push(month);
            return Promise.resolve(wire.view?.(month) ?? statementOf(month, wire.unventilated));
          },
        } satisfies Partial<Record<keyof CycleStatementService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(CycleStatementCard);
  fixture.componentRef.setInput('companyId', 'c1');
  fixture.detectChanges();
  return { fixture, wire };
}

function text(fixture: ComponentFixture<CycleStatementCard>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

async function settle(fixture: ComponentFixture<CycleStatementCard>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('CycleStatementCard', () => {
  it('ouvre sur le cycle en cours, et le dit provisoire avec son périmètre', async () => {
    const { fixture, wire } = boot(['b2b_companies:read']);
    await settle(fixture);

    expect(wire.asked).toEqual(['2026-10']);
    expect(text(fixture)).toContain('Relevé provisoire');
    expect(text(fixture)).toContain('Hors commandes payées par carte');
    expect(text(fixture)).toContain('en cours, non clos');
  });

  it('montre la TVA par taux, le TTC et la commande', async () => {
    const { fixture } = boot(['b2b_companies:read']);
    await settle(fixture);

    expect(text(fixture)).toContain('TVA 5,5 %');
    expect(text(fixture)).toContain('CMD-1');
    expect(text(fixture).replace(/\s/gu, '')).toContain('115,23€');
  });

  it('ne montre la ligne « TVA non ventilée » que si elle existe', async () => {
    const plain = boot(['b2b_companies:read']);
    await settle(plain.fixture);
    expect(
      (plain.fixture.nativeElement as HTMLElement).querySelector('[data-statement-unventilated]'),
    ).toBeNull();

    const legacy = boot(['b2b_companies:read']);
    legacy.wire.unventilated = 220;
    await settle(legacy.fixture);
    expect(
      (legacy.fixture.nativeElement as HTMLElement).querySelector('[data-statement-unventilated]'),
    ).not.toBeNull();
  });

  it('réserve l’export à la comptabilité', async () => {
    const reader = boot(['b2b_companies:read']);
    await settle(reader.fixture);
    expect(
      (reader.fixture.nativeElement as HTMLElement).querySelector('[data-statement-export]'),
    ).toBeNull();

    const accountant = boot(['b2b_accounting:read']);
    await settle(accountant.fixture);
    expect(
      (accountant.fixture.nativeElement as HTMLElement).querySelector('[data-statement-export]'),
    ).not.toBeNull();
  });

  it('montre un bloc par site avec son sous-total, le total payé, et les entités à part', async () => {
    const { fixture, wire } = boot(['b2b_companies:read']);
    wire.view = payerStatementOf;
    await settle(fixture);

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('[data-statement-group]')).toHaveLength(2);
    expect(text(fixture)).toContain('Chalet Edelweiss');
    expect(text(fixture)).toContain('Boulangerie du Port — commandes propres');
    expect(
      host.querySelector('[data-statement-grand-total]')?.textContent?.replace(/\s/gu, ''),
    ).toContain('230,46€');
    const entity = host.querySelector<HTMLAnchorElement>('[data-statement-self-paying] a');
    expect(entity?.textContent).toContain('Club Med Tignes');
    expect(entity?.getAttribute('href')).toBe('/comptes-clients/club/facturation');
  });

  it('nomme le principal sur le relevé d’un site qui le suivait', async () => {
    const plain = boot(['b2b_companies:read']);
    await settle(plain.fixture);
    expect(
      (plain.fixture.nativeElement as HTMLElement).querySelector('[data-statement-paid-by]'),
    ).toBeNull();

    const site = boot(['b2b_companies:read']);
    site.wire.view = (month) => {
      const base = statementOf(month);
      const paidBy = { companyId: 'alpes', name: 'Alpes Chalets' };
      return {
        ...base,
        groups: base.groups.map((group) => ({
          ...group,
          orders: group.orders.map((order) => ({ ...order, paidBy })),
        })),
      };
    };
    await settle(site.fixture);
    expect(
      (site.fixture.nativeElement as HTMLElement).querySelector('[data-statement-paid-by]')
        ?.textContent,
    ).toContain('Alpes Chalets');
    expect(text(site.fixture)).toContain('payé par Alpes Chalets');
  });
});
