import { declareExperimentalWebMcpTool } from '@angular/core';
import type { LocalizedText } from '@lfd/pim-contracts';

import type { MediaImagesApi } from '../mediatheque/data/media-images-api';

import { said } from './agent-tool-text';
import { fetchImageFile, type ImageFetcher } from './media-agent-deposit';
import { detailsOf } from './media-agent-text';
import { eachImage } from './media-agent-vocabulary-tools';

/** Les noms de cette part de la trousse — rendus, jamais recopiés par l'écran. */
export const MEDIA_BATCH_TOOLS = ['media_deposit_from_url', 'media_describe_many'] as const;

/** Ce que `media_describe_many` reçoit pour une image. */
interface DescribeItem {
  readonly url: string;
  readonly name?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly alt?:
    | {
        readonly fr?: string | undefined;
        readonly en?: string | undefined;
        readonly it?: string | undefined;
      }
    | undefined;
}

/**
 * **Garnir le fonds en quelques appels** (Hugo, 2026-10-13) : déposer des
 * images par leur adresse, puis en décrire plusieurs d'un coup. À l'écran,
 * quarante-cinq photos d'une banque d'images coûtaient des centaines de gestes.
 *
 * Une ligne par image, et un échec n'arrête jamais les autres : l'agent sait
 * lesquelles reprendre. Le dépôt passe par `MediaImagesApi.upload` — la même
 * route que l'écran, mêmes refus serveur ; redéposer les mêmes octets ne
 * duplique rien (clé = contenu).
 *
 * ⚠️ La palette n'est pas calculée ici (l'écran la calcule au dépôt) : le
 * serveur range `NULL`, et le rattrapage de la médiathèque la posera.
 */
export function declareMediaBatchTools(media: MediaImagesApi, fetcher: ImageFetcher): void {
  void declareExperimentalWebMcpTool({
    name: 'media_deposit_from_url',
    description:
      "Dépose au fonds des images publiques par leur adresse (https seulement) : la page les télécharge (PNG, JPEG ou WebP, 10 Mo au plus) puis les dépose comme l'écran, dans la série `seriesId` si elle est donnée (media_series_list). Une ligne par adresse : l'URL au fonds (ou « déjà au fonds », retrouvée par son contenu, série d'origine gardée), ou le refus nommé. Un hôte sans CORS est refusé.",
    inputSchema: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' } },
        seriesId: { type: 'string' },
      },
      required: ['urls'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Dépôt par adresse', async () => {
        const lines: string[] = [];
        for (const address of new Set(args.urls)) {
          lines.push(await depositOne(media, fetcher, address, args.seriesId ?? null));
        }
        return lines.length === 0 ? 'Aucune adresse donnée.' : lines.join('\n');
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'media_describe_many',
    description:
      "Décrit plusieurs images en un appel (`url` vient de media_search ou de media_deposit_from_url). Par image : `name` (étiquette), `tags` AJOUTÉS à ceux qu'elle porte (jamais remplacés), `alt` par langue (fr, en, it). Un champ omis GARDE sa valeur ; point focal et série inchangés. Une ligne par image.",
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              name: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              alt: {
                type: 'object',
                properties: {
                  fr: { type: 'string' },
                  en: { type: 'string' },
                  it: { type: 'string' },
                },
                additionalProperties: false,
              },
            },
            required: ['url'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Description en lot', async () => {
        const items: readonly DescribeItem[] = args.items;
        const lines: string[] = [];
        // Une écriture par image : `eachImage` relit, fusionne, écrit, et isole le refus.
        for (const item of items) {
          lines.push(
            await eachImage(media, [item.url], (image) => {
              return {
                ...detailsOf(image),
                name: item.name ?? image.name,
                alt: mergedAlt(image.alt, item.alt),
                tags: [...image.tags, ...(item.tags ?? [])],
              };
            }),
          );
        }
        return lines.length === 0 ? 'Aucune image donnée.' : lines.join('\n');
      }),
  });
}

/** Les langues effectivement données — une clé `undefined` effacerait la valeur lue. */
function mergedAlt(kept: LocalizedText, given: DescribeItem['alt']): LocalizedText {
  return {
    ...kept,
    ...(given?.fr === undefined ? {} : { fr: given.fr }),
    ...(given?.en === undefined ? {} : { en: given.en }),
    ...(given?.it === undefined ? {} : { it: given.it }),
  };
}

async function depositOne(
  media: Pick<MediaImagesApi, 'upload'>,
  fetcher: ImageFetcher,
  address: string,
  seriesId: string | null,
): Promise<string> {
  const outcome = await said('dépôt', async () => {
    const fetched = await fetchImageFile(address, fetcher);
    if ('refusal' in fetched) {
      return `REFUSÉ : ${fetched.refusal}`;
    }
    const uploaded = await media.upload(fetched.file, seriesId);
    return uploaded.alreadyInLibrary
      ? `déjà au fonds → ${uploaded.url} (rien changé, série d'origine gardée)`
      : `déposée → ${uploaded.url}`;
  });
  return `${address} — ${outcome}`;
}
