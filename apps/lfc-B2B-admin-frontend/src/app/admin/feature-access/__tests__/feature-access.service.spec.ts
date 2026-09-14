import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { AdminFeatureAccessView } from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../../api/api-config';
import { FeatureAccessService } from '../feature-access.service';

/**
 * Le service ne fait que deux choses, et les deux comptent : il frappe la bonne
 * route avec la bonne charge, et **il relit après chaque écriture**. Sans la
 * relecture, l'écran garderait la valeur d'avant — et l'état d'un compte
 * exempté, que seul le serveur connaît, resterait celui qu'on a deviné.
 */
const BASE = `${B2B_API_BASE}/admin/feature-access`;

const BOARD: AdminFeatureAccessView = { features: [], ignored: [] };

let service: FeatureAccessService;
let ctrl: HttpTestingController;

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  service = TestBed.inject(FeatureAccessService);
  ctrl = TestBed.inject(HttpTestingController);
});

afterEach(() => {
  ctrl.verify();
});

/** Laisse `firstValueFrom` résoudre et la relecture partir. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

/** Répond à l'écriture, puis à la relecture — et rend ce que l'écriture a rendu. */
async function answerWriteThenBoard(
  method: string,
  url: string,
  pending: Promise<AdminFeatureAccessView>,
): Promise<{ body: unknown; result: AdminFeatureAccessView }> {
  const write = ctrl.expectOne((request) => request.method === method && request.url === url);
  const body = write.request.body;
  write.flush(null, { status: 204, statusText: 'No Content' });
  await settle();
  ctrl.expectOne((request) => request.method === 'GET' && request.url === BASE).flush(BOARD);
  return { body, result: await pending };
}

describe('FeatureAccessService', () => {
  it('lit le tableau sur la route staff', async () => {
    const pending = service.board();
    ctrl.expectOne({ method: 'GET', url: BASE }).flush(BOARD);
    expect(await pending).toEqual(BOARD);
  });

  it('pose une dérogation par PUT sur la clé, puis relit', async () => {
    const { body, result } = await answerWriteThenBoard(
      'PUT',
      `${BASE}/shop`,
      service.setOverride('shop', 'browse'),
    );
    expect(body).toEqual({ value: 'browse' });
    expect(result).toEqual(BOARD);
  });

  it('revient au défaut par DELETE sur la clé, puis relit', async () => {
    const { result } = await answerWriteThenBoard(
      'DELETE',
      `${BASE}/shop`,
      service.clearOverride('shop'),
    );
    expect(result).toEqual(BOARD);
  });

  it('ajoute une adresse par POST sur les exemptions de la clé, puis relit', async () => {
    const { body } = await answerWriteThenBoard(
      'POST',
      `${BASE}/shop/exemptions`,
      service.addExemption('shop', 'testeur@lfc.test'),
    );
    expect(body).toEqual({ email: 'testeur@lfc.test' });
  });

  it('retire une adresse par DELETE sur son identifiant, puis relit', async () => {
    await answerWriteThenBoard(
      'DELETE',
      `${BASE}/shop/exemptions/ex_1`,
      service.removeExemption('shop', 'ex_1'),
    );
  });

  it("ne relit pas quand l'écriture est refusée", async () => {
    // Le refus remonte tel quel à l'écran, qui le notifie et relit lui-même :
    // une relecture ici masquerait l'erreur derrière un tableau à jour.
    const pending = service.setOverride('shop', 'nimportequoi');
    ctrl
      .expectOne({ method: 'PUT', url: `${BASE}/shop` })
      .flush({ message: 'Niveau inconnu' }, { status: 400, statusText: 'Bad Request' });
    await expect(pending).rejects.toBeTruthy();
    await settle();
    ctrl.expectNone(BASE);
  });
});
