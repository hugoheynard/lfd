import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { StaffMeView } from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { PermissionsStore } from '../permissions.store';
import { staffAuthInterceptor } from '../staff-auth.interceptor';
import { StaffToken } from '../staff-token';

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
  roleLabel: 'Comptabilité',
  permissions: ['b2b_orders:read', 'b2b_orders:write', 'b2b_companies:read', 'b2b_settings:read'],
  navPrefs: { worksheetCategory: null, productSectionFamily: null },
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

describe("PermissionsStore — l'échec n'est pas un refus", () => {
  /**
   * Régression : une session Auth0 non renouvelée rendait 401 sur `/admin/me`,
   * classé `denied`, et l'écran affichait « Aucun accès » à une personne dont
   * les droits n'avaient pas bougé (constaté en production le 2026-10-27).
   */
  it("un jeton expiré n'affiche plus Aucun accès", async () => {
    const loading = store.ensureLoaded();
    ctrl
      .expectOne(`${B2B_API_BASE}/admin/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await loading;

    expect(store.expired()).toBe(true);
    expect(store.denied()).toBe(false);
    expect(store.loaded()).toBe(false);
    expect(store.can('b2b_orders:read')).toBe(false);
  });

  it('devient `unavailable` sur 500', async () => {
    const loading = store.ensureLoaded();
    ctrl
      .expectOne(`${B2B_API_BASE}/admin/me`)
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    await loading;

    expect(store.unavailable()).toBe(true);
    expect(store.denied()).toBe(false);
    expect(store.loaded()).toBe(false);
  });

  it('devient `unavailable` sur une erreur réseau (statut 0)', async () => {
    const loading = store.ensureLoaded();
    ctrl.expectOne(`${B2B_API_BASE}/admin/me`).error(new ProgressEvent('error'));
    await loading;

    expect(store.unavailable()).toBe(true);
    expect(store.denied()).toBe(false);
  });

  it('relit au prochain appel après une panne, et retrouve les droits', async () => {
    const first = store.ensureLoaded();
    ctrl
      .expectOne(`${B2B_API_BASE}/admin/me`)
      .flush(null, { status: 503, statusText: 'Service Unavailable' });
    await first;

    const retry = store.reload();
    answer(ME);
    await retry;

    expect(store.unavailable()).toBe(false);
    expect(store.can('b2b_orders:read')).toBe(true);
  });
});

describe('PermissionsStore — le jeton silencieux échoue', () => {
  it('devient `expired` : la requête part sans en-tête et le serveur rend 401', async () => {
    // `StaffAuth.token()` avale l'échec de `getAccessTokenSilently` et rend
    // `null` ; l'intercepteur laisse alors partir l'appel nu.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([staffAuthInterceptor])),
        provideHttpClientTesting(),
        {
          provide: StaffToken,
          useValue: { bearer: (): Promise<string | null> => Promise.resolve(null) },
        },
      ],
    });
    const local = TestBed.inject(PermissionsStore);
    const http = TestBed.inject(HttpTestingController);
    ctrl = http;

    const loading = local.ensureLoaded();
    await Promise.resolve();
    await Promise.resolve();
    const request = http.expectOne(`${B2B_API_BASE}/admin/me`);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(null, { status: 401, statusText: 'Unauthorized' });
    await loading;

    expect(local.expired()).toBe(true);
    expect(local.denied()).toBe(false);
  });
});
