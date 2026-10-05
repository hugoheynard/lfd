import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CreateSubAccountPayload } from '@lfd/contracts';
import { EMPTY_DELIVERY_DRAFT, toDeliveryPayload } from '@lfd/b2b-ui/company';
import { afterEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { AdminCompanyHierarchyService } from '../admin-company-hierarchy.service';

const URL = `${B2B_API_BASE}/admin/companies`;

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setup(): { service: AdminCompanyHierarchyService; http: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(AdminCompanyHierarchyService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('AdminCompanyHierarchyService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('crée un sous-compte sous son principal et rend son identifiant', async () => {
    const { service, http } = setup();
    const payload: CreateSubAccountPayload = {
      raisonSociale: '',
      enseigne: 'Chalet A',
      formeJuridique: '',
      siret: '',
      siren: '',
      vatNumber: '',
      deliveryAddress: toDeliveryPayload(EMPTY_DELIVERY_DRAFT),
      follows: ['billing'],
    };
    const promise = service.createSubAccount('parent_1', payload);
    await flush();

    const req = http.expectOne(`${URL}/parent_1/sub-accounts`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ id: 'child_1' });

    await expect(promise).resolves.toBe('child_1');
  });

  it('rattache par la route du sous-compte, en nommant le principal', async () => {
    const { service, http } = setup();
    const promise = service.attach('child_1', 'parent_1');
    await flush();

    const req = http.expectOne(`${URL}/child_1/parent`);
    expect(req.request.body).toEqual({ parentId: 'parent_1' });
    req.flush(null);
    await promise;
  });

  it('détache par un POST — rien n’est supprimé', async () => {
    const { service, http } = setup();
    const promise = service.detach('child_1');
    await flush();

    const req = http.expectOne(`${URL}/child_1/parent/detach`);
    expect(req.request.method).toBe('POST');
    req.flush(null);
    await promise;
  });

  it('la facturation et les contacts passent par la route de la fiche', async () => {
    const { service, http } = setup();
    const follow = service.setFollowing('child_1', 'billing', true);
    await flush();
    const on = http.expectOne(`${URL}/child_1/follows`);
    expect(on.request.body).toEqual({ aspect: 'billing' });
    on.flush(null);
    await follow;

    const stop = service.setFollowing('child_1', 'contacts', false);
    await flush();
    const off = http.expectOne(`${URL}/child_1/follows/stop`);
    expect(off.request.body).toEqual({ aspect: 'contacts' });
    off.flush(null);
    await stop;
  });

  it('le tarif passe par SA route, celle de la tarification (Q9)', async () => {
    const { service, http } = setup();
    const follow = service.setFollowing('child_1', 'pricing', true);
    await flush();
    http.expectOne(`${URL}/child_1/pricing-follow`).flush(null);
    await follow;

    const stop = service.setFollowing('child_1', 'pricing', false);
    await flush();
    http.expectOne(`${URL}/child_1/pricing-follow/stop`).flush(null);
    await stop;
  });

  it('pose la case « Compte de groupe, sans livraison »', async () => {
    const { service, http } = setup();
    const promise = service.setGroupWithoutDelivery('parent_1', true);
    await flush();

    const req = http.expectOne(`${URL}/parent_1/group-without-delivery`);
    expect(req.request.body).toEqual({ enabled: true });
    req.flush(null);
    await promise;
  });
});
