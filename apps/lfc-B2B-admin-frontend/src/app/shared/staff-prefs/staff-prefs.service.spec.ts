import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { PermissionsStore } from '../../auth/permissions.store';
import { StaffPrefsService } from './staff-prefs.service';

/**
 * Ce que ces cas tiennent : **une préférence d'affichage ne casse jamais un
 * écran**. Le `PATCH` peut être refusé, la route peut ne pas exister encore, le
 * sous-sol peut ne pas avoir de réseau — dans les trois cas, la fiche reste
 * ouverte et la catégorie reste celle de la session.
 */

class FakePermissions {
  identityValue: { navPrefs?: { worksheetCategory: string | null } } | null = null;
  loads = 0;

  async ensureLoaded(): Promise<void> {
    this.loads += 1;
  }

  identity(): unknown {
    return this.identityValue;
  }
}

let permissions: FakePermissions;

function service(): StaffPrefsService {
  return TestBed.inject(StaffPrefsService);
}

describe('StaffPrefsService', () => {
  beforeEach(() => {
    permissions = new FakePermissions();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PermissionsStore, useValue: permissions },
      ],
    });
  });

  it('lit la catégorie sur la fiche déjà chargée, sans second appel', async () => {
    permissions.identityValue = { navPrefs: { worksheetCategory: 'pain' } };

    expect(await service().worksheetCategory()).toBe('pain');
    expect(permissions.loads).toBe(1);
    TestBed.inject(HttpTestingController).verify();
  });

  it('rend `null` quand la personne n’a jamais choisi', async () => {
    permissions.identityValue = { navPrefs: { worksheetCategory: null } };

    expect(await service().worksheetCategory()).toBeNull();
  });

  it('rend `null` quand le backend ne connaît pas encore le sac de préférences', async () => {
    // Le contrat déclare `navPrefs` obligatoire, mais une version antérieure du
    // backend ne l'envoie pas — et l'écran doit ouvrir quand même.
    permissions.identityValue = {};

    expect(await service().worksheetCategory()).toBeNull();
  });

  it('écrit la préférence sur `PATCH /admin/me/prefs`', async () => {
    const pending = service().remember({ worksheetCategory: 'pain' });
    const request = TestBed.inject(HttpTestingController).expectOne(
      `${B2B_API_BASE}/admin/me/prefs`,
    );

    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ worksheetCategory: 'pain' });
    request.flush(null);
    await pending;
  });

  it('🔴 avale un refus : l’écran a déjà basculé, et rien ne doit le déranger', async () => {
    const pending = service().remember({ worksheetCategory: 'pain' });
    TestBed.inject(HttpTestingController)
      .expectOne(`${B2B_API_BASE}/admin/me/prefs`)
      .flush('inconnu', { status: 404, statusText: 'Not Found' });

    await expect(pending).resolves.toBeUndefined();
  });
});
