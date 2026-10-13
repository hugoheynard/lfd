import { declareExperimentalWebMcpTool, inject } from '@angular/core';
import type { LibraryMediaView, MediaDetailsPayload } from '@lfd/pim-contracts';

import type { MediaImagesApi } from '../mediatheque/data/media-images-api';
import { MediaSeriesApi } from '../mediatheque/data/media-series-api';
import { MediaTagsApi } from '../mediatheque/data/media-tags-api';

import { said } from './agent-tool-text';
import {
  detailsOf,
  normalTag,
  notFound,
  readImage,
  seriesText,
  tagsText,
} from './media-agent-text';

/** Les noms de cette moitié de la trousse — rendus, jamais recopiés par l'écran. */
export const MEDIA_VOCABULARY_TOOLS = [
  'media_tags_list',
  'media_tag_add',
  'media_tag_remove',
  'media_tag_rename',
  'media_series_list',
  'media_series_create',
  'media_series_assign',
] as const;

/**
 * Applique un même geste à plusieurs images, **une écriture par image**, et
 * rend une ligne par image : un refus n'arrête pas les autres, et l'agent sait
 * lesquelles reprendre. `PUT /media` n'a pas de forme en lot.
 */
export async function eachImage(
  media: Pick<MediaImagesApi, 'one' | 'describe'>,
  urls: readonly string[],
  change: (image: LibraryMediaView) => MediaDetailsPayload | string,
): Promise<string> {
  const lines: string[] = [];
  for (const url of new Set(urls)) {
    // Un refus par image, pas pour le lot : la lecture comme l'écriture.
    const outcome = await said('image', async () => {
      const image = await readImage(media, url);
      if (image === null) {
        return notFound(url);
      }
      const next = change(image);
      if (typeof next === 'string') {
        return `${url} — ${next}`;
      }
      await media.describe(next);
      return `${url} — écrit`;
    });
    lines.push(outcome.startsWith(url) ? outcome : `${url} — ${outcome}`);
  }
  return lines.join('\n');
}

/**
 * Les mots-clés et les séries — le rangement du fonds. Déclarés par
 * `declareMediaAgentTools`, dans son contexte d'injection.
 *
 * Absent délibérément : `DELETE /media/tags` (retirer un mot de TOUTES les
 * images) — cf. la JSDoc de `declareMediaAgentTools`.
 */
export function declareMediaVocabularyTools(media: MediaImagesApi): void {
  const tags = inject(MediaTagsApi);
  const series = inject(MediaSeriesApi);
  const urls = { type: 'array', items: { type: 'string' } } as const;

  void declareExperimentalWebMcpTool({
    name: 'media_tags_list',
    description:
      'Le vocabulaire du fonds : chaque mot-clé et combien d’images le portent, sur tout le fonds.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: () => said('Lecture des mots-clés', async () => tagsText(await tags.tags())),
  });

  void declareExperimentalWebMcpTool({
    name: 'media_tag_add',
    description:
      'Ajoute un ou plusieurs mots-clés à une ou plusieurs images (`urls` viennent de media_search). Le serveur normalise (minuscules, dédoublonnés) et borne à 30 mots par image. Une ligne de résultat par image.',
    inputSchema: {
      type: 'object',
      properties: { urls, tags: { type: 'array', items: { type: 'string' } } },
      required: ['urls', 'tags'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Ajout de mots-clés', () =>
        eachImage(media, args.urls, (image) => ({
          ...detailsOf(image),
          tags: [...image.tags, ...args.tags],
        })),
      ),
  });

  void declareExperimentalWebMcpTool({
    name: 'media_tag_remove',
    description:
      'Retire un ou plusieurs mots-clés d’une ou plusieurs images désignées. Ne retire JAMAIS un mot de tout le fonds : seulement des images listées.',
    inputSchema: {
      type: 'object',
      properties: { urls, tags: { type: 'array', items: { type: 'string' } } },
      required: ['urls', 'tags'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Retrait de mots-clés', () => {
        const removed = new Set(args.tags.map(normalTag));
        return eachImage(media, args.urls, (image) => {
          const kept = image.tags.filter((tag) => !removed.has(normalTag(tag)));
          return kept.length === image.tags.length
            ? 'ne portait aucun de ces mots, rien écrit'
            : { ...detailsOf(image), tags: kept };
        });
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'media_tag_rename',
    description:
      'Renomme un mot-clé sur TOUTES les images qui le portent. Si `to` existe déjà, les deux mots FUSIONNENT (le serveur ne les distingue pas) : lire media_tags_list avant.',
    inputSchema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Renommage du mot-clé', async () => {
        await tags.renameTag({ from: args.from, to: args.to });
        return `« ${args.from} » renommé en « ${args.to} ».`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'media_series_list',
    description:
      'Les séries (images prises ensemble), la plus récente prise de vue en tête : identifiant, titre, jour, nombre d’images, note.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: () => said('Lecture des séries', async () => seriesText(await series.series())),
  });

  void declareExperimentalWebMcpTool({
    name: 'media_series_create',
    description:
      'Ouvre une série. `shotOn` = jour de prise de vue AAAA-MM-JJ (ni à venir, ni inventé : omis s’il est inconnu). Rend son identifiant, à passer à media_series_assign.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        shotOn: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Ouverture de la série', async () => {
        const id = await series.openSeries({
          title: args.title,
          shotOn: args.shotOn ?? null,
          note: args.note ?? null,
        });
        return `Série ouverte : ${id}`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'media_series_assign',
    description:
      'Range une ou plusieurs images dans une série (`seriesId` de media_series_list), ou les en détache avec seriesId="". Une image n’a qu’une série : l’assigner la retire de la précédente.',
    inputSchema: {
      type: 'object',
      properties: { urls, seriesId: { type: 'string' } },
      required: ['urls', 'seriesId'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Rangement en série', () =>
        eachImage(media, args.urls, (image) => ({
          ...detailsOf(image),
          seriesId: args.seriesId === '' ? null : args.seriesId,
        })),
      ),
  });
}
