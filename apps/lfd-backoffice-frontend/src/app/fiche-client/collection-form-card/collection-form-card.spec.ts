import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { CollectionForm } from '@lfd/contracts';
import { FoldListboxComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { BankAccountService } from '../bank-account/bank-account.service';
import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import {
  CollectionFormCard,
  collectionFormChoices,
  needsSiteMandate,
} from './collection-form-card';

interface Wire {
  readonly calls: string[];
  refuse: HttpErrorResponse | null;
}

async function boot(
  current: CollectionForm | null = null,
): Promise<{ fixture: ComponentFixture<CollectionFormCard>; wire: Wire }> {
  const wire: Wire = { calls: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AdminCompanyHierarchyService,
        useValue: {
          setCollectionForm: (id: string, form: CollectionForm): Promise<void> => {
            wire.calls.push(`${id} ${form}`);
            const refuse = wire.refuse;
            return refuse === null ? Promise.resolve() : Promise.reject(refuse);
          },
        } satisfies Partial<Record<keyof AdminCompanyHierarchyService, unknown>>,
      },
      {
        provide: BankAccountService,
        useValue: { read: () => Promise.resolve({ account: null }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CollectionFormCard);
  fixture.componentRef.setInput('companyId', 'site_1');
  fixture.componentRef.setInput('parent', {
    id: 'p1',
    enseigne: 'Alpes Chalets',
    status: 'active',
  });
  if (current !== null) {
    fixture.componentRef.setInput('current', current);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, wire };
}

async function pick(
  fixture: ComponentFixture<CollectionFormCard>,
  form: CollectionForm,
): Promise<void> {
  const listbox = fixture.debugElement.query(By.directive(FoldListboxComponent))
    .componentInstance as FoldListboxComponent<CollectionForm>;
  listbox.selectionChange.emit(form);
  await fixture.whenStable();
  fixture.detectChanges();
}

function host(fixture: ComponentFixture<CollectionFormCard>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('CollectionFormCard', () => {
  it('dit la conséquence de chacune des trois formes, au nom du principal', async () => {
    const { fixture } = await boot();
    const text = host(fixture).textContent ?? '';
    expect(host(fixture).querySelectorAll('[data-collection-form-consequence]')).toHaveLength(3);
    expect(text).toContain('facturation groupée');
    expect(text).toContain('Alpes Chalets');
  });

  it('pose la forme choisie et nomme le principal comme débiteur du mandat du site', async () => {
    const { fixture, wire } = await boot();
    await pick(fixture, 'own_mandate_principal_iban');
    expect(wire.calls).toEqual(['site_1 own_mandate_principal_iban']);
    expect(host(fixture).querySelector('[data-collection-form-debtor]')?.textContent).toContain(
      'Alpes Chalets',
    );
    expect(host(fixture).querySelector('app-bank-account-section')).toBeNull();
  });

  it('ouvre la saisie du RIB du site pour la forme « RIB propre »', async () => {
    const { fixture } = await boot();
    await pick(fixture, 'own_iban');
    expect(host(fixture).querySelector('app-bank-account-section')).not.toBeNull();
  });

  it('revient à l’état d’avant et affiche le refus du serveur', async () => {
    const { fixture, wire } = await boot();
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Ce compte n’est pas facturé à un compte principal.' },
    });
    await pick(fixture, 'own_iban');
    expect(host(fixture).querySelector('[data-collection-form-refusal]')).not.toBeNull();
    expect(host(fixture).querySelector('[data-collection-form-debtor]')).toBeNull();
  });
});

describe('collectionFormChoices / needsSiteMandate', () => {
  it('suit l’ordre du contrat, et seul le mandat du principal se passe du mandat du site', () => {
    expect(collectionFormChoices('X').map((c) => c.value)).toEqual([
      'principal_mandate',
      'own_mandate_principal_iban',
      'own_iban',
    ]);
    expect(needsSiteMandate('principal_mandate')).toBe(false);
    expect(needsSiteMandate('own_iban')).toBe(true);
    expect(needsSiteMandate(null)).toBe(false);
  });
});

describe('CollectionFormCard — la forme en vigueur', () => {
  it('part de la forme relue par la fiche', async () => {
    const { fixture } = await boot('own_iban');
    expect(host(fixture).querySelector('app-bank-account-section')).not.toBeNull();
  });
});
