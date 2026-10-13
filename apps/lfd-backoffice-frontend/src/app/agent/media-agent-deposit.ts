import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, InjectionToken } from '@angular/core';
import { MEDIA_LIMITS } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

/**
 * **Aller chercher une image à son adresse** pour la déposer — le seul
 * morceau de `media_deposit_from_url` qui ne parle pas à l'API, testé sans
 * Angular.
 *
 * Les bornes sont celles de l'écran (`MEDIA_LIMITS`) : un fichier refusé ici
 * l'aurait été au dépôt manuel. Le serveur reste l'autorité (il renifle les
 * octets) ; ce contrôle évite seulement d'envoyer ce qu'il refuserait.
 */

/** Le téléchargement d'une image, réduit à ce qu'on en appelle — doublé en test. */
export type ImageFetcher = (url: string) => Promise<Response>;

/**
 * Le téléchargeur par défaut : `HttpClient`, pas le `fetch` global
 * (`lint:api-types`). Le jeton staff ne part pas chez l'hôte d'images :
 * l'intercepteur ne le pose que sur l'URL de l'API (`staff-auth.interceptor.ts`,
 * vérifié le 2026-10-13).
 *
 * Une réponse non 2xx revient en `Response` à son statut, pour que le refus le
 * nomme ; seul l'échec sans statut (CORS, réseau) est relancé.
 */
export const IMAGE_FETCHER = new InjectionToken<ImageFetcher>('IMAGE_FETCHER', {
  providedIn: 'root',
  factory: () => {
    const http = inject(HttpClient);
    return async (url) => {
      try {
        const reply = await firstValueFrom(
          http.get(url, { responseType: 'blob', observe: 'response' }),
        );
        return new Response(reply.body, {
          status: reply.status,
          headers: { 'content-type': reply.headers.get('content-type') ?? '' },
        });
      } catch (error) {
        if (error instanceof HttpErrorResponse && error.status > 0) {
          return new Response(null, { status: error.status });
        }
        throw error;
      }
    };
  },
});

const ACCEPTED: readonly string[] = MEDIA_LIMITS.acceptedTypes;
const MEGABYTE = 1024 * 1024;

/** Un fichier prêt à partir, ou la phrase du refus. */
export type FetchedImage = { readonly file: File } | { readonly refusal: string };

/**
 * Télécharge `address` et en fait un `File`. Rend un refus NOMMÉ plutôt que
 * de jeter : https seulement, réponse 2xx, type PNG/JPEG/WebP, ≤ 10 Mo.
 *
 * ⚠️ Un hôte qui ne pose pas `Access-Control-Allow-Origin` fait échouer
 * `fetch` par un `TypeError` sans détail — le navigateur ne dit pas si c'est
 * CORS ou le réseau, et le refus le dit tel quel.
 */
export async function fetchImageFile(
  address: string,
  fetcher: ImageFetcher,
): Promise<FetchedImage> {
  let parsed: URL;
  try {
    parsed = new URL(address);
  } catch {
    return { refusal: 'adresse illisible.' };
  }
  if (parsed.protocol !== 'https:') {
    return { refusal: 'seules les adresses https sont acceptées.' };
  }
  let response: Response;
  try {
    response = await fetcher(parsed.href);
  } catch {
    return {
      refusal:
        "téléchargement impossible — l'hôte refuse le CORS ou ne répond pas (le navigateur ne distingue pas).",
    };
  }
  if (!response.ok) {
    return { refusal: `l'hôte a répondu ${String(response.status)}.` };
  }
  const blob = await response.blob();
  // L'en-tête d'abord : c'est ce que l'hôte annonce, `blob.type` en dérive.
  const announced = response.headers.get('content-type') ?? blob.type;
  const type = announced.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ACCEPTED.includes(type)) {
    return {
      refusal: `format non accepté — PNG, JPEG ou WebP attendus (reçu : ${type === '' ? 'inconnu' : type}).`,
    };
  }
  if (blob.size === 0) {
    return { refusal: 'le fichier est vide.' };
  }
  if (blob.size > MEDIA_LIMITS.maxBytes) {
    return {
      refusal: `${(blob.size / MEGABYTE).toFixed(1)} Mo dépassent la limite de ${String(MEDIA_LIMITS.maxBytes / MEGABYTE)} Mo.`,
    };
  }
  return { file: new File([blob], fileNameOf(parsed, type), { type }) };
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Le dernier segment du chemin, sinon `image.<ext>` — le serveur identifie par le contenu. */
function fileNameOf(address: URL, type: string): string {
  const last = address.pathname
    .split('/')
    .filter((part) => part !== '')
    .pop();
  return last === undefined ? `image.${EXTENSIONS[type] ?? 'bin'}` : decodeURIComponent(last);
}
