import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CustomerRequestsInbox } from '../../../b2b/demandes/customer-requests-inbox.store';
import { CustomerRequestsService } from '../../../b2b/demandes/customer-requests.service';
import { PimCapabilitiesStore } from '../../../pim/capabilities/pim-capabilities.store';
import { WorkspaceCatalogue } from '../workspaces';

/**
 * **Le compteur d'une entrée de menu** (2026-10-09) : l'entrée « Demandes
 * clients » porte les demandes à traiter, tous types, au rail comme sur les tuiles — qui lisent la
 * même vue. Masqué à zéro, et tant que le compte n'est pas lu.
 */

function configure(): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: PermissionsStore,
        useValue: {
          can: (p: StaffPermission) => p === 'b2b_contact:read' || p === 'b2b_settings:read',
        },
      },
      { provide: PimCapabilitiesStore, useValue: { publication: () => true } },
      { provide: CustomerRequestsService, useValue: {} },
    ],
  });
}

function contactEntry() {
  return TestBed.inject(WorkspaceCatalogue)
    .views('b2b')()
    .find((view) => view.key === 'demandes');
}

describe('le compteur de l’entrée « Demandes clients »', () => {
  it('porte le nombre de messages à traiter', () => {
    configure();
    TestBed.inject(CustomerRequestsInbox).set(4);
    expect(contactEntry()?.badge).toBe(4);
  });

  it('n’a pas de badge à zéro, ni avant la première lecture', () => {
    configure();
    expect(contactEntry()).toBeDefined();
    expect(contactEntry()?.badge).toBeUndefined();

    TestBed.inject(CustomerRequestsInbox).set(0);
    expect(contactEntry()?.badge).toBeUndefined();
  });

  it('ne pose aucun badge sur une entrée sans compteur', () => {
    configure();
    TestBed.inject(CustomerRequestsInbox).set(4);
    const others = TestBed.inject(WorkspaceCatalogue)
      .views('b2b')()
      .filter((view) => view.key !== 'demandes');
    expect(others.every((view) => view.badge === undefined)).toBe(true);
  });
});
