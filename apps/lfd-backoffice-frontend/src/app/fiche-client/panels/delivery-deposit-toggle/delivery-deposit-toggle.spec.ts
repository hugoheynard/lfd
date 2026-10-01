import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { AdminDeliveryDepositService } from '../../../comptes-clients/admin-delivery-deposit.service';
import { DeliveryDepositToggle } from './delivery-deposit-toggle';

interface Wire {
  readonly calls: string[];
  refuse: HttpErrorResponse | null;
  readonly emitted: boolean[];
}

async function boot(
  granted: readonly StaffPermission[],
  depositAllowed = false,
): Promise<{ fixture: ComponentFixture<DeliveryDepositToggle>; wire: Wire }> {
  const wire: Wire = { calls: [], refuse: null, emitted: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
      {
        provide: AdminDeliveryDepositService,
        useValue: {
          set: (companyId: string, addressId: string, value: boolean): Promise<void> => {
            wire.calls.push(`${companyId} ${addressId} ${String(value)}`);
            const refuse = wire.refuse;
            // Comme le réseau : la réponse arrive après un rendu, pas dans la même micro-tâche.
            return new Promise((resolve, reject) =>
              setTimeout(() => (refuse === null ? resolve() : reject(refuse))),
            );
          },
        } satisfies Partial<Record<keyof AdminDeliveryDepositService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(DeliveryDepositToggle);
  fixture.componentRef.setInput('companyId', 'cmp_1');
  fixture.componentRef.setInput('addressId', 'adr_1');
  fixture.componentRef.setInput('depositAllowed', depositAllowed);
  fixture.componentInstance.changed.subscribe((value) => wire.emitted.push(value));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, wire };
}

function box(fixture: ComponentFixture<DeliveryDepositToggle>): HTMLInputElement {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    '[data-deposit-allowed] input[type="checkbox"]',
  );
  if (input === null) {
    throw new Error('case introuvable');
  }
  return input;
}

async function settle(fixture: ComponentFixture<DeliveryDepositToggle>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('DeliveryDepositToggle', () => {
  it('sous delivery_procedures:write, cocher écrit par la route du staff et prévient la fiche', async () => {
    const { fixture, wire } = await boot(['delivery_procedures:write']);
    expect(box(fixture).checked).toBe(false);
    expect(box(fixture).disabled).toBe(false);

    box(fixture).click();
    await settle(fixture);

    expect(wire.calls).toEqual(['cmp_1 adr_1 true']);
    expect(wire.emitted).toEqual([true]);
    expect(box(fixture).checked).toBe(true);
  });

  it('sans le droit d’écrire, la case se lit et ne se règle pas', async () => {
    const { fixture, wire } = await boot(['delivery_procedures:read'], true);

    expect(box(fixture).checked).toBe(true);
    expect(box(fixture).disabled).toBe(true);
    expect(wire.calls).toEqual([]);
  });

  it('un refus s’affiche tel quel, et la case revient à ce qui est enregistré', async () => {
    const { fixture, wire } = await boot(['delivery_procedures:write']);
    wire.refuse = new HttpErrorResponse({
      status: 404,
      error: { message: 'Adresse de livraison introuvable.' },
    });

    box(fixture).click();
    await settle(fixture);

    const refusal = (fixture.nativeElement as HTMLElement).querySelector('[data-deposit-refusal]');
    expect(refusal?.textContent).toContain('Adresse de livraison introuvable.');
    expect(box(fixture).checked).toBe(false);
    expect(wire.emitted).toEqual([]);
  });
});
