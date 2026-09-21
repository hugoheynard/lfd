import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  DeliveryProcedureConflictError,
  DeliveryProcedureGateway,
  DeliveryProcedureWriteError,
} from '@lfd/b2b-ui/company';
import { of } from 'rxjs';

import { AuthFacade } from '../auth/auth.facade';
import { clientDeliveryProcedureGateway } from './client-delivery-procedure.gateway';

/**
 * La passerelle client : les chemins murés du plan §2.5, le jeton porté sur
 * chaque appel (photo comprise — une `<img src>` ne le porterait pas), le
 * multipart que le serveur lit, et la traduction du 409 en conflit.
 */
describe('ClientDeliveryProcedureGateway', () => {
  let http: HttpTestingController;
  let gateway: DeliveryProcedureGateway;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthFacade, useValue: { accessToken$: () => of('jeton') } },
        // Le fournisseur que le dialogue reçoit : la société est liée ici.
        clientDeliveryProcedureGateway('cmp_1'),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    gateway = TestBed.inject(DeliveryProcedureGateway);
  });

  afterEach(() => http.verify());

  const base = '/companies/cmp_1/delivery-addresses/adr_1/procedure';

  /** Le jeton arrive par un `await` : la requête part une microtâche plus tard. */
  const flushToken = (): Promise<void> => Promise.resolve();

  it('lit la procédure sous le mur de la société, jeton porté', async () => {
    const loading = gateway.load('adr_1');
    await flushToken();

    const request = http.expectOne((r) => r.url.endsWith(base));
    expect(request.request.method).toBe('GET');
    expect(request.request.url).not.toContain('/admin/');
    expect(request.request.headers.get('Authorization')).toBe('Bearer jeton');
    request.flush({ addressId: 'adr_1', steps: [] });

    expect(await loading).toEqual({ addressId: 'adr_1', steps: [] });
  });

  it('ajoute une étape en multipart, photo sous `photo`, et rend son identifiant', async () => {
    const photo = new Blob(['jpeg'], { type: 'image/jpeg' });
    const adding = gateway.addStep('adr_1', { title: 'Portail', body: 'Code 4512' }, photo);
    await flushToken();

    const request = http.expectOne((r) => r.url.endsWith(`${base}/steps`));
    expect(request.request.method).toBe('POST');
    const body = request.request.body as FormData;
    expect(body.get('title')).toBe('Portail');
    expect(body.get('body')).toBe('Code 4512');
    expect(body.get('photo')).toBeInstanceOf(Blob);
    request.flush({ id: 'stp_9' });

    expect(await adding).toBe('stp_9');
  });

  it('une étape sans photo ne joint aucun fichier', async () => {
    const adding = gateway.addStep('adr_1', { title: 'Portail', body: '' }, null);
    await flushToken();
    const request = http.expectOne((r) => r.url.endsWith(`${base}/steps`));
    expect((request.request.body as FormData).has('photo')).toBe(false);
    request.flush({ id: 'stp_9' });
    await adding;
  });

  it.each([
    [{ kind: 'keep' } as const, 'false'],
    [{ kind: 'remove' } as const, 'true'],
  ])('refaire une étape (%o) envoie removePhoto=%s, sans fichier', async (change, removePhoto) => {
    const revising = gateway.reviseStep('adr_1', 'stp_1', { title: 'T', body: '' }, change);
    await flushToken();
    const request = http.expectOne((r) => r.url.endsWith(`${base}/steps/stp_1`));
    expect(request.request.method).toBe('PATCH');
    const body = request.request.body as FormData;
    expect(body.get('removePhoto')).toBe(removePhoto);
    expect(body.has('photo')).toBe(false);
    request.flush(null, { status: 204, statusText: 'No Content' });
    await revising;
  });

  it('remplacer la photo la joint, sans demander de la retirer', async () => {
    const photo = new Blob(['jpeg'], { type: 'image/jpeg' });
    const revising = gateway.reviseStep(
      'adr_1',
      'stp_1',
      { title: 'T', body: '' },
      { kind: 'replace', photo },
    );
    await flushToken();
    const body = http.expectOne((r) => r.url.endsWith(`${base}/steps/stp_1`));
    expect((body.request.body as FormData).get('removePhoto')).toBe('false');
    expect((body.request.body as FormData).get('photo')).toBeInstanceOf(Blob);
    body.flush(null, { status: 204, statusText: 'No Content' });
    await revising;
  });

  it('supprime une étape par DELETE', async () => {
    const removing = gateway.removeStep('adr_1', 'stp_1');
    await flushToken();
    const request = http.expectOne((r) => r.url.endsWith(`${base}/steps/stp_1`));
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await removing;
  });

  it('pose l’ordre en JSON', async () => {
    const reordering = gateway.reorder('adr_1', ['b', 'a']);
    await flushToken();
    const request = http.expectOne((r) => r.url.endsWith(`${base}/order`));
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ stepIds: ['b', 'a'] });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await reordering;
  });

  it('lit la photo en blob, révision dans l’URL et jeton porté', async () => {
    const reading = gateway.photo('adr_1', 'stp_1', 'rev_7');
    await flushToken();
    const request = http.expectOne((r) => r.url.endsWith(`${base}/steps/stp_1/photo`));
    expect(request.request.params.get('rev')).toBe('rev_7');
    expect(request.request.responseType).toBe('blob');
    expect(request.request.headers.get('Authorization')).toBe('Bearer jeton');
    request.flush(new Blob(['jpeg']));
    expect(await reading).toBeInstanceOf(Blob);
  });

  it('un 409 devient un conflit — l’éditeur rechargera', async () => {
    const reordering = gateway.reorder('adr_1', ['a']);
    await flushToken();
    http
      .expectOne((r) => r.url.endsWith(`${base}/order`))
      .flush({ message: 'La procédure a changé.' }, { status: 409, statusText: 'Conflict' });

    await expect(reordering).rejects.toBeInstanceOf(DeliveryProcedureConflictError);
  });

  it.each([
    [400, 'Photo trop lourde.'],
    [404, 'Étape introuvable.'],
  ])('un %i garde le message sûr de l’enveloppe', async (status, message) => {
    const removing = gateway.removeStep('adr_1', 'stp_1');
    await flushToken();
    http
      .expectOne((r) => r.url.endsWith(`${base}/steps/stp_1`))
      .flush({ message }, { status, statusText: 'Refus' });

    const error = await removing.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DeliveryProcedureWriteError);
    expect((error as Error).message).toBe(message);
  });
});
