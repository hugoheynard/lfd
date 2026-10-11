import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  LibraryMediaView,
  MediaDetailsPayload,
  MediaLibraryPageView,
  MediaPaletteStripView,
} from '@lfd/pim-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MediaLibraryHttpApi, type MediaPageRequest } from '../mediatheque/media-library-http-api';
import { PaletteStripApi } from '../mediatheque/palette-strip-api';

import { declareMediaAgentTools } from './media-agent-tools';

type ToolArgs = Record<string, string | number | boolean | readonly string[]>;

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
  const media: Pick<
    MediaLibraryHttpApi,
    'page' | 'one' | 'describe' | 'carriersOf' | 'tags' | 'renameTag' | 'series' | 'openSeries'
  > = {
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
    carriersOf: () => Promise.resolve([{ kind: 'product', id: 'p1', label: 'Brioche' }]),
    tags: () => Promise.resolve([{ tag: 'brioche', count: 3 }]),
    renameTag: () => Promise.resolve(),
    series: () => Promise.resolve([]),
    openSeries: () => Promise.resolve('s1'),
  };
  const strip: Pick<PaletteStripApi, 'strip'> = {
    strip: () => {
      const view: MediaPaletteStripView = { columns: [], total: 0, unpainted: 0 };
      return Promise.resolve(view);
    },
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: MediaLibraryHttpApi, useValue: media },
      { provide: PaletteStripApi, useValue: strip },
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
  return { names, tool, written, requests, reads };
}

beforeEach(() => Reflect.deleteProperty(document, 'modelContext'));
afterEach(() => Reflect.deleteProperty(document, 'modelContext'));

describe('declareMediaAgentTools', () => {
  it("rend les noms qu'il enregistre, et aucun geste destructif", () => {
    const { names, tool } = armTools([]);
    for (const name of names) {
      expect(tool(name).name).toBe(name);
    }
    for (const forbidden of ['discard', 'delete', 'replace', 'upload', 'deposit']) {
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
});
