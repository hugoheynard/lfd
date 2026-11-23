import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { BudgetCommitmentRequirementsView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { AdminOrdersService } from '../orders.service';
import {
  OrderBudgetCommitmentCard,
  type BudgetCommitmentOrder,
} from './order-budget-commitment-card';

const PUBLIC: BudgetCommitmentRequirementsView = {
  payerCompanyId: 'cmp_army',
  publicPayer: true,
  commitmentRequired: true,
  serviceCodeRequired: false,
  defaultServiceCode: 'SRV-01',
  currentCommitment: null,
};

const PRIVATE: BudgetCommitmentRequirementsView = {
  ...PUBLIC,
  payerCompanyId: 'cmp_cafe',
  publicPayer: false,
  commitmentRequired: false,
  defaultServiceCode: '',
  currentCommitment: null,
};

const ORDER: BudgetCommitmentOrder = {
  id: 'ord_1',
  orderNumber: 'CMD-7',
  companyId: 'cmp_army',
  settlement: 'account',
};

async function render(
  order: BudgetCommitmentOrder,
  read: () => Promise<BudgetCommitmentRequirementsView>,
): Promise<{ fixture: ComponentFixture<OrderBudgetCommitmentCard>; asked: string[] }> {
  const asked: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AdminOrdersService,
        useValue: {
          budgetCommitmentRequirements: (companyId: string) => {
            asked.push(companyId);
            return read();
          },
        } satisfies Pick<AdminOrdersService, 'budgetCommitmentRequirements'>,
      },
      { provide: FoldPanelHostService, useValue: {} },
    ],
  });
  const fixture = TestBed.createComponent(OrderBudgetCommitmentCard);
  fixture.componentRef.setInput('order', order);
  for (let pass = 0; pass < 3; pass += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  return { fixture, asked };
}

const host = (fixture: ComponentFixture<OrderBudgetCommitmentCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('OrderBudgetCommitmentCard', () => {
  it('un payeur public : le numéro, le code, et « Corriger l’engagement »', async () => {
    const { fixture } = await render(
      { ...ORDER, budgetCommitment: { number: '1300012345', serviceCode: 'SRV-01' } },
      () => Promise.resolve(PUBLIC),
    );

    const card = host(fixture).querySelector('[data-order-budget-commitment]');
    expect(card?.querySelector('[data-budget-commitment-number]')?.textContent).toContain(
      '1300012345',
    );
    expect(card?.querySelector('[data-budget-commitment-service]')?.textContent).toContain(
      'SRV-01',
    );
    expect(card?.querySelector('[data-budget-commitment-correct]')).not.toBeNull();
  });

  it('un payeur privé sans engagement : rien', async () => {
    const { fixture } = await render({ ...ORDER, companyId: 'cmp_cafe' }, () =>
      Promise.resolve(PRIVATE),
    );

    expect(host(fixture).querySelector('[data-order-budget-commitment]')).toBeNull();
  });

  it('une commande qui ne part pas au compte ne lit pas le payeur', async () => {
    const { fixture, asked } = await render({ ...ORDER, settlement: 'paid' }, () =>
      Promise.resolve(PUBLIC),
    );

    expect(asked).toEqual([]);
    expect(host(fixture).querySelector('[data-order-budget-commitment]')).toBeNull();
  });

  it('un payeur illisible : l’échec est dit, la correction n’est pas proposée', async () => {
    const { fixture } = await render(ORDER, () => Promise.reject(new Error('503')));

    expect(host(fixture).querySelector('[data-budget-commitment-unread]')).not.toBeNull();
    expect(host(fixture).querySelector('[data-budget-commitment-correct]')).toBeNull();
  });
});
