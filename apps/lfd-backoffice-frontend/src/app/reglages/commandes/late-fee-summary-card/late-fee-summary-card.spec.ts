import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { OrderLateFeeView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderLateFeeService } from '../../../comptabilite/order-late-fee/order-late-fee.service';
import { LateFeeSummaryCard } from './late-fee-summary-card';

/**
 * La surtaxe **en lecture** sur la page de l'heure limite (Hugo, 2026-10-21) :
 * elle garde son droit, `b2b_late_fee`, et se règle en Comptabilité.
 */
async function mount(
  permissions: readonly StaffPermission[],
  setting: OrderLateFeeView,
): Promise<{ fixture: ComponentFixture<LateFeeSummaryCard>; reads: () => number }> {
  let reads = 0;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [LateFeeSummaryCard],
    providers: [
      provideRouter([]),
      {
        provide: OrderLateFeeService,
        useValue: {
          read: (): Promise<OrderLateFeeView> => {
            reads += 1;
            return Promise.resolve(setting);
          },
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(LateFeeSummaryCard);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, reads: () => reads };
}

const root = (fixture: ComponentFixture<LateFeeSummaryCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const FEE: OrderLateFeeView = { fee: { mode: 'amount', cents: 1500 }, vatRatePercent: 5.5 };

describe('LateFeeSummaryCard', () => {
  it('sans droit de lecture, le dit et ne lit rien', async () => {
    const { fixture, reads } = await mount([], FEE);

    expect(root(fixture).querySelector('[data-late-fee-forbidden]')).not.toBeNull();
    expect(root(fixture).querySelector('[data-late-fee-value]')).toBeNull();
    expect(reads()).toBe(0);
  });

  it('affiche le montant et le taux en lecture, sans geste sans le droit d’écriture', async () => {
    const { fixture } = await mount(['b2b_late_fee:read'], FEE);

    const text = root(fixture).querySelector('[data-late-fee-value]')?.textContent ?? '';
    expect(text).toContain('15,00');
    expect(text).toContain('HT');
    expect(text).toContain('5,5 %');
    expect(root(fixture).querySelector('[data-late-fee-edit]')).toBeNull();
    expect(root(fixture).querySelector('input, fold-listbox')).toBeNull();
  });

  it('dit « aucune » quand aucune surtaxe n’est posée', async () => {
    const { fixture } = await mount(['b2b_late_fee:read'], null);

    expect(root(fixture).querySelector('[data-late-fee-none]')).not.toBeNull();
  });

  it('renvoie à la Comptabilité sous `b2b_late_fee:write`', async () => {
    const { fixture } = await mount(['b2b_late_fee:read', 'b2b_late_fee:write'], FEE);

    const link = root(fixture).querySelector('[data-late-fee-edit]');
    expect(link?.getAttribute('href')).toBe('/comptabilite/surtaxe-de-retard');
  });
});
