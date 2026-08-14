import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { ReglagesPage } from '../reglages-page';

/**
 * Réglages range trois écrans sous un même titre, et ce rangement ne leur donne
 * pas le même mur : « Utilisateurs » demande `staff:read`, réservé aux
 * administrateurs. Montré à tout le monde, l'onglet offrait une porte fermée à
 * clé — un commercial cliquait, la page s'ouvrait, et chaque appel rendait 403.
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
      'commercial',
      'utilisateurs',
    ]);
  });

  it("cache « Utilisateurs » à qui n'a pas `staff:read`", () => {
    // Le cas réel : un commercial a `settings:read` et `growth:read`, jamais
    // `staff:read` — le catalogue réserve cette ressource à `admin`.
    expect(tabsFor(['settings:read', 'growth:read'])).toEqual([
      'retraits-livraisons',
      'commercial',
    ]);
  });

  it('cache « Commercial » à la comptabilité', () => {
    expect(tabsFor(['settings:read'])).toEqual(['retraits-livraisons']);
  });
});
