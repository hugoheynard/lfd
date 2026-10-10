import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MediaSeriesView, MediaUploadFailureView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { BatchUploadStore, type UploadEntry } from '../batch-upload';
import { MediaLibraryHttpApi } from '../media-library-http-api';
import { MediaSeriesStore } from '../media-series';
import { SeriesEditor } from '../series-editor';
import { IMAGE_MEASURE } from '../upload-check';
import { MediaDeposit, NEW_SERIES, NO_SERIES, alreadyNote } from './media-deposit';

/**
 * Ce que ces cas tiennent : **la série du lot part avec chaque fichier**, et
 * une image déjà au fonds le DIT sans alarme — elle garde sa série (D2).
 */

const CARTE: MediaSeriesView = {
  id: 's1',
  title: 'Shooting carte 2026',
  shotOn: '2026-03-14',
  note: null,
  images: 3,
  createdAt: '2026-03-20T10:00:00.000Z',
};
const ATELIER: MediaSeriesView = { ...CARTE, id: 's0', title: 'Atelier', shotOn: null };

function entry(seriesId: string | null): UploadEntry {
  return {
    file: new File([new Uint8Array(1)], 'a.png', { type: 'image/png' }),
    name: 'a.png',
    state: 'déjà au fonds',
    reason: null,
    refusedBy: null,
    seriesId,
  };
}

const titles = (id: string): string | null => (id === 's0' ? 'Atelier' : null);

describe('le compte rendu — déjà au fonds (D2)', () => {
  it('nomme la série d’origine qu’elle garde', () => {
    expect(alreadyNote(entry('s0'), 's1', titles)).toBe(
      'Elle garde sa série d’origine, « Atelier ».',
    );
  });

  it('dit simplement qu’elle y est déjà quand c’est la même série', () => {
    expect(alreadyNote(entry('s1'), 's1', titles)).toBe('Elle est déjà dans cette série.');
  });

  it('dit qu’une image sans série n’en reçoit pas', () => {
    expect(alreadyNote(entry(null), 's1', titles)).toBe(
      'Elle n’a pas de série et n’en reçoit pas : un redépôt ne la change pas.',
    );
    expect(alreadyNote(entry(null), null, titles)).toBe('Rien n’a changé.');
  });

  it('ne crie pas quand la série d’origine n’est pas dans la liste', () => {
    expect(alreadyNote(entry('inconnue'), 's1', titles)).toBe('Elle garde sa série d’origine.');
  });
});

class FakeApi {
  seriesSent: (string | null)[] = [];
  async series(): Promise<readonly MediaSeriesView[]> {
    return [CARTE, ATELIER];
  }
  async upload(_file: File, seriesId: string | null = null) {
    this.seriesSent.push(seriesId);
    return { id: 'x', url: 'u', seriesId, alreadyInLibrary: false };
  }
  past: MediaUploadFailureView[] = [];
  failuresCalls = 0;
  async failures(): Promise<readonly MediaUploadFailureView[]> {
    this.failuresCalls += 1;
    return this.past;
  }
}

async function mount(created: string | undefined = undefined) {
  const api = new FakeApi();
  const opened: (MediaSeriesView | null)[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: MediaLibraryHttpApi, useValue: api },
      { provide: IMAGE_MEASURE, useValue: async () => ({ width: 800, height: 800 }) },
      BatchUploadStore,
      MediaSeriesStore,
      {
        provide: SeriesEditor,
        useValue: {
          edit: async (series: MediaSeriesView | null) => {
            opened.push(series);
            return created;
          },
        },
      },
    ],
  });
  await TestBed.inject(MediaSeriesStore).refresh();
  const fixture = TestBed.createComponent(MediaDeposit);
  let passed = 0;
  fixture.componentInstance.passed.subscribe(() => (passed += 1));
  fixture.detectChanges();
  return { deposit: fixture.componentInstance, api, opened, passed: () => passed };
}

const png = (name: string): File =>
  new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });

describe('la série au dépôt (D3)', () => {
  it('est facultative : sans choix, le lot part sans série', async () => {
    const { deposit, api, passed } = await mount();

    await deposit['deposit']([png('a.png')]);

    expect(api.seriesSent).toEqual([null]);
    expect(passed()).toBe(1);
  });

  it('envoie la série choisie avec chaque fichier', async () => {
    const { deposit, api } = await mount();

    await deposit['pick']('s1');
    await deposit['deposit']([png('a.png'), png('b.png')]);

    expect(api.seriesSent).toEqual(['s1', 's1']);
    expect(deposit['shownBatchSeries']()?.title).toBe('Shooting carte 2026');
  });

  it('liste « Aucune », les séries dans l’ordre du serveur, puis « Nouvelle série… »', async () => {
    const { deposit } = await mount();

    expect(deposit['options']().map((option) => option.value)).toEqual([
      NO_SERIES,
      's1',
      's0',
      NEW_SERIES,
    ]);
    expect(deposit['options']()[1]?.label).toBe('Shooting carte 2026 · mars 2026');
  });

  it('« Nouvelle série… » ouvre le panneau et choisit la série créée', async () => {
    const { deposit, opened } = await mount('s-neuve');

    await deposit['pick'](NEW_SERIES);

    expect(opened).toEqual([null]);
    expect(deposit['choice']()).toBe('s-neuve');
  });

  it('une création annulée revient au choix d’avant, jamais sur « Nouvelle série… »', async () => {
    const { deposit } = await mount(undefined);

    await deposit['pick']('s1');
    await deposit['pick'](NEW_SERIES);

    expect(deposit['choice']()).toBe('s1');
  });
});

describe("l'historique des refus", () => {
  const refusal: MediaUploadFailureView = {
    id: 'f1',
    fileName: 'croissant.heic',
    reason: 'Visuel refusé : format non accepté.',
    code: 'catalogue.media.unsupported_image',
    bytes: 1024,
    contentType: null,
    actorName: 'Hugo',
    occurredAt: '2026-09-23T08:00:00.000Z',
  };

  /**
   * Régression (2026-09-23) : le compte rendu d'un lot vivait en mémoire.
   * Fermer l'onglet l'effaçait. Lu à l'OUVERTURE : personne ne le consulte à
   * chaque visite.
   */
  it('lit le serveur à l’ouverture, pas au chargement', async () => {
    const { deposit, api } = await mount();
    expect(api.failuresCalls).toBe(0);

    api.past = [refusal];
    await deposit['togglePast']();

    expect(api.failuresCalls).toBe(1);
    expect(deposit['pastFailures']().map((failure) => failure.fileName)).toEqual([
      'croissant.heic',
    ]);
  });

  it('referme sans relire', async () => {
    const { deposit, api } = await mount();
    await deposit['togglePast']();
    await deposit['togglePast']();

    expect(deposit['showPast']()).toBe(false);
    expect(api.failuresCalls).toBe(1);
  });
});
