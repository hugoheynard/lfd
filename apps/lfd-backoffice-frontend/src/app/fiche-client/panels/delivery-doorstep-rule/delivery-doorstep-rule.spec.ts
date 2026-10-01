import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { DoorstepRule, StaffPermission } from '@lfd/contracts';
import { FoldListboxComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { AdminDeliveryDoorstepRuleService } from '../../../comptes-clients/admin-delivery-doorstep-rule.service';
import { DeliveryDoorstepRule } from './delivery-doorstep-rule';

interface Wire {
  rule: DoorstepRule | null;
  readonly writes: string[];
  refuse: HttpErrorResponse | null;
}

async function boot(
  granted: readonly StaffPermission[],
  rule: DoorstepRule | null = null,
): Promise<{ fixture: ComponentFixture<DeliveryDoorstepRule>; wire: Wire }> {
  const wire: Wire = { rule, writes: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
      {
        provide: AdminDeliveryDoorstepRuleService,
        useValue: {
          read: () => Promise.resolve({ rule: wire.rule }),
          set: (companyId: string, addressId: string, value: DoorstepRule | null) => {
            wire.writes.push(`${companyId} ${addressId} ${String(value)}`);
            const refuse = wire.refuse;
            return refuse === null ? Promise.resolve() : Promise.reject(refuse);
          },
        } satisfies Partial<Record<keyof AdminDeliveryDoorstepRuleService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(DeliveryDoorstepRule);
  fixture.componentRef.setInput('companyId', 'cmp_1');
  fixture.componentRef.setInput('addressId', 'adr_1');
  await settle(fixture);
  return { fixture, wire };
}

async function settle(fixture: ComponentFixture<DeliveryDoorstepRule>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function listbox(fixture: ComponentFixture<DeliveryDoorstepRule>) {
  const found = fixture.debugElement.query(By.css('[data-doorstep-rule]'));
  expect(found.componentInstance).toBeInstanceOf(FoldListboxComponent);
  return found;
}

const valueOf = (fixture: ComponentFixture<DeliveryDoorstepRule>): unknown =>
  (listbox(fixture).componentInstance as FoldListboxComponent<string>).value();

describe('DeliveryDoorstepRule (B3 bis)', () => {
  it('une adresse sans règle hérite du réglage de livraison', async () => {
    const { fixture } = await boot(['delivery_procedures:write']);

    expect(valueOf(fixture)).toBe('inherit');
  });

  it('sous delivery_procedures:write, choisir écrit la règle ; « comme le réglage » écrit `null`', async () => {
    const { fixture, wire } = await boot(['delivery_procedures:write'], 'deposit');
    expect(valueOf(fixture)).toBe('deposit');

    listbox(fixture).triggerEventHandler('selectionChange', 'bring_back');
    await settle(fixture);
    listbox(fixture).triggerEventHandler('selectionChange', 'inherit');
    await settle(fixture);

    expect(wire.writes).toEqual(['cmp_1 adr_1 bring_back', 'cmp_1 adr_1 null']);
  });

  it('sans le droit d’écrire, elle se lit sans se régler', async () => {
    const { fixture, wire } = await boot(['delivery_procedures:read'], 'bring_back');

    expect((listbox(fixture).componentInstance as FoldListboxComponent<string>).disabled()).toBe(
      true,
    );
    listbox(fixture).triggerEventHandler('selectionChange', 'deposit');
    await settle(fixture);
    expect(wire.writes).toEqual([]);
  });

  it('un refus s’affiche tel quel et le choix revient à ce qui est enregistré', async () => {
    const { fixture, wire } = await boot(['delivery_procedures:write']);
    wire.refuse = new HttpErrorResponse({
      status: 404,
      error: { message: 'Adresse introuvable.' },
    });

    listbox(fixture).triggerEventHandler('selectionChange', 'deposit');
    await settle(fixture);

    expect(valueOf(fixture)).toBe('inherit');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-doorstep-refusal]')?.textContent,
    ).toContain('Adresse introuvable.');
  });
});
