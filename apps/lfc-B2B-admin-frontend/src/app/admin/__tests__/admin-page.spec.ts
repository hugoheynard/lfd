import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminPage } from '../admin-page/admin-page';

/**
 * Admin range deux écrans sous un même titre, et ce rangement ne leur donne pas
 * le même mur : « Utilisateurs » demande `staff:read`, la seule ressource que le
 * catalogue réserve aux administrateurs, quand l'entrée du module s'ouvre sur
 * `companies:read`. Montré à tout le monde, l'onglet offrirait une porte fermée
 * à clé — on clique, la page s'ouvre, et chaque appel rend 403.
 */
function tabsFor(permissions: readonly StaffPermission[]): string[] {
  const store: Pick<PermissionsStore, 'can'> = {
    can: (permission: StaffPermission): boolean => permissions.includes(permission),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: PermissionsStore, useValue: store }],
  });
  const page = TestBed.runInInjectionContext(() => new AdminPage());
  // `tabs` est protégé — on lit ce que le template lit, via l'instance.
  return TestBed.runInInjectionContext(() => page['tabs']().map((tab) => tab.key));
}

describe("les onglets d'Admin", () => {
  it("n'offre à un administrateur aucune porte de moins", () => {
    expect(tabsFor(['companies:read', 'staff:read'])).toEqual(['acces-en-attente', 'utilisateurs']);
  });

  it("cache « Utilisateurs » à qui n'a pas `staff:read`", () => {
    // Le cas réel : un commercial garde le canal de secours — c'est un geste
    // commercial — sans jamais voir l'annuaire de l'équipe.
    expect(tabsFor(['companies:read', 'growth:read'])).toEqual(['acces-en-attente']);
  });

  it("cache « Accès à remettre » à qui n'a pas `companies:read`", () => {
    expect(tabsFor(['staff:read'])).toEqual(['utilisateurs']);
  });
});
