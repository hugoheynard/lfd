import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PromotionAudienceTargetView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AdminCompany } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { PromotionAudienceTree } from './promotion-audience-tree';

function company(overrides: Partial<AdminCompany> = {}): AdminCompany {
  return {
    id: 'c1',
    reference: 'C-000123',
    raisonSociale: 'Boulangerie Périn',
    enseigne: 'Le Fournil du Coin',
    formeJuridique: 'SARL',
    siret: '81234567800019',
    siren: '',
    vatNumber: '',
    status: 'active',
    grantedTerms: [],
    requestedTerm: null,
    directDebitBlocked: false,
    primaryContact: {
      id: null,
      // L'API renvoie le rôle du contact ; la fixture le portait pas.
      role: null,
      firstName: 'Claire',
      lastName: 'Martin',
      fonction: '',
      email: 'claire@fournil.fr',
      phone: '',
    },
    owner: { firstName: 'Julien', lastName: 'Deschamps', email: 'julien@fournil.fr' },
    kbis: null,
    hasOpenSupportRequest: false,
    parent: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    declaredVia: null,
    piecesReached: [],
    archivedAt: null,
    activatedAt: null,
    warnings: [],
    ...overrides,
  };
}

/** La liste des comptes clients, servie ou refusée selon le test. */
class FakeCompanies {
  answer: () => Promise<readonly AdminCompany[]> = () => Promise.resolve([]);
  list(): Promise<readonly AdminCompany[]> {
    return this.answer();
  }
}

@Component({
  imports: [PromotionAudienceTree],
  template: `<app-promotion-audience-tree
    [audiences]="audiences()"
    (audiencesChange)="audiences.set($event)"
  >
    <p individualsLabels>libellés particuliers</p>
    <p prosLabels>libellés pros</p>
  </app-promotion-audience-tree>`,
})
class Host {
  readonly audiences = signal<PromotionAudienceTargetView[]>([
    { kind: 'individuals_registered', companyId: null },
  ]);
}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root: HTMLElement = fixture.nativeElement;
  const box = (label: string): HTMLInputElement => {
    const found = [...root.querySelectorAll('label')].find(
      (node) => node.textContent?.trim() === label,
    );
    const input = found?.querySelector('input') ?? null;
    if (input === null) {
      throw new Error(`Case ${label} introuvable.`);
    }
    return input;
  };
  return { fixture, root, box };
}

describe('PromotionAudienceTree', () => {
  let companies: FakeCompanies;

  beforeEach(() => {
    companies = new FakeCompanies();
    TestBed.configureTestingModule({
      providers: [{ provide: AdminCompaniesService, useValue: companies }],
    });
  });

  it('rend la branche partielle et ne projette que les libellés de la branche touchée', () => {
    const { root, box } = render();
    expect(box('Particuliers').indeterminate).toBe(true);
    expect(box('Inscrits').checked).toBe(true);
    expect(root.textContent).toContain('libellés particuliers');
    expect(root.textContent).not.toContain('libellés pros');
  });

  it('un parent coché grise ses enfants ; « Tout le monde » grise tout', async () => {
    const { fixture, box } = render();
    box('Invités (sans compte)').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(box('Particuliers').checked).toBe(true);
    expect(box('Inscrits').disabled).toBe(true);
    box('Tout le monde').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.audiences()).toEqual([{ kind: 'everyone', companyId: null }]);
    expect(box('Pros').disabled).toBe(true);
  });

  it('plusieurs sociétés : une ligne chacune, nommée, avec ses sites, et retirable', async () => {
    companies.answer = () =>
      Promise.resolve([
        company({ id: 'c1' }),
        company({ id: 'c2', enseigne: 'Chalet Blanc', reference: 'C-000456' }),
        company({
          id: 'c3',
          enseigne: 'Chalet Rouge',
          reference: 'C-000789',
          parent: { id: 'c2', enseigne: 'Chalet Blanc' },
        }),
      ]);
    const { fixture, root, box } = render();
    fixture.componentInstance.audiences.set([
      { kind: 'company', companyId: 'c1' },
      { kind: 'company_and_sites', companyId: 'c2' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const rows = (): HTMLElement[] => [
      ...root.querySelectorAll<HTMLElement>('[data-audience-company]'),
    ];
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining('Le Fournil du Coin · C-000123'),
      expect.stringContaining('Chalet Blanc · C-000456'),
    ]);
    expect(box('Une société').checked).toBe(true);
    expect(rows()[1]?.querySelector('input')?.checked).toBe(true);
    expect(root.querySelector('fold-combobox')).not.toBeNull();
    expect(root.querySelector('[data-audience-sites]')?.textContent).toContain(
      'Chalet Rouge · C-000789',
    );
    rows()[0]?.querySelector('button')?.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.audiences()).toEqual([
      { kind: 'company_and_sites', companyId: 'c2' },
    ]);
  });

  it('sans la liste (droit absent), on ajoute par identifiant, et on le dit', async () => {
    companies.answer = () => Promise.reject(new Error('403'));
    const { fixture, root, box } = render();
    box('Une société').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('fold-combobox')).toBeNull();
    expect(root.textContent).toContain('Identifiant de la société');
    expect(root.textContent).toContain('La liste des sociétés n');
  });

  it('décocher « Une société » retire toutes les sociétés', async () => {
    const { fixture, box } = render();
    fixture.componentInstance.audiences.set([
      { kind: 'pros_active', companyId: null },
      { kind: 'company', companyId: 'c1' },
      { kind: 'company', companyId: 'c2' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    box('Une société').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.audiences()).toEqual([
      { kind: 'pros_active', companyId: null },
    ]);
  });
});
