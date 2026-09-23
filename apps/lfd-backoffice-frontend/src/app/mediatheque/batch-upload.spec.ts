import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { beforeEach, describe, expect, it } from 'vitest';

import { BatchUploadStore } from './batch-upload';
import { MediaLibraryHttpApi } from './media-library-http-api';

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
  sent: string[] = [];

  async upload(file: File): Promise<{ id: string; url: string }> {
    const refused = this.refuse.get(file.name);
    if (refused !== undefined) {
      throw refused;
    }
    this.sent.push(file.name);
    return { id: file.name, url: `https://cdn.test/${file.name}` };
  }
}

let api: FakeApi;

function store(): BatchUploadStore {
  TestBed.resetTestingModule();
  api = new FakeApi();
  TestBed.configureTestingModule({
    providers: [{ provide: MediaLibraryHttpApi, useFactory: () => api }, BatchUploadStore],
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
