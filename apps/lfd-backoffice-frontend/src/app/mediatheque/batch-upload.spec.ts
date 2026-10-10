import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { beforeEach, describe, expect, it } from 'vitest';

import { BatchUploadStore } from './batch-upload';
import { MediaLibraryHttpApi } from './media-library-http-api';
import { IMAGE_MEASURE, type MeasuredSize } from './upload-check';

/**
 * Ce que ces cas tiennent : **un fichier refusé ne prive pas les autres de leur
 * dépôt**, et le refus du serveur arrive jusqu'à l'écran en français.
 *
 * Un import en lot qui s'arrête au premier mauvais fichier oblige à trier à la
 * main ce qui est passé et ce qui reste — c'est exactement le travail que le
 * lot devait éviter.
 */

function image(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

/** Le refus tel que le backend l'enveloppe — `message` ne suffit pas. */
function refusal(message: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 400, error: { message } });
}

class FakeApi {
  refuse = new Map<string, HttpErrorResponse>();
  /** Les fichiers déjà au fonds, et leur série d'origine. */
  known = new Map<string, string | null>();
  sent: string[] = [];
  seriesSent: (string | null)[] = [];

  async upload(
    file: File,
    seriesId: string | null = null,
  ): Promise<{ id: string; url: string; seriesId: string | null; alreadyInLibrary: boolean }> {
    const refused = this.refuse.get(file.name);
    if (refused !== undefined) {
      throw refused;
    }
    this.sent.push(file.name);
    this.seriesSent.push(seriesId);
    const already = this.known.has(file.name);
    return {
      id: file.name,
      url: `https://cdn.test/${file.name}`,
      seriesId: already ? (this.known.get(file.name) ?? null) : seriesId,
      alreadyInLibrary: already,
    };
  }
}

let api: FakeApi;
/** Les dimensions que le « navigateur » lit, par nom de fichier. Absent : 800×600. */
let sizes: Map<string, MeasuredSize | null>;

function store(): BatchUploadStore {
  TestBed.resetTestingModule();
  api = new FakeApi();
  sizes = new Map();
  TestBed.configureTestingModule({
    providers: [
      { provide: MediaLibraryHttpApi, useFactory: () => api },
      {
        provide: IMAGE_MEASURE,
        useValue: async (file: File) =>
          sizes.has(file.name) ? (sizes.get(file.name) ?? null) : { width: 800, height: 600 },
      },
      BatchUploadStore,
    ],
  });
  return TestBed.inject(BatchUploadStore);
}

beforeEach(() => {
  // Chaque cas repart d'un magasin neuf : le compte rendu est de l'état.
});

describe('le dépôt en lot', () => {
  it('dépose tout le lot, dans l’ordre', async () => {
    const batch = store();

    const sent = await batch.send([image('a.png'), image('b.png'), image('c.png')]);

    expect(sent).toBe(3);
    expect(api.sent).toEqual(['a.png', 'b.png', 'c.png']);
    expect(batch.deposited()).toBe(3);
  });

  /**
   * Le cœur du fichier : un mauvais fichier ne doit pas coûter les autres.
   */
  it('ne s’arrête PAS sur un refus', async () => {
    const batch = store();
    api.refuse.set('b.png', refusal('Visuel refusé : format non accepté.'));

    const sent = await batch.send([image('a.png'), image('b.png'), image('c.png')]);

    expect(sent).toBe(2);
    expect(api.sent).toEqual(['a.png', 'c.png']);
    expect(batch.refused()).toBe(1);
  });

  it('rend le refus du serveur, pas « Http failure response »', async () => {
    const batch = store();
    api.refuse.set('a.png', refusal('Visuel refusé : format non accepté.'));

    await batch.send([image('a.png')]);

    expect(batch.entries()[0]?.reason).toBe('Visuel refusé : format non accepté.');
  });

  /**
   * Réessayer ne rejoue QUE les refusés : redéposer les autres serait sans
   * dommage (la clé est le hachage du contenu) mais ferait payer à nouveau le
   * transfert de tout le lot.
   */
  it('ne rejoue que les refusés, et les fait passer quand ça se débloque', async () => {
    const batch = store();
    api.refuse.set('b.png', refusal('Trop lourd.'));
    await batch.send([image('a.png'), image('b.png')]);
    api.refuse.clear();

    const sent = await batch.retry();

    expect(sent).toBe(1);
    expect(api.sent).toEqual(['a.png', 'b.png']);
    expect(batch.refused()).toBe(0);
    expect(batch.deposited()).toBe(2);
  });

  it('garde le fichier pour pouvoir le rejouer sans le redemander', async () => {
    const batch = store();
    api.refuse.set('a.png', refusal('Trop lourd.'));

    await batch.send([image('a.png')]);

    expect(batch.entries()[0]?.file.name).toBe('a.png');
    expect(batch.hasRefused()).toBe(true);
  });

  it('oublie le compte rendu quand on le lui demande', async () => {
    const batch = store();
    await batch.send([image('a.png')]);

    batch.clear();

    expect(batch.entries()).toEqual([]);
    expect(batch.deposited()).toBe(0);
  });
});

describe('le dépôt en lot — vérifié avant l’envoi (L3)', () => {
  it('n’envoie pas un fichier trop petit, et dit pourquoi comme le serveur', async () => {
    const batch = store();
    sizes.set('icone.png', { width: 64, height: 64 });

    const sent = await batch.send([image('a.png'), image('icone.png')]);

    expect(sent).toBe(1);
    expect(api.sent).toEqual(['a.png']);
    expect(batch.entries()[1]).toMatchObject({
      state: 'refusé',
      refusedBy: 'poste',
      reason: 'Visuel refusé : 64×64 est trop petit — 200 px minimum sur chaque côté.',
    });
  });

  it('ne propose pas de réessayer un refus du poste — il le serait encore', async () => {
    const batch = store();
    sizes.set('icone.png', { width: 64, height: 64 });

    await batch.send([image('icone.png')]);

    expect(batch.refused()).toBe(1);
    expect(batch.hasRefused()).toBe(false);
  });

  it('laisse le serveur juger quand le navigateur ne sait pas lire les dimensions', async () => {
    const batch = store();
    sizes.set('rare.png', null);

    await batch.send([image('rare.png')]);

    expect(api.sent).toEqual(['rare.png']);
  });
});

describe('le dépôt en lot — la série (L3)', () => {
  it('envoie la série du lot avec chaque fichier, réessais compris', async () => {
    const batch = store();
    api.refuse.set('b.png', refusal('Réseau.'));
    await batch.send([image('a.png'), image('b.png')], 's1');
    api.refuse.clear();

    await batch.retry();

    expect(api.seriesSent).toEqual(['s1', 's1']);
  });

  it('dit « déjà au fonds » et garde la série d’origine (D2)', async () => {
    const batch = store();
    api.known.set('a.png', 's0');

    const sent = await batch.send([image('a.png'), image('b.png')], 's1');

    expect(sent).toBe(2);
    expect(batch.entries().map((entry) => [entry.state, entry.seriesId])).toEqual([
      ['déjà au fonds', 's0'],
      ['déposé', 's1'],
    ]);
    expect(batch.alreadyKnown()).toBe(1);
    expect(batch.deposited()).toBe(1);
  });
});
