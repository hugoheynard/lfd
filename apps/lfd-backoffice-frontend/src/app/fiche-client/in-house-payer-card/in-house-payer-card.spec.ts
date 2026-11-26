import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { InHousePayerView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { InHousePayerCard } from './in-house-payer-card';
import { InHousePayerService } from './in-house-payer.service';

/** Le service doublé : il garde l'état, compte les clés, et peut refuser. */
class FakeInHousePayers {
  view: InHousePayerView = { companyId: 'c1', inHouse: false, declaredAt: null };
  readonly keys: string[] = [];
  refusal: HttpErrorResponse | null = null;

  read(): Promise<InHousePayerView> {
    return Promise.resolve(this.view);
  }

  set(companyId: string, inHouse: boolean, intentKey: string): Promise<void> {
    this.keys.push(intentKey);
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.view = {
      companyId,
      inHouse,
      declaredAt: inHouse ? new Date(0).toISOString() : null,
    };
    return Promise.resolve();
  }
}

class FakePermissions {
  constructor(private readonly granted: readonly StaffPermission[]) {}
  can(permission: StaffPermission): boolean {
    return this.granted.includes(permission);
  }
}

async function mount(
  granted: readonly StaffPermission[],
  api = new FakeInHousePayers(),
): Promise<{ fixture: ComponentFixture<InHousePayerCard>; api: FakeInHousePayers }> {
  TestBed.configureTestingModule({
    imports: [InHousePayerCard],
    providers: [
      { provide: InHousePayerService, useValue: api },
      { provide: PermissionsStore, useValue: new FakePermissions(granted) },
    ],
  });
  const fixture = TestBed.createComponent(InHousePayerCard);
  fixture.componentRef.setInput('companyId', 'c1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

function query(fixture: ComponentFixture<InHousePayerCard>, selector: string): HTMLElement | null {
  const root: HTMLElement = fixture.nativeElement;
  return root.querySelector(selector);
}

describe('InHousePayerCard', () => {
  it('sans le droit du geste : l’état se lit, aucun bouton', async () => {
    const { fixture } = await mount(['b2b_companies:read']);

    expect(query(fixture, '[data-in-house-state]')?.textContent).toContain('facturé normalement');
    expect(query(fixture, '[data-in-house-toggle]')).toBeNull();
  });

  it('avec le droit : marquer passe par la confirmation, puis relit l’état', async () => {
    const { fixture, api } = await mount(['b2b_in_house_payers:write']);

    query(fixture, '[data-in-house-toggle]')?.click();
    fixture.detectChanges();
    expect(query(fixture, '[data-in-house-confirm]')).not.toBeNull();

    await fixture.componentInstance['apply']();
    fixture.detectChanges();

    expect(api.keys).toHaveLength(1);
    expect(query(fixture, '[data-in-house-state]')?.textContent).toContain('un de nos restaurants');
  });

  it('un refus reste à l’écran avec les mots du serveur, et le réessai garde la clé', async () => {
    const api = new FakeInHousePayers();
    api.refusal = new HttpErrorResponse({
      status: 409,
      error: { message: 'Ce compte est un organisme public.' },
    });
    const { fixture } = await mount(['b2b_in_house_payers:write'], api);

    await fixture.componentInstance['apply']();
    await fixture.componentInstance['apply']();
    fixture.detectChanges();

    expect(query(fixture, '[data-in-house-refusal]')?.textContent).toContain('organisme public');
    expect(api.keys[0]).toBe(api.keys[1]);
  });
});
