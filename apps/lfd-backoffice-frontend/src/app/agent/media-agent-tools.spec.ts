import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  LibraryMediaView,
  MediaDetailsPayload,
  MediaLibraryPageView,
  MediaPaletteStripView,
} from '@lfd/pim-contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MediaCarriersApi } from '../mediatheque/data/media-carriers-api';
import { MediaImagesApi } from '../mediatheque/data/media-images-api';
import { MediaPaletteApi } from '../mediatheque/data/media-palette-api';
import { MediaSeriesApi } from '../mediatheque/data/media-series-api';
import { MediaTagsApi } from '../mediatheque/data/media-tags-api';
import type { MediaPageRequest } from '../mediatheque/rules/media-page-request';

import { declareMediaAgentTools } from './media-agent-tools';

type ToolArgs = Record<
  string,
  string | number | boolean | readonly string[] | readonly Record<string, unknown>[]
>;

interface RegisteredTool {
  readonly name: string;
  readonly execute: (args: ToolArgs) => Promise<string>;
}

function image(url: string, overrides: Partial<LibraryMediaView> = {}): LibraryMediaView {
  return {
    url,
    name: 'Brioche dorée',
    tags: ['brioche', 'four'],
    alt: { fr: 'Une brioche', en: 'A brioche' },
    focal: { x: 0.3, y: 0.6 },
    uses: 2,
    depositedAt: '2026-10-01T08:00:00.000Z',
    series: null,
    palette: null,
    width: 1200,
    height: 800,
    bytes: 1000,
    contentType: 'image/webp',
    ...overrides,
  };
}

/**
 * Arme la trousse devant une passerelle WebMCP doublée et un fonds en mémoire,
 * servi en pages de `pageSize` pour éprouver le parcours par curseur.
 */
function armTools(fonds: readonly LibraryMediaView[], options: { describeFails?: boolean } = {}) {
  const registered = new Map<string, RegisteredTool>();
  const written: MediaDetailsPayload[] = [];
  const requests: MediaPageRequest[] = [];
  const reads: string[] = [];
  const uploads: { readonly name: string; readonly seriesId: string | null }[] = [];

  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    writable: true,
    value: {
      registerTool: (tool: RegisteredTool): Promise<void> => {
        registered.set(tool.name, tool);
        return Promise.resolve();
      },
    },
  });

  const pageSize = 2;
  const media: Pick<MediaImagesApi, 'page' | 'one' | 'describe' | 'upload'> &
    Pick<MediaCarriersApi, 'carriersOf'> &
    Pick<MediaTagsApi, 'tags' | 'renameTag'> &
    Pick<MediaSeriesApi, 'series' | 'openSeries'> = {
    page: (request) => {
      requests.push(request);
      const start = request.after === undefined ? 0 : Number(request.after);
      const end = start + pageSize;
      const view: MediaLibraryPageView = {
        items: fonds.slice(start, end),
        total: fonds.length,
        next: end < fonds.length ? String(end) : null,
      };
      return Promise.resolve(view);
    },
    one: (url) => {
      reads.push(url);
      const found = fonds.find((item) => item.url === url);
      return found === undefined
        ? Promise.reject(new HttpErrorResponse({ status: 404, error: { message: 'absente' } }))
        : Promise.resolve(found);
    },
    describe: (details) => {
      if (options.describeFails === true) {
        return Promise.reject(
          new HttpErrorResponse({
            status: 400,
            error: { code: 'too_many_tags', message: 'Une image porte au plus 30 mots-clés.' },
          }),
        );
      }
      written.push(details);
      return Promise.resolve();
    },
    upload: (file, seriesId = null) => {
      if (file.name === 'refusee.png') {
        return Promise.reject(
          new HttpErrorResponse({ status: 400, error: { message: 'Image trop petite.' } }),
        );
      }
      uploads.push({ name: file.name, seriesId });
      return Promise.resolve({
        id: 'm1',
        url: `https://media.test/${file.name}`,
        seriesId,
        alreadyInLibrary: file.name === 'connue.png',
        width: 1200,
        height: 800,
        bytes: file.size,
        contentType: file.type,
      });
    },
    carriersOf: () => Promise.resolve([{ kind: 'product', id: 'p1', label: 'Brioche' }]),
    tags: () => Promise.resolve([{ tag: 'brioche', count: 3 }]),
    renameTag: () => Promise.resolve(),
    series: () => Promise.resolve([]),
    openSeries: () => Promise.resolve('s1'),
  };
  const strip: Pick<MediaPaletteApi, 'strip'> = {
    strip: () => {
      const view: MediaPaletteStripView = { columns: [], total: 0, unpainted: 0 };
      return Promise.resolve(view);
    },
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: MediaImagesApi, useValue: media },
      { provide: MediaCarriersApi, useValue: media },
      { provide: MediaTagsApi, useValue: media },
      { provide: MediaSeriesApi, useValue: media },
      { provide: MediaPaletteApi, useValue: strip },
    ],
  });
  const names = runInInjectionContext(TestBed.inject(Injector), () => declareMediaAgentTools());

  function tool(name: string): RegisteredTool {
    const found = registered.get(name);
    if (found === undefined) {
      throw new Error(`L'outil ${name} n'a pas été enregistré.`);
    }
    return found;
  }
  return { names, tool, written, requests, reads, uploads };
}

