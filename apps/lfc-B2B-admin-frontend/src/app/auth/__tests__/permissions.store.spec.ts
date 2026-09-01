import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { StaffMeView } from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { PermissionsStore } from '../permissions.store';

/**
 * Le magasin de permissions n'est **pas** un mur — le serveur refuse de toute
 * façon. Mais c'est lui qui décide de ce que l'écran propose, et une erreur ici
 * se voit comme une panne : un bouton absent qu'on devrait avoir, ou un bouton
 * offert qui rendra `403`.
 *
 * Trois propriétés comptent, et aucune n'était éprouvée : il ne dit **jamais
 * oui avant de savoir**, un refus du serveur n'est pas une panne de réseau, et
 * dix gardes de route ne déclenchent qu'**un** appel.
 */
const ME: StaffMeView = {
  id: 's1',
  firstName: 'Colette',
  lastName: 'Bréal',
  email: 'compta@lfc.test',
  role: 'comptabilite',
  permissions: ['b2b_orders:read', 'b2b_orders:write', 'b2b_companies:read', 'b2b_settings:read'],
};

function setup(): { store: PermissionsStore; ctrl: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    store: TestBed.inject(PermissionsStore),
    ctrl: TestBed.inject(HttpTestingController),
  };
}

let store: PermissionsStore;
let ctrl: HttpTestingController;

beforeEach(() => {
  ({ store, ctrl } = setup());
});

afterEach(() => {
  ctrl.verify();
});

/** Répond à l'appel `/admin/me` en attente. */
function answer(body: StaffMeView): void {
  ctrl.expectOne(`${B2B_API_BASE}/admin/me`).flush(body);
}

describe('PermissionsStore — avant de savoir', () => {
  it("ne dit oui à rien tant que la lecture n'a pas eu lieu", () => {
    // Le défaut par défaut est le refus. Dire oui puis se raviser ferait
    // clignoter les boutons — et offrirait un geste qui échouera.
    expect(store.can('b2b_orders:read')).toBe(false);
    expect(store.loaded()).toBe(false);

    const loading = store.ensureLoaded();
    answer(ME);
    return loading;
  });
});

describe('PermissionsStore — après la lecture', () => {
  it("rend exactement les permissions du serveur, sans en déduire d'autres", async () => {
    const loading = store.ensureLoaded();
    answer(ME);
    await loading;

    expect(store.can('b2b_orders:write')).toBe(true);
    // `growth:read` n'est pas dans la liste : le magasin ne la fabrique pas.
    expect(store.can('b2b_growth:read')).toBe(false);
    expect(store.can('staff_access:read')).toBe(false);
  });

  it("expose l'identité pour que l'écran sache qui parle", async () => {
    const loading = store.ensureLoaded();
    answer(ME);
    await loading;

    expect(store.identity()?.role).toBe('comptabilite');
    expect(store.loaded()).toBe(true);
    expect(store.denied()).toBe(false);
  });
});

describe('PermissionsStore — un seul appel', () => {
  it('partage la lecture entre appels concurrents', async () => {
    // Dix gardes de route se déclenchent sur une seule navigation : sans ce
    // partage, dix requêtes partiraient pour la même réponse.
    const first = store.ensureLoaded();
    const second = store.ensureLoaded();
    answer(ME);
    await Promise.all([first, second]);

    // `ctrl.verify()` en `afterEach` échouerait s'il en restait une en attente.
    expect(store.loaded()).toBe(true);
  });

  it("ne relit pas une fois qu'il sait", async () => {
    const loading = store.ensureLoaded();
    answer(ME);
    await loading;

    await store.ensureLoaded();

    expect(store.can('b2b_orders:read')).toBe(true);
  });

  it('relit sur demande explicite — après un changement de rôle', async () => {
    const loading = store.ensureLoaded();
    answer(ME);
    await loading;

    const again = store.reload();
    answer({ ...ME, role: 'admin', permissions: ['staff_access:read', 'staff_access:write'] });
    await again;

    expect(store.can('staff_access:write')).toBe(true);
    expect(store.can('b2b_orders:read')).toBe(false);
  });
});

describe('PermissionsStore — le refus du serveur', () => {
  it('devient `denied` sur 403, sans prétendre à des droits', async () => {
    // Le cas de la personne authentifiée mais absente de l'annuaire : l'écran
    // doit pouvoir le DIRE, pas afficher une coquille vide.
    const loading = store.ensureLoaded();
    ctrl
      .expectOne(`${B2B_API_BASE}/admin/me`)
      .flush(null, { status: 403, statusText: 'Forbidden' });
    await loading;

    expect(store.denied()).toBe(true);
    expect(store.loaded()).toBe(true);
    expect(store.can('b2b_orders:read')).toBe(false);
    expect(store.identity()).toBeNull();
  });

  it('ne réessaie pas en boucle après un refus', async () => {
    const loading = store.ensureLoaded();
    ctrl
      .expectOne(`${B2B_API_BASE}/admin/me`)
      .flush(null, { status: 403, statusText: 'Forbidden' });
    await loading;

    // Un second appel ne doit émettre aucune requête : `verify()` le prouve.
    await store.ensureLoaded();

    expect(store.denied()).toBe(true);
  });
});
