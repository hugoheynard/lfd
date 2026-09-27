import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthFacade } from '../auth/auth.facade';
import { OPEN_LOYALTY } from './client-loyalty.fixture';
import { ClientLoyalty } from './client-loyalty.service';
import { provideRecognised, RECOGNISED } from './client-orders.fixture';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from './client-workspace.fixture';

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const isRead = (url: string): boolean => url.endsWith('/me/loyalty');
const isConversion = (url: string): boolean => url.endsWith('/me/loyalty/conversions');

describe('ClientLoyalty', () => {
  let http: HttpTestingController;
  let loyalty: ClientLoyalty;
  let space: WorkspaceDouble;

  beforeEach(() => {
    space = workspaceDouble();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRecognised(),
        provideWorkspace(space),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    loyalty = TestBed.inject(ClientLoyalty);
  });

  it('lit `GET me/loyalty` avec le jeton, et range la vue', async () => {
    const pending = loyalty.load();
    await settle();
    const req = http.expectOne((r) => isRead(r.url));
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jeton-de-test');
    expect(loyalty.status()).toBe('loading');
    req.flush(OPEN_LOYALTY);
    await pending;

    expect(loyalty.status()).toBe('ready');
    expect(loyalty.view()).toEqual(OPEN_LOYALTY);
  });

  it('passe en échec sans perdre la dernière vue lue', async () => {
    const first = loyalty.load();
    await settle();
    http.expectOne((r) => isRead(r.url)).flush(OPEN_LOYALTY);
    await first;

    const second = loyalty.load();
    await settle();
    http.expectOne((r) => isRead(r.url)).flush(null, { status: 500, statusText: 'Server Error' });
    await second;

    expect(loyalty.status()).toBe('failed');
    expect(loyalty.view()).toEqual(OPEN_LOYALTY);
  });

  it('envoie les paliers ET le solde affiché, puis relit la vue', async () => {
    const pending = loyalty.convert(2, 2350);
    await settle();
    const req = http.expectOne((r) => isConversion(r.url));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ steps: 2, expectedBalancePoints: 2350 });
    req.flush({ voucherId: 'v_new' }, { status: 201, statusText: 'Created' });
    await settle();
    http.expectOne((r) => isRead(r.url)).flush(OPEN_LOYALTY);

    expect(await pending).toBe('converted');
  });

  /** Plan E1.1 : le second clic échoue en 409, le premier ayant baissé le solde. */
  it('rend `balance-changed` sur un 409, et relit le solde', async () => {
    const pending = loyalty.convert(1, 2350);
    await settle();
    http
      .expectOne((r) => isConversion(r.url))
      .flush(
        { code: 'loyalty.balance_changed', message: '…' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();
    http.expectOne((r) => isRead(r.url)).flush({ ...OPEN_LOYALTY, balancePoints: 1350 });

    expect(await pending).toBe('balance-changed');
    expect(loyalty.view()).toMatchObject({ balancePoints: 1350 });
  });

  it('rend `failed` sur une autre erreur, sans relire', async () => {
    const pending = loyalty.convert(1, 2350);
    await settle();
    http.expectOne((r) => isConversion(r.url)).error(new ProgressEvent('error'), { status: 0 });

    expect(await pending).toBe('failed');
    http.verify();
  });

  it('lit une fidélité fermée pour un visiteur, sans appel', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthFacade, useValue: { ...RECOGNISED, isAuthenticated: () => false } },
        provideWorkspace(workspaceDouble()),
      ],
    });
    const service = TestBed.inject(ClientLoyalty);

    await service.load();

    expect(service.view()).toEqual({ open: false });
    TestBed.inject(HttpTestingController).verify();
  });

  /** Le menu et la page lisent le même état : UNE lecture par espace personnel. */
  it('lit d’elle-même une seule fois en espace personnel', async () => {
    TestBed.tick();
    await settle();
    http.expectOne((r) => isRead(r.url)).flush(OPEN_LOYALTY);
    await settle();
    TestBed.tick();
    await settle();

    http.verify();
    expect(loyalty.isOpen()).toBe(true);
  });

  it('se ferme sans appel dans un espace société', async () => {
    space.current.set('co_1');
    TestBed.tick();
    await settle();

    http.verify();
    expect(loyalty.view()).toEqual({ open: false });
    expect(loyalty.isOpen()).toBe(false);
  });

  it('se referme en passant d’un espace personnel ouvert à une société', async () => {
    TestBed.tick();
    await settle();
    http.expectOne((r) => isRead(r.url)).flush(OPEN_LOYALTY);
    await settle();

    space.current.set('co_1');
    TestBed.tick();

    expect(loyalty.isOpen()).toBe(false);
    http.verify();
  });
});
