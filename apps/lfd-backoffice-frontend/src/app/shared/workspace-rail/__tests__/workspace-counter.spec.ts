import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CustomerRequestsInbox } from '../../../b2b/demandes/customer-requests-inbox.store';
import { CustomerRequestsService } from '../../../b2b/demandes/customer-requests.service';
import { WorkspaceCatalogue } from '../workspaces';

/**
 * **La boîte des demandes clients a quitté le rail du B2B** (Hugo,
 * 2026-10-13) : elle faisait doublon avec son entrée du menu principal, sous
 * Commandes, qui porte le compteur. Le rail ne doit ni la remontrer, ni
 * prêter son compte à une autre entrée.
 */

function configure(): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: PermissionsStore,
        useValue: {
          // `lfc_catalog:read` : le droit de la réception, dernière vue du
          // rail, partie en X2 (2026-10-17). Le rail est désormais VIDE, et
          // les cas le disent plutôt que de compter sur `every()`, vrai sur
          // une liste vide.
          can: (p: StaffPermission) =>
            p === 'b2b_contact:read' || p === 'b2b_settings:read' || p === 'lfc_catalog:read',
        },
      },
      { provide: CustomerRequestsService, useValue: {} },
    ],
  });
}

function b2bRail() {
  return TestBed.inject(WorkspaceCatalogue).views('b2b')();
}

describe('le rail du B2B, sans la boîte des demandes', () => {
  it('ne montre plus « Demandes clients », même à qui en a les droits', () => {
    configure();
    expect(b2bRail().map((view) => view.link)).not.toContain('/b2b/demandes');
    expect(b2bRail().map((view) => view.label)).not.toContain('Demandes clients');
  });

  /** Depuis X2 : plus aucune vue, donc aucune entrée pour porter un compte. */
  it('n’a plus aucune vue, et donc aucun compte posé', () => {
    configure();
    TestBed.inject(CustomerRequestsInbox).set(4);
    expect(b2bRail()).toEqual([]);
  });
});
