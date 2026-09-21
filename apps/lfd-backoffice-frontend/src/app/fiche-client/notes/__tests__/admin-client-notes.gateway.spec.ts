import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PhotoCardsConflictError, PhotoCardsWriteError } from '@lfd/b2b-ui/photo-cards';
import type { ClientNotebookView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdminClientNotesGateway } from '../admin-client-notes.gateway';

/**
 * La passerelle staff des notes : les chemins que sert le lot 3, le multipart
 * photo + vignette (les deux ou aucune), et la traduction du 409 en conflit —
 * c'est lui qui fait recharger l'éditeur.
 */
describe('AdminClientNotesGateway', () => {
  let http: HttpTestingController;
  let gateway: AdminClientNotesGateway;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    gateway = new AdminClientNotesGateway(TestBed.inject(HttpClient), 'co_1');
  });

  const base = '/admin/companies/co_1/notes';
  const photo = new Blob(['lisible'], { type: 'image/jpeg' });
  const thumbnail = new Blob(['v'], { type: 'image/jpeg' });

  it('lit le carnet et rend ses notes dans l’ordre', async () => {
    const notebook: ClientNotebookView = {
      companyId: 'co_1',
      notes: [
        {
          id: 'n1',
          number: 1,
          title: 'Visite',
          body: '',
          photoRevision: null,
          createdAt: '2026-09-15T08:00:00.000Z',
          createdByName: 'Camille',
        },
      ],
    };
    const loading = gateway.load();
    const request = http.expectOne((r) => r.url.endsWith(base));
    expect(request.request.method).toBe('GET');
    request.flush(notebook);

    expect((await loading).map((note) => note.id)).toEqual(['n1']);
  });

  it('ajoute une note en multipart, photo ET vignette, et rend son identifiant', async () => {
    const adding = gateway.add({ title: 'Visite', body: 'Rappeler lundi' }, photo, thumbnail);

    const request = http.expectOne((r) => r.url.endsWith(base));
    expect(request.request.method).toBe('POST');
    const body = request.request.body as FormData;
    expect(body.get('title')).toBe('Visite');
    expect(body.get('body')).toBe('Rappeler lundi');
    expect((body.get('photo') as Blob).size).toBe(photo.size);
    expect((body.get('thumbnail') as Blob).size).toBe(thumbnail.size);
    request.flush({ id: 'n9' });

    expect(await adding).toBe('n9');
  });

  it('une note sans photo ne joint aucun fichier', async () => {
    const adding = gateway.add({ title: 'Visite', body: '' }, null);
    const request = http.expectOne((r) => r.url.endsWith(base));
    const body = request.request.body as FormData;
    expect(body.has('photo')).toBe(false);
    expect(body.has('thumbnail')).toBe(false);
    request.flush({ id: 'n9' });
    await adding;
  });

  it('refuse d’envoyer une photo sans sa vignette — le serveur la refuserait', async () => {
    await expect(gateway.add({ title: 'Visite', body: '' }, photo)).rejects.toBeInstanceOf(
      PhotoCardsWriteError,
    );
    http.expectNone((r) => r.url.endsWith(base));
  });

  it.each([
    [{ kind: 'keep' } as const, 'false'],
    [{ kind: 'remove' } as const, 'true'],
  ])('refaire une note (%o) envoie removePhoto=%s, sans fichier', async (change, removePhoto) => {
    const revising = gateway.revise('n1', { title: 'T', body: '' }, change);
    const request = http.expectOne((r) => r.url.endsWith(`${base}/n1`));
    expect(request.request.method).toBe('PATCH');
    const body = request.request.body as FormData;
    expect(body.get('removePhoto')).toBe(removePhoto);
    expect(body.has('photo')).toBe(false);
    expect(body.has('thumbnail')).toBe(false);
    request.flush(null, { status: 204, statusText: 'No Content' });
    await revising;
  });

  it('remplacer la photo joint la paire, sans demander de la retirer', async () => {
    const revising = gateway.revise(
      'n1',
      { title: 'T', body: '' },
      { kind: 'replace', photo, thumbnail },
    );
    const request = http.expectOne((r) => r.url.endsWith(`${base}/n1`));
    const body = request.request.body as FormData;
    expect(body.get('removePhoto')).toBe('false');
    expect(body.get('photo')).toBeInstanceOf(Blob);
    expect(body.get('thumbnail')).toBeInstanceOf(Blob);
    request.flush(null, { status: 204, statusText: 'No Content' });
    await revising;
  });

  it('supprime par DELETE', async () => {
    const removing = gateway.remove('n1');
    const request = http.expectOne((r) => r.url.endsWith(`${base}/n1`));
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await removing;
  });

  it('pose l’ordre en JSON, sous `noteIds`', async () => {
    const reordering = gateway.reorder(['b', 'a']);
    const request = http.expectOne((r) => r.url.endsWith(`${base}/order`));
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ noteIds: ['b', 'a'] });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await reordering;
  });

  it.each([
    ['photo', (g: AdminClientNotesGateway) => g.photo('n1', 'rev_7')],
    ['thumbnail', (g: AdminClientNotesGateway) => g.thumbnail('n1', 'rev_7')],
  ])('lit « %s » en blob, sur sa propre route, révision dans l’URL', async (route, read) => {
    const reading = read(gateway);
    const request = http.expectOne((r) => r.url.endsWith(`${base}/n1/${route}`));
    expect(request.request.params.get('rev')).toBe('rev_7');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['jpeg']));
    expect(await reading).toBeInstanceOf(Blob);
  });

  it('un 409 devient un conflit — l’éditeur rechargera', async () => {
    const reordering = gateway.reorder(['a']);
    http
      .expectOne((r) => r.url.endsWith(`${base}/order`))
      .flush({ message: 'Les notes ont changé.' }, { status: 409, statusText: 'Conflict' });

    await expect(reordering).rejects.toBeInstanceOf(PhotoCardsConflictError);
  });

  it('un autre refus garde le message sûr de l’enveloppe', async () => {
    const removing = gateway.remove('n1');
    http
      .expectOne((r) => r.url.endsWith(`${base}/n1`))
      .flush({ message: 'Note introuvable.' }, { status: 404, statusText: 'Not Found' });

    const error = await removing.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PhotoCardsWriteError);
    expect(error).not.toBeInstanceOf(PhotoCardsConflictError);
    expect((error as Error).message).toBe('Note introuvable.');
  });
});
