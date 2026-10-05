import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { CreateSubAccountPayload, StaffPermission } from '@lfd/contracts';
import {
  CompanyIdentityFields,
  DeliveryAddressForm,
  EMPTY_COMPANY_IDENTITY_DRAFT,
  EMPTY_DELIVERY_DRAFT,
} from '@lfd/b2b-ui/company';
import { FoldInputComponent, FoldPanelRef, FoldViewToggleComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { AdminCompanyHierarchyService } from '../../../comptes-clients/admin-company-hierarchy.service';
import { NotifyService } from '../../../notify.service';
import { SubAccountPanel } from './sub-account-panel';

interface Wire {
  readonly sent: CreateSubAccountPayload[];
  refuse: HttpErrorResponse | null;
  readonly closed: (string | undefined)[];
}

function boot(granted: readonly StaffPermission[] = []): {
  fixture: ComponentFixture<SubAccountPanel>;
  wire: Wire;
} {
  const wire: Wire = { sent: [], refuse: null, closed: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: FoldPanelRef, useValue: new FoldPanelRef<string>(1, (r) => wire.closed.push(r)) },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
      { provide: NotifyService, useValue: { success: () => undefined } },
      {
        provide: AdminCompanyHierarchyService,
        useValue: {
          createSubAccount: (_parent: string, payload: CreateSubAccountPayload) => {
            wire.sent.push(payload);
            return wire.refuse === null ? Promise.resolve('child_1') : Promise.reject(wire.refuse);
          },
        } satisfies Partial<Record<keyof AdminCompanyHierarchyService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(SubAccountPanel);
  fixture.componentRef.setInput('data', {
    parentId: 'parent_1',
    parentName: 'Chalets du Lac',
    parentRaisonSociale: 'Chalets SAS',
    parentSiret: '73282932000074',
    parentVatNumber: 'FR12732829320',
    parentSiren: '732829320',
    globalWindowMode: 'deadline',
  });
  fixture.detectChanges();
  return { fixture, wire };
}

function host(fixture: ComponentFixture<SubAccountPanel>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function choose(fixture: ComponentFixture<SubAccountPanel>, kind: 'site' | 'entity'): void {
  const toggle = fixture.debugElement.query(By.directive(FoldViewToggleComponent))
    .componentInstance as FoldViewToggleComponent;
  toggle.value.set(kind);
  fixture.detectChanges();
}

function identityFields(fixture: ComponentFixture<SubAccountPanel>): CompanyIdentityFields | null {
  const found = fixture.debugElement.query(By.directive(CompanyIdentityFields));
  return found === null ? null : (found.componentInstance as CompanyIdentityFields);
}

function fillAddress(fixture: ComponentFixture<SubAccountPanel>): void {
  const form = fixture.debugElement.query(By.directive(DeliveryAddressForm))
    .componentInstance as DeliveryAddressForm;
  form.value.set({
    ...EMPTY_DELIVERY_DRAFT,
    ligne1: '12 route des Cimes',
    codePostal: '73120',
    ville: 'Courchevel',
    noContact: true,
  });
  fixture.detectChanges();
}

function nameSite(fixture: ComponentFixture<SubAccountPanel>, name: string): void {
  const input = fixture.debugElement.query(By.directive(FoldInputComponent))
    .componentInstance as FoldInputComponent;
  input.value.set(name);
  fixture.detectChanges();
}

function tick(fixture: ComponentFixture<SubAccountPanel>, aspect: string): void {
  host(fixture)
    .querySelector<HTMLInputElement>(`[data-follow="${aspect}"] input[type="checkbox"]`)
    ?.click();
  fixture.detectChanges();
}

function submitButton(fixture: ComponentFixture<SubAccountPanel>): HTMLButtonElement {
  const buttons = host(fixture).querySelectorAll<HTMLButtonElement>('fold-panel-footer button');
  return buttons.item(buttons.length - 1);
}

async function settle(fixture: ComponentFixture<SubAccountPanel>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('SubAccountPanel', () => {
  it('rien à saisir avant d’avoir choisi : site, ou entité distincte', () => {
    const { fixture } = boot();
    expect(identityFields(fixture)).toBeNull();
    expect(host(fixture).querySelector('lfd-delivery-address-form')).toBeNull();
    expect(host(fixture).querySelector('[data-issue]')?.textContent).toContain('Choisissez');
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('un site : aucun champ d’identité légale, celle du principal en lecture', () => {
    const { fixture } = boot();
    choose(fixture, 'site');

    expect(identityFields(fixture)).toBeNull();
    const billed = host(fixture).querySelector('[data-billed-as]')?.textContent ?? '';
    expect(billed).toContain('Facturé au nom de Chalets SAS');
    expect(billed).toContain('TVA FR12732829320');
  });

  it('un site part sans identité, en suivant la facturation', async () => {
    const { fixture, wire } = boot();
    choose(fixture, 'site');
    nameSite(fixture, 'Chalet des Cimes');
    fillAddress(fixture);
    tick(fixture, 'contacts');
    submitButton(fixture).click();
    await settle(fixture);

    expect(wire.sent[0]).toMatchObject({
      enseigne: 'Chalet des Cimes',
      raisonSociale: '',
      siret: '',
      siren: '',
      vatNumber: '',
      formeJuridique: '',
      follows: ['billing', 'contacts'],
    });
    expect(wire.closed).toEqual(['child_1']);
  });

  it('une entité distincte : identité complète, SIREN du principal proposé, SIRET exigé', () => {
    const { fixture } = boot();
    choose(fixture, 'entity');
    const fields = identityFields(fixture);
    expect(fields?.value()).toEqual({ ...EMPTY_COMPANY_IDENTITY_DRAFT, siren: '732829320' });

    fields?.value.update((draft) => ({
      ...draft,
      enseigne: 'Club Med Tignes',
      raisonSociale: 'CMT SAS',
    }));
    fillAddress(fixture);
    expect(host(fixture).querySelector('[data-issue]')?.textContent).toContain('SIRET');
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('une entité distincte ne suit pas la facturation', async () => {
    const { fixture, wire } = boot();
    choose(fixture, 'entity');
    identityFields(fixture)?.value.update((draft) => ({
      ...draft,
      enseigne: 'Club Med Tignes',
      raisonSociale: 'CMT SAS',
      siret: '73282932000074',
    }));
    fillAddress(fixture);
    submitButton(fixture).click();
    await settle(fixture);

    expect(wire.sent[0]?.follows).toEqual([]);
    expect(wire.sent[0]?.siret).toBe('73282932000074');
  });

  it('la mercuriale n’est pas proposée sans le droit de tarification (Q9)', () => {
    const { fixture } = boot(['b2b_pricing:read']);
    choose(fixture, 'site');
    expect(host(fixture).querySelector('[data-follow="pricing"]')).toBeNull();
  });

  it('la mercuriale est proposée, non cochée, avec b2b_pricing:write — et part si cochée', async () => {
    const { fixture, wire } = boot(['b2b_pricing:write']);
    choose(fixture, 'site');
    expect(
      host(fixture).querySelector<HTMLInputElement>(
        '[data-follow="pricing"] input[type="checkbox"]',
      )?.checked,
    ).toBe(false);

    nameSite(fixture, 'Chalet des Cimes');
    fillAddress(fixture);
    tick(fixture, 'pricing');
    submitButton(fixture).click();
    await settle(fixture);

    expect(wire.sent[0]?.follows).toEqual(['billing', 'pricing']);
  });

  it('un refus reste dans le panneau, tel quel, et le panneau reste ouvert', async () => {
    const { fixture, wire } = boot();
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Chalets du Lac est lui-même un sous-compte.' },
    });
    choose(fixture, 'site');
    nameSite(fixture, 'Chalet des Cimes');
    fillAddress(fixture);
    submitButton(fixture).click();
    await settle(fixture);

    expect(host(fixture).querySelector('[data-refusal]')?.textContent).toContain(
      'Chalets du Lac est lui-même un sous-compte.',
    );
    expect(wire.closed).toEqual([]);
  });
});
