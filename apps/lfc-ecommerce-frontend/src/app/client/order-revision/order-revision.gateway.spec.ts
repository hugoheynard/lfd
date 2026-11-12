import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CardIncreasePayload } from '@lfd/contracts';
import { of } from 'rxjs';

import { AuthFacade } from '../../auth/auth.facade';
import { INTENT_KEY_HEADER } from '../gesture-intents';
import { OrderRevisionGateway } from './order-revision.gateway';

const URL = /\/orders\/ord_1\/revisions\/card-increase$/u;
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

const PAYLOAD: CardIncreasePayload = {
  expectedRevision: 0,
  expectedTotalCents: 1200,
  fulfillmentMethod: 'pickup',
  pickupAddressId: 'site_1',
  deliveryAddress: null,
  deliveryAddressId: null,
  requestedDeliveryDate: '2030-01-01',
  note: '',
  lines: [{ sku: 'VIE-001', quantity: 2 }],
};

describe('OrderRevisionGateway — la hausse par carte, une fois par intention', () => {
  let gateway: OrderRevisionGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthFacade, useValue: { accessToken$: () => of('jeton') } },
      ],
    });
    gateway = TestBed.inject(OrderRevisionGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  async function send(status: number, body: object | null): Promise<string | null> {
    const pending = gateway.proposeCardIncrease('ord_1', PAYLOAD);
    await tick();
    const request = http.expectOne((r) => URL.test(r.url));
    const key = request.request.headers.get(INTENT_KEY_HEADER);
    request.flush(body, { status, statusText: String(status) });
    await pending;
    return key;
  }

  /** Régression : la hausse partait sans clé ; un double envoi préparait deux paiements. */
  it('garde la clé après une panne, en prend une neuve après un refus « déjà demandé »', async () => {
    const first = await send(503, null);
    expect(first).toMatch(/^[0-9a-f-]{36}$/u);
    expect(await send(409, { code: 'orders.card_increase.already_proposed' })).toBe(first);
    expect(await send(200, {})).not.toBe(first);
  });
});