beforeEach(() => Reflect.deleteProperty(document, 'modelContext'));
afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext');
  vi.unstubAllGlobals();
});

/** Un hôte d'images doublé : le chemin choisit la réponse. */
function stubImageHost(): string[] {
  const fetched: string[] = [];
  vi.stubGlobal('fetch', (url: string): Promise<Response> => {
    fetched.push(url);
    if (url.includes('sans-cors')) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    const type = url.endsWith('.gif') ? 'image/gif' : 'image/png';
    const size = url.includes('enorme') ? 11 * 1024 * 1024 : 2048;
    return Promise.resolve(
      new Response(new Uint8Array(size), { headers: { 'content-type': type } }),
    );
  });
  return fetched;
}

describe('declareMediaAgentTools', () => {
  it("rend les noms qu'il enregistre, et aucun geste destructif", () => {
    const { names, tool } = armTools([]);
    for (const name of names) {
      expect(tool(name).name).toBe(name);
    }
    // Déposer est offert depuis le 2026-10-13 (Hugo) : il n'efface ni ne remplace rien.
    for (const forbidden of ['discard', 'delete', 'replace']) {
      expect(names.some((name) => name.includes(forbidden))).toBe(false);
    }
  });

  it('media_search rend le curseur `next` et la ligne de chaque image', async () => {
    const { tool, requests } = armTools([image('u1'), image('u2'), image('u3')]);

    const said = await tool('media_search').execute({ tags: ['brioche'], untagged: false });

    expect(said).toContain('3 image(s) pour ce filtre');
    expect(said).toContain('u1 — « Brioche dorée » — tags: brioche, four');
    expect(said).toContain('next: 2');
    expect(requests[0]?.tags).toEqual(['brioche']);
  });

  it('media_tag_add relit l’image par `one`, sans parcourir le fil, et RENVOIE ce qu’elle portait', async () => {
    // `PUT /media` remplace étiquette, texte alternatif, tags et point focal
    // ensemble : un outil qui n'enverrait que les tags effacerait le reste.
    const { tool, written, requests, reads } = armTools([image('u1'), image('u2'), image('u3')]);

    const said = await tool('media_tag_add').execute({ urls: ['u3'], tags: ['viennoiserie'] });

    expect(said).toContain('u3 — écrit');
    expect(reads).toEqual(['u3']);
    expect(requests).toEqual([]);
    expect(written).toEqual([
      {
        url: 'u3',
        name: 'Brioche dorée',
        alt: { fr: 'Une brioche', en: 'A brioche' },
        tags: ['brioche', 'four', 'viennoiserie'],
        focal: { x: 0.3, y: 0.6 },
      },
    ]);
    // La série n'est PAS envoyée : son absence ne change rien, `null` la détacherait.
    expect(written[0]).not.toHaveProperty('seriesId');
  });

  it("media_tag_remove n'écrit pas une image qui ne portait pas le mot, et nomme l'introuvable", async () => {
    const { tool, written } = armTools([image('u1'), image('u2', { tags: ['pain'] })]);

    const said = await tool('media_tag_remove').execute({
      urls: ['u1', 'u2', 'absente'],
      tags: [' Four '],
    });

    expect(written.map((details) => [details.url, details.tags])).toEqual([['u1', ['brioche']]]);
    expect(said).toContain('u2 — ne portait aucun de ces mots');
    expect(said).toContain('absente — introuvable au fonds');
  });

  it('media_describe REFUSE un point focal à moitié donné, sans rien écrire', async () => {
    const { tool, written } = armTools([image('u1')]);

    const said = await tool('media_describe').execute({ url: 'u1', focalX: 0.5 });

    expect(said).toContain('focalX ET focalY');
    expect(written).toEqual([]);
  });

  it('media_describe garde ce qu’on ne lui donne pas, et fusionne le texte alternatif', async () => {
    const { tool, written } = armTools([image('u1')]);

    await tool('media_describe').execute({ url: 'u1', altIt: 'Una brioche' });

    expect(written[0]).toEqual({
      url: 'u1',
      name: 'Brioche dorée',
      alt: { fr: 'Une brioche', en: 'A brioche', it: 'Una brioche' },
      tags: ['brioche', 'four'],
      focal: { x: 0.3, y: 0.6 },
    });
  });

  it('rend le message du serveur, pas « Http failure response »', async () => {
    const { tool } = armTools([image('u1')], { describeFails: true });

    const said = await tool('media_series_assign').execute({ urls: ['u1'], seriesId: 's1' });

    expect(said).toContain('REFUSÉ : 400 — Une image porte au plus 30 mots-clés.');
  });

  it('media_read nomme les porteurs', async () => {
    const { tool } = armTools([image('u1')]);

    const said = await tool('media_read').execute({ url: 'u1' });

    expect(said).toContain('product p1 — Brioche');
    expect(said).toContain('focal      : x=0.3 y=0.6');
  });

  it('media_deposit_from_url dépose chaque adresse dans la série, et isole chaque refus', async () => {
    const fetched = stubImageHost();
    const { tool, uploads } = armTools([]);

    const said = await tool('media_deposit_from_url').execute({
      urls: [
        'https://img.test/a.png',
        'http://img.test/b.png',
        'https://img.test/c.gif',
        'https://img.test/enorme.png',
        'https://sans-cors.test/d.png',
        'https://img.test/refusee.png',
        'https://img.test/connue.png',
      ],
      seriesId: 's1',
    });

    expect(said).toContain('https://img.test/a.png — déposée → https://media.test/a.png');
    expect(said).toContain('http://img.test/b.png — REFUSÉ : seules les adresses https');
    expect(said).toContain('c.gif — REFUSÉ : format non accepté');
    expect(said).toContain('enorme.png — REFUSÉ : 11.0 Mo dépassent la limite de 10 Mo.');
    expect(said).toContain('d.png — REFUSÉ : téléchargement impossible');
    expect(said).toContain('refusee.png — dépôt — REFUSÉ : 400 — Image trop petite.');
    expect(said).toContain('connue.png — déjà au fonds');
    // http n'est jamais téléchargé ; les autres le sont, un échec n'arrête pas la suite.
    expect(fetched).not.toContain('http://img.test/b.png');
    expect(uploads).toEqual([
      { name: 'a.png', seriesId: 's1' },
      { name: 'connue.png', seriesId: 's1' },
    ]);
  });

  it('media_describe_many AJOUTE les tags, garde le reste, et isole l’introuvable', async () => {
    const { tool, written } = armTools([image('u1'), image('u2', { tags: [] })]);

    const said = await tool('media_describe_many').execute({
      items: [
        { url: 'u1', tags: ['viennoiserie'], alt: { it: 'Una brioche' } },
        { url: 'absente', name: 'X' },
        { url: 'u2', name: 'Pain', tags: ['pain'] },
      ],
    });

    expect(said).toContain('u1 — écrit');
    expect(said).toContain('absente — introuvable au fonds');
    expect(said).toContain('u2 — écrit');
    expect(written).toEqual([
      {
        url: 'u1',
        name: 'Brioche dorée',
        alt: { fr: 'Une brioche', en: 'A brioche', it: 'Una brioche' },
        tags: ['brioche', 'four', 'viennoiserie'],
        focal: { x: 0.3, y: 0.6 },
      },
      {
        url: 'u2',
        name: 'Pain',
        alt: { fr: 'Une brioche', en: 'A brioche' },
        tags: ['pain'],
        focal: { x: 0.3, y: 0.6 },
      },
    ]);
  });
});
