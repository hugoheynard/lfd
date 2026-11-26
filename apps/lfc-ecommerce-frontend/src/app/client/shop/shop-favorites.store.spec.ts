import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { ShopFavorites } from './shop-favorites.store';

const COMPANY = 'co_1';
const STORED = 'lfc.favorites';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
};

const isRead = (url: string): boolean => url.endsWith('/me/favorites');
const isWrite = (sku: string) => (url: string) => url.endsWith(`/me/favorites/${sku}`);

describe('ShopFavorites', () => {
  let http: HttpTestingController;
  const signedIn = signal(false);

  const start = (): ShopFavorites => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideWorkspace(workspaceDouble(COMPANY)),
        {
          provide: AuthFacade,
          useValue: {
            isAuthenticated: signedIn,
            accessToken$: () => of('jeton-de-test'),
            sessionExpired: () => false,
            pendingProRegistration: () => null,
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(ShopFavorites);
  };

  beforeEach(() => {
    localStorage.removeItem(STORED);
    signedIn.set(false);
  });
  afterEach(() => localStorage.removeItem(STORED));

  it('visiteur : garde le favori dans le navigateur, sans rien demander au serveur', async () => {
    const favorites = start();
    await favorites.toggle('VIE-001');

    expect(favorites.has('VIE-001')).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORED) ?? '[]')).toEqual(['VIE-001']);
    await favorites.toggle('VIE-001');
    expect(favorites.has('VIE-001')).toBe(false);
    http.verify();
  });

  it('visiteur : relit ce qu’il avait mis de côté, et ignore une clé illisible', () => {
    localStorage.setItem(STORED, '{pas du json');
    expect(start().skus().size).toBe(0);
    localStorage.setItem(STORED, JSON.stringify(['VIE-002', 3]));
    expect([...start().skus()]).toEqual(['VIE-002']);
  });

  it('connecté : lit les favoris de l’espace, l’en-tête tiré de la clé', async () => {
    signedIn.set(true);
    const favorites = start();
    TestBed.tick();
    await settle();

    const read = http.expectOne((r) => isRead(r.url));
    expect(read.request.headers.get(WORKSPACE_HEADER)).toBe(COMPANY);
    expect(read.request.headers.get('Authorization')).toBe('Bearer jeton-de-test');
    read.flush({ skus: ['PAI-001'] });
    await settle();

    expect([...favorites.skus()]).toEqual(['PAI-001']);
  });

  it('connecté : bascule tout de suite, puis écrit (PUT pour poser, DELETE pour retirer)', async () => {
    signedIn.set(true);
    const favorites = start();
    TestBed.tick();
    await settle();
    http.expectOne((r) => isRead(r.url)).flush({ skus: ['PAI-001'] });
    await settle();

    const adding = favorites.toggle('VIE-001');
    expect(favorites.has('VIE-001')).toBe(true);
    await settle();
    const put = http.expectOne((r) => isWrite('VIE-001')(r.url));
    expect(put.request.method).toBe('PUT');
    expect(put.request.headers.get(WORKSPACE_HEADER)).toBe(COMPANY);
    put.flush(null, { status: 204, statusText: 'No Content' });
    await adding;

    const removing = favorites.toggle('PAI-001');
    expect(favorites.has('PAI-001')).toBe(false);
    await settle();
    const del = http.expectOne((r) => isWrite('PAI-001')(r.url));
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await removing;

    expect([...favorites.skus()]).toEqual(['VIE-001']);
  });

  it('connecté : revient en arrière quand l’écriture échoue', async () => {
    signedIn.set(true);
    const favorites = start();
    TestBed.tick();
    await settle();
    http.expectOne((r) => isRead(r.url)).flush({ skus: [] });
    await settle();

    const adding = favorites.toggle('VIE-001');
    expect(favorites.has('VIE-001')).toBe(true);
    await settle();
    http
      .expectOne((r) => isWrite('VIE-001')(r.url))
      .flush(null, { status: 500, statusText: 'Server Error' });
    await adding;

    expect(favorites.has('VIE-001')).toBe(false);
  });

  it('à la connexion : pose les favoris du visiteur dans l’espace, puis vide la clé locale', async () => {
    localStorage.setItem(STORED, JSON.stringify(['VIE-001', 'VIE-002']));
    const favorites = start();
    TestBed.tick();
    expect(favorites.has('VIE-001')).toBe(true);

    signedIn.set(true);
    TestBed.tick();
    for (const sku of ['VIE-001', 'VIE-002']) {
      await settle();
      const put = http.expectOne((r) => isWrite(sku)(r.url));
      expect(put.request.method).toBe('PUT');
      expect(put.request.headers.get(WORKSPACE_HEADER)).toBe(COMPANY);
      put.flush(null, { status: 204, statusText: 'No Content' });
    }
    await settle();
    http.expectOne((r) => isRead(r.url)).flush({ skus: ['VIE-001', 'VIE-002'] });
    await settle();

    expect(localStorage.getItem(STORED)).toBeNull();
    expect([...favorites.skus()]).toEqual(['VIE-001', 'VIE-002']);
  });

  it('à la connexion : garde en local un favori dont l’envoi a échoué', async () => {
    localStorage.setItem(STORED, JSON.stringify(['VIE-001']));
    start();
    TestBed.tick();
    signedIn.set(true);
    TestBed.tick();
    await settle();
    http
      .expectOne((r) => isWrite('VIE-001')(r.url))
      .flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    http.expectOne((r) => isRead(r.url)).flush({ skus: [] });
    await settle();

    expect(JSON.parse(localStorage.getItem(STORED) ?? '[]')).toEqual(['VIE-001']);
  });
});
