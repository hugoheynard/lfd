import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FoldPanelRef, FoldSearchComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { AdminCompanyHierarchyService } from '../../../comptes-clients/admin-company-hierarchy.service';
import type { AdminCompany } from '../../../comptes-clients/admin-company';
import { NotifyService } from '../../../notify.service';
import { AttachSubAccountPanel } from './attach-sub-account-panel';

function company(
  id: string,
  enseigne: string,
  parent: AdminCompany['parent'] = null,
): AdminCompany {
  return {
    id,
    reference: `C-${id}`,
    raisonSociale: '',
    enseigne,
    formeJuridique: '',
    siret: '',
    siren: '',
    vatNumber: '',
    status: 'active',
    grantedTerms: [],
    requestedTerm: null,
    directDebitBlocked: false,
    primaryContact: {
      id: null,
      role: null,
      firstName: '',
      lastName: '',
      fonction: '',
      email: '',
      phone: '',
    },
    kbis: null,
    owner: null,
    hasOpenSupportRequest: false,
    parent,
    createdAt: '2026-07-30T10:00:00.000Z',
    activatedAt: null,
    warnings: [],
  };
}

const PORTFOLIO = [
  company('parent_1', 'Club Med Alpes'),
  company('free_1', 'Club Med Tignes'),
  company('taken_1', 'Club Med Arcs', { id: 'other', enseigne: 'Autre groupe' }),
];

interface Wire {
  readonly attached: string[];
  refuse: HttpErrorResponse | null;
  readonly closed: (string | undefined)[];
}

async function boot(): Promise<{ fixture: ComponentFixture<AttachSubAccountPanel>; wire: Wire }> {
  const wire: Wire = { attached: [], refuse: null, closed: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: FoldPanelRef, useValue: new FoldPanelRef<string>(1, (r) => wire.closed.push(r)) },
      { provide: NotifyService, useValue: { success: () => undefined } },
      {
        provide: AdminCompaniesService,
        useValue: {
          list: () => Promise.resolve(PORTFOLIO),
        } satisfies Partial<Record<keyof AdminCompaniesService, unknown>>,
      },
      {
        provide: AdminCompanyHierarchyService,
        useValue: {
          attach: (child: string, parent: string) => {
            wire.attached.push(`${child} → ${parent}`);
            return wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
          },
        } satisfies Partial<Record<keyof AdminCompanyHierarchyService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(AttachSubAccountPanel);
  fixture.componentRef.setInput('data', { parentId: 'parent_1', parentName: 'Club Med Alpes' });
  await settle(fixture);
  return { fixture, wire };
}

async function settle(fixture: ComponentFixture<AttachSubAccountPanel>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function search(fixture: ComponentFixture<AttachSubAccountPanel>, query: string): void {
  const field = fixture.debugElement.query(By.directive(FoldSearchComponent))
    .componentInstance as FoldSearchComponent;
  field.searchChange.emit(query);
  fixture.detectChanges();
}

function candidates(fixture: ComponentFixture<AttachSubAccountPanel>): HTMLElement[] {
  return [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-candidate]'),
  ];
}

describe('AttachSubAccountPanel', () => {
  it('ne propose ni le principal, ni un client déjà rattaché ailleurs', async () => {
    const { fixture } = await boot();
    search(fixture, 'club med');

    const names = candidates(fixture).map((row) => row.textContent ?? '');
    expect(names).toHaveLength(1);
    expect(names[0]).toContain('Club Med Tignes');
  });

  it('rattacher envoie le sous-compte vers le principal, puis ferme', async () => {
    const { fixture, wire } = await boot();
    search(fixture, 'tignes');
    candidates(fixture)[0]?.querySelector('button')?.click();
    await settle(fixture);

    expect(wire.attached).toEqual(['free_1 → parent_1']);
    expect(wire.closed).toEqual(['free_1']);
  });

  it('un refus du serveur s’affiche tel quel, le panneau reste ouvert', async () => {
    const { fixture, wire } = await boot();
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Club Med Tignes a lui-même des sous-comptes.' },
    });
    search(fixture, 'tignes');
    candidates(fixture)[0]?.querySelector('button')?.click();
    await settle(fixture);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-refusal]')?.textContent,
    ).toContain('Club Med Tignes a lui-même des sous-comptes.');
    expect(wire.closed).toEqual([]);
  });
});
