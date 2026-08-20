import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { ReglagesPage } from '../reglages-page';

/**
 * Réglages range cinq écrans sous un même titre, et ce rangement ne leur donne
 * pas le même mur : « Commercial » demande `growth:read`, que la comptabilité
 * n'a pas. Montré à tout le monde, l'onglet offrirait une porte fermée à clé —
 * on clique, la page s'ouvre, et chaque appel rend 403.
 *
 * Le cas d'école était « Utilisateurs » ; il a quitté ces réglages pour le
 * module Admin, où la même garantie est éprouvée.
 */
function tabsFor(permissions: readonly StaffPermission[]): string[] {
  const store: Pick<PermissionsStore, 'can'> = {
    can: (permission: StaffPermission): boolean => permissions.includes(permission),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: PermissionsStore, useValue: store }],
  });
  const page = TestBed.runInInjectionContext(() => new ReglagesPage());
  // `tabs` est protégé — on lit ce que le template lit, via l'instance.
  return TestBed.runInInjectionContext(() => page['tabs']().map((tab) => tab.key));
}

describe('les onglets de Réglages', () => {
  it("n'offre à un administrateur aucune porte de moins", () => {
    expect(tabsFor(['settings:read', 'growth:read', 'staff:read'])).toEqual([
      'retraits-livraisons',
      'catalogue',
      'tarification',
      'facturation',
      'commercial',
    ]);
  });

  it('cache « Commercial » à la comptabilité', () => {
    // Catalogue et Tarification restent : leur paramétrage est du réglage,
    // donc `settings:read`.
    expect(tabsFor(['settings:read'])).toEqual([
      'retraits-livraisons',
      'catalogue',
      'tarification',
      'facturation',
    ]);
  });
});
