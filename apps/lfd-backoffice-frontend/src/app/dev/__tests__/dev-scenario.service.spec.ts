import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { DevScenarioView } from '@lfd/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { DevScenarioService } from '../dev-scenario.service';

const URL = `${B2B_API_BASE}/admin/dev/scenario`;

const VIEW: DevScenarioView = { day: '2026-10-05', reached: 1, steps: [], databaseBytes: 1 };

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setup(): { service: DevScenarioService; http: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(DevScenarioService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('DevScenarioService', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('relit l’état après une étape jouée', async () => {
    const { service, http } = setup();

    const played = service.next();
    http.expectOne({ method: 'POST', url: `${URL}/next` }).flush({ played: 2 });
    await flush();
    http.expectOne({ method: 'GET', url: URL }).flush(VIEW);

    await expect(played).resolves.toEqual({ played: 2 });
    expect(service.view()).toEqual(VIEW);
  });

  it('relit l’état AUSSI après un refus, et relance le refus', async () => {
    const { service, http } = setup();

    const played = service.next();
    const outcome = played.catch((error: unknown) => error);
    http
      .expectOne(`${URL}/next`)
      .flush({ message: 'Déjà à la dernière étape.' }, { status: 409, statusText: 'Conflict' });
    await flush();
    http.expectOne(URL).flush(VIEW);

    expect(await outcome).toMatchObject({ status: 409 });
    expect(service.view()).toEqual(VIEW);
  });

  it('retient l’échec de lecture : une page vide ne doit pas mentir', async () => {
    const { service, http } = setup();

    const read = service.refresh().catch((error: unknown) => error);
    http.expectOne(URL).flush(null, { status: 500, statusText: 'Server Error' });

    expect(await read).toMatchObject({ status: 500 });
    expect(service.loadError()).not.toBeNull();
    expect(service.view()).toBeNull();
  });

  it('remet à l’état de base puis relit', async () => {
    const { service, http } = setup();

    const reset = service.reset();
    http
      .expectOne({ method: 'POST', url: `${URL}/reset` })
      .flush({ day: '2026-10-05', removed: [], storage: [], placed: 38 });
    await flush();
    http.expectOne(URL).flush(VIEW);

    await expect(reset).resolves.toMatchObject({ placed: 38 });
  });
});
