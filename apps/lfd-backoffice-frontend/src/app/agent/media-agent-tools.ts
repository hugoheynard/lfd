import { declareExperimentalWebMcpTool, inject } from '@angular/core';
import { MEDIA_LIBRARY_SORTS, PALETTE_STRIP_LIMITS, type LocalizedText } from '@lfd/pim-contracts';

import { MediaCarriersApi } from '../mediatheque/data/media-carriers-api';
import { MediaImagesApi } from '../mediatheque/data/media-images-api';
import { toPageRequest } from '../mediatheque/rules/feed-filters';
import { MediaPaletteApi } from '../mediatheque/data/media-palette-api';

import { said } from './agent-tool-text';
import {
  criteriaOf,
  detailsOf,
  imageDetail,
  imageLine,
  notFound,
  readImage,
  stripText,
} from './media-agent-text';
import { declareMediaBatchTools, MEDIA_BATCH_TOOLS } from './media-agent-batch-tools';
import {
  declareMediaVocabularyTools,
  MEDIA_VOCABULARY_TOOLS,
} from './media-agent-vocabulary-tools';

/**
 * Colonnes de frise par défaut pour un agent : bien moins que l'écran
 * (`PALETTE_STRIP_LIMITS.defaultColumns`), parce qu'une colonne est une ligne
 * de texte et qu'un agent n'a pas d'œil pour en balayer cent vingt.
 */
const AGENT_STRIP_COLUMNS = Math.min(24, PALETTE_STRIP_LIMITS.defaultColumns);

/**
 * **Les outils WebMCP de la médiathèque** — ce qu'un agent peut faire sur le
 * fonds d'images sans passer par le clic : chercher, lire, taguer, décrire,
 * ranger en séries, lire les couleurs, déposer par adresse et décrire en lot.
 *
 * Même philosophie que la trousse du référentiel (`pim-agent-tools.ts`) :
 * chaque outil vise une **route HTTP** par les clients de `mediatheque/data/`
 * (images, porteurs, mots-clés, séries, palettes), jamais un store d'écran — donc la même porte que la
 * médiathèque, validations serveur et mur `media_library` compris, et
 * l'authentification de la session par l'intercepteur staff.
 *
 * L'identifiant d'une image est son **URL** : c'est son identité au fonds
 * (le SHA-256 de son contenu), il n'y en a pas d'autre.
 *
 * 🔴 **Aucun geste destructif ni irréversible n'est offert**, et c'est
 * délibéré :
 * - **retirer une image du fonds** (`DELETE /media`) efface des octets — rien
 *   ne les rend ;
 * - **retirer un mot-clé partout** (`DELETE /media/tags`) défait le travail de
 *   rangement de tout le fonds en un appel, sans liste de ce qui le portait ;
 * - **remplacer A par B** (`POST /media/replace`) change ce qu'affichent la
 *   vitrine, les fiches et les familles — une décision de publication, pas de
 *   rangement ;
 *
 * **Déposer** était exclu jusqu'au 2026-10-13 (« un agent n'a pas de
 * fichier ») ; Hugo l'a ouvert ce jour-là : la PAGE télécharge l'adresse et
 * dépose comme l'écran (`media_deposit_from_url`). Un dépôt n'efface ni ne
 * remplace rien — les mêmes octets ne dupliquent rien.
 * Retirer un mot d'UNE image (`media_tag_remove`) reste offert : c'est
 * réversible par `media_tag_add`, image par image.
 *
 * ⚠️ `media_tag_*`, `media_describe` et `media_series_assign` relisent l'image
 * avant d'écrire, parce que `PUT /media` REMPLACE étiquette, texte alternatif,
 * tags et point focal ensemble — par `GET /media/one`, ouverte pour ça le
 * 2026-10-11. Deux écritures concurrentes sur la même
 * image : la dernière gagne, comme à l'écran.
 */
