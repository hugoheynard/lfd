import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
    providers: [provideRouter([]), { provide: PermissionsStore, useValue: store }],
  });
  const page = TestBed.runInInjectionContext(() => new AdminPage());
  // `views` est privé — on lit ce que le rail reçoit, via l'instance.
  return TestBed.runInInjectionContext(() => page['views']().map((view) => view.key));
}

describe("les vues d'Admin", () => {
  it("n'offre à un administrateur aucune porte de moins", () => {
    expect(tabsFor(['b2b_companies:read', 'staff_access:read'])).toEqual([
      'acces-en-attente',
      'utilisateurs',
      'roles',
    ]);
  });

  it("cache « Utilisateurs » à qui n'a pas `staff:read`", () => {
    // Le cas réel : un commercial garde le canal de secours — c'est un geste
    // commercial — sans jamais voir l'annuaire de l'équipe.
    expect(tabsFor(['b2b_companies:read', 'b2b_growth:read'])).toEqual(['acces-en-attente']);
  });

  it("cache « Accès à remettre » à qui n'a pas `companies:read`", () => {
    expect(tabsFor(['staff_access:read'])).toEqual(['utilisateurs', 'roles']);
  });

  it("cache « Rôles » à qui n'a pas `staff:read`, comme l'annuaire", () => {
    // Les deux vont ensemble : définir un droit et l'attribuer sont le même
    // pouvoir vu de deux côtés. Un mur plus faible sur l'un laisserait
    // fabriquer des droits à qui n'a pas celui de les donner.
    expect(tabsFor(['b2b_companies:read'])).not.toContain('roles');
  });
});
