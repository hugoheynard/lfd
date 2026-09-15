import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DeliveryProcedureConflictError, DeliveryProcedureWriteError } from '@lfd/b2b-ui/company';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdminDeliveryProcedureGateway } from './admin-delivery-procedure.gateway';

/**
 * La passerelle staff : les chemins du §2.5, le multipart que le serveur lit,
 * et la traduction du 409 en conflit — c'est lui qui fait recharger l'éditeur.
 */
describe('AdminDeliveryProcedureGateway', () => {
  let http: HttpTestingController;
  let gateway: AdminDeliveryProcedureGateway;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    gateway = new AdminDeliveryProcedureGateway(TestBed.inject(HttpClient), 'co_1');
  });

  const base = '/admin/companies/co_1/delivery-addresses/adr_1/procedure';

  it('ajoute une étape en multipart, photo sous `photo`, et rend son identifiant', async () => {
    const photo = new Blob(['jpeg'], { type: 'image/jpeg' });
    const adding = gateway.addStep('adr_1', { title: 'Portail', body: 'Code 4512' }, photo);

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
    const request = http.expectOne((r) => r.url.endsWith(`${base}/steps`));
    expect((request.request.body as FormData).has('photo')).toBe(false);
    request.flush({ id: 'stp_9' });
    await adding;
  });

  it.each([
    [{ kind: 'keep' } as const, 'false', false],
    [{ kind: 'remove' } as const, 'true', false],
  ])('refaire une étape (%o) envoie removePhoto=%s', async (change, removePhoto, hasPhoto) => {
    const revising = gateway.reviseStep('adr_1', 'stp_1', { title: 'T', body: '' }, change);
    const request = http.expectOne((r) => r.url.endsWith(`${base}/steps/stp_1`));
    expect(request.request.method).toBe('PATCH');
    const body = request.request.body as FormData;
    expect(body.get('removePhoto')).toBe(removePhoto);
    expect(body.has('photo')).toBe(hasPhoto);
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
    const request = http.expectOne((r) => r.url.endsWith(`${base}/steps/stp_1`));
    const body = request.request.body as FormData;
    expect(body.get('removePhoto')).toBe('false');
    expect(body.get('photo')).toBeInstanceOf(Blob);
    request.flush(null, { status: 204, statusText: 'No Content' });
    await revising;
  });

  it('pose l’ordre en JSON', async () => {
    const reordering = gateway.reorder('adr_1', ['b', 'a']);
    const request = http.expectOne((r) => r.url.endsWith(`${base}/order`));
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ stepIds: ['b', 'a'] });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await reordering;
  });

  it('lit la photo en blob, révision dans l’URL', async () => {
    const reading = gateway.photo('adr_1', 'stp_1', 'rev_7');
    const request = http.expectOne((r) => r.url.endsWith(`${base}/steps/stp_1/photo`));
    expect(request.request.params.get('rev')).toBe('rev_7');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['jpeg']));
    expect(await reading).toBeInstanceOf(Blob);
  });

  it('un 409 devient un conflit — l’éditeur rechargera', async () => {
    const reordering = gateway.reorder('adr_1', ['a']);
    http
      .expectOne((r) => r.url.endsWith(`${base}/order`))
      .flush({ message: 'La procédure a changé.' }, { status: 409, statusText: 'Conflict' });

    await expect(reordering).rejects.toBeInstanceOf(DeliveryProcedureConflictError);
  });

  it('un autre refus garde le message sûr de l’enveloppe', async () => {
    const removing = gateway.removeStep('adr_1', 'stp_1');
    http
      .expectOne((r) => r.url.endsWith(`${base}/steps/stp_1`))
      .flush({ message: 'Photo trop lourde.' }, { status: 400, statusText: 'Bad Request' });

    const error = await removing.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DeliveryProcedureWriteError);
    expect((error as Error).message).toBe('Photo trop lourde.');
  });
});