export function declareMediaAgentTools(): readonly string[] {
  const media = inject(MediaImagesApi);
  const carriers = inject(MediaCarriersApi);
  const strip = inject(MediaPaletteApi);

  void declareExperimentalWebMcpTool({
    name: 'media_search',
    description:
      "Cherche dans le fonds d'images, filtré et trié au serveur. Rend une ligne par image (URL = identifiant, étiquette, tags, série, date de dépôt, emplois), le total du filtre, et `next` à renvoyer en `after` pour la page suivante. Dates en AAAA-MM-JJ, incluses. `q` cherche dans l'étiquette. `series` = identifiant de media_series_list.",
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        series: { type: 'string' },
        untagged: { type: 'boolean' },
        unused: { type: 'boolean' },
        depositedFrom: { type: 'string' },
        depositedTo: { type: 'string' },
        shotFrom: { type: 'string' },
        shotTo: { type: 'string' },
        sort: { type: 'string', enum: [...MEDIA_LIBRARY_SORTS] },
        limit: { type: 'number' },
        after: { type: 'string' },
      },
      additionalProperties: false,
    },
    execute: (args) =>
      said('Recherche au fonds', async () => {
        const request = toPageRequest(criteriaOf(args), args.limit ?? 30, args.after ?? null);
        const page = await media.page(request);
        const rows = page.items.map(imageLine);
        return [
          `${page.total} image(s) pour ce filtre — ${rows.length} rendue(s).`,
          ...rows,
          page.next === null ? 'next: (fin)' : `next: ${page.next}`,
        ].join('\n');
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'media_read',
    description:
      'Lit une image en détail : étiquette, texte alternatif par langue, point focal, tags, série, dimensions, palette, et ses porteurs (où elle est affichée : product, category, storefront, operation). `url` vient de media_search.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
      additionalProperties: false,
    },
    execute: (args) =>
      said("Lecture de l'image", async () => {
        const image = await readImage(media, args.url);
        if (image === null) {
          return notFound(args.url);
        }
        return imageDetail(image, await carriers.carriersOf(args.url));
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'media_describe',
    description:
      "Décrit une image : étiquette (`name`, '' l'efface), texte alternatif par langue (altFr, altEn, altIt ; '' efface une langue), point focal (focalX ET focalY, fractions de 0 à 1 depuis le coin haut-gauche ; clearFocal=true revient au centre). Un champ omis GARDE sa valeur. Ne touche ni aux tags ni à la série.",
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        name: { type: 'string' },
        altFr: { type: 'string' },
        altEn: { type: 'string' },
        altIt: { type: 'string' },
        focalX: { type: 'number' },
        focalY: { type: 'number' },
        clearFocal: { type: 'boolean' },
      },
      required: ['url'],
      additionalProperties: false,
    },
    execute: (args) =>
      said("Description de l'image", async () => {
        if ((args.focalX === undefined) !== (args.focalY === undefined)) {
          return 'REFUSÉ : un point focal se donne en entier — focalX ET focalY.';
        }
        const image = await readImage(media, args.url);
        if (image === null) {
          return notFound(args.url);
        }
        const kept = detailsOf(image);
        const alt: LocalizedText = {
          ...image.alt,
          ...(args.altFr === undefined ? {} : { fr: args.altFr }),
          ...(args.altEn === undefined ? {} : { en: args.altEn }),
          ...(args.altIt === undefined ? {} : { it: args.altIt }),
        };
        const focal =
          args.clearFocal === true
            ? null
            : args.focalX !== undefined && args.focalY !== undefined
              ? { x: args.focalX, y: args.focalY }
              : kept.focal;
        await media.describe({ ...kept, name: args.name ?? kept.name, alt, focal });
        return `Image décrite : ${args.url}`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'media_colors',
    description:
      'La frise des couleurs du fonds, agrégée au serveur sur TOUT le filtre (mêmes filtres que media_search, sans tri ni pagination) : une ligne par colonne — période (prise de vue, sinon dépôt), nombre de photos, dominantes en hex. `columns` de 1 à 400, 24 par défaut.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        series: { type: 'string' },
        untagged: { type: 'boolean' },
        unused: { type: 'boolean' },
        depositedFrom: { type: 'string' },
        depositedTo: { type: 'string' },
        shotFrom: { type: 'string' },
        shotTo: { type: 'string' },
        columns: { type: 'number' },
      },
      additionalProperties: false,
    },
    execute: (args) =>
      said('Lecture de la frise', async () =>
        stripText(await strip.strip(criteriaOf(args), args.columns ?? AGENT_STRIP_COLUMNS)),
      ),
  });

  declareMediaVocabularyTools(media);
  declareMediaBatchTools(media);

  return [
    'media_search',
    'media_read',
    'media_describe',
    'media_colors',
    ...MEDIA_VOCABULARY_TOOLS,
    ...MEDIA_BATCH_TOOLS,
  ];
}
