import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CustomerRequestsInbox } from '../../../b2b/demandes/customer-requests-inbox.store';
import { CustomerRequestsService } from '../../../b2b/demandes/customer-requests.service';
import { PimCapabilitiesStore } from '../../../pim/capabilities/pim-capabilities.store';
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
          can: (p: StaffPermission) => p === 'b2b_contact:read' || p === 'b2b_settings:read',
        },
      },
      { provide: PimCapabilitiesStore, useValue: { publication: () => true } },
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
    expect(b2bRail().length).toBeGreaterThan(0);
    expect(b2bRail().map((view) => view.link)).not.toContain('/b2b/demandes');
    expect(b2bRail().map((view) => view.label)).not.toContain('Demandes clients');
  });

  it('ne pose le compte des demandes sur aucune entrée', () => {
    configure();
    TestBed.inject(CustomerRequestsInbox).set(4);
    expect(b2bRail().every((view) => view.badge === undefined)).toBe(true);
  });
});
