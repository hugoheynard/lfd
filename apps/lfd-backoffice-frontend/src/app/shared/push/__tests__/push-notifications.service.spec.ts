import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { B2B_API_BASE } from '../../../api/api-config';
import { PushNotificationsService } from '../push-notifications.service';

/** La route « à moi » (B5) : l'ancienne exigeait la cloche partagée. */
const MINE = `${B2B_API_BASE}/admin/me/notifications/push`;

interface FakeSubscription {
  readonly endpoint: string;
  unsubscribed: boolean;
  unsubscribe(): Promise<boolean>;
}

function subscriptionOf(endpoint: string): FakeSubscription {
  return {
    endpoint,
    unsubscribed: false,
    unsubscribe() {
      this.unsubscribed = true;
      return Promise.resolve(true);
    },
  };
}

let current: FakeSubscription | null = null;

beforeEach(() => {
  current = null;
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { permission: 'default' });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: () =>
        Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(current) } }),
    },
  });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('PushNotificationsService', () => {
  it('lit la capacité par la route « à moi », pas par celle de la cloche', async () => {
    const service = TestBed.inject(PushNotificationsService);
    const http = TestBed.inject(HttpTestingController);

    const done = service.refresh();
    await vi.waitFor(() => http.expectOne(`${MINE}/key`).flush({ publicKey: null }));
    await done;

    http.verify();
    expect(service.state()).toBe('unconfigured');
  });

  it('désabonne par la route « à moi », le serveur avant le navigateur', async () => {
    current = subscriptionOf('https://push.example/abc');
    const service = TestBed.inject(PushNotificationsService);
    const http = TestBed.inject(HttpTestingController);

    const done = service.unsubscribe();
    await vi.waitFor(() => {
      const request = http.expectOne({ method: 'DELETE', url: MINE });
      expect(request.request.body).toEqual({ endpoint: 'https://push.example/abc' });
      expect(current?.unsubscribed).toBe(false);
      request.flush(null);
    });
    await vi.waitFor(() => http.expectOne(`${MINE}/key`).flush({ publicKey: null }));
    await done;

    http.verify();
    expect(current.unsubscribed).toBe(true);
  });
});
