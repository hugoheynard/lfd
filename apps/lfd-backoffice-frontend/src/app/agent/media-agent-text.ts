import { HttpErrorResponse } from '@angular/common/http';
import type {
  LibraryMediaView,
  MediaCarrierView,
  MediaDetailsPayload,
  MediaLibrarySort,
  MediaPaletteStripView,
  MediaSeriesView,
  MediaTagView,
} from '@lfd/pim-contracts';

import type { MediaLibraryHttpApi } from '../mediatheque/media-library-http-api';
import { ALL_MEDIA, type MediaFeedCriteria } from '../mediatheque/media-feed-url';

/**
 * **Ce que les outils de la médiathèque disent à un agent**, et comment ils
 * retrouvent une image — fonctions pures ou presque, testées sans Angular.
 *
 * Le texte est compact et toujours dans le même ordre : un agent compare des
 * lignes, il ne lit pas une mise en page.
 */

/** Les filtres du fonds tels qu'un outil les reçoit — tous facultatifs. */
export interface MediaFilterArgs {
  readonly q?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly series?: string | undefined;
  readonly untagged?: boolean | undefined;
  readonly unused?: boolean | undefined;
  readonly depositedFrom?: string | undefined;
  readonly depositedTo?: string | undefined;
  readonly shotFrom?: string | undefined;
  readonly shotTo?: string | undefined;
  readonly sort?: MediaLibrarySort | undefined;
}

/** Les critères de l'écran, à partir des arguments d'un outil : un argument absent n'est pas un filtre. */
export function criteriaOf(args: MediaFilterArgs): MediaFeedCriteria {
  return {
    sort: args.sort ?? ALL_MEDIA.sort,
    q: args.q ?? '',
    tags: args.tags ?? [],
    from: args.depositedFrom ?? '',
    to: args.depositedTo ?? '',
    shotFrom: args.shotFrom ?? '',
    shotTo: args.shotTo ?? '',
    untagged: args.untagged ?? false,
    unused: args.unused ?? false,
    series: args.series ?? '',
  };
}

/** `2026-10-11T08:12:00Z` → `2026-10-11` : le jour suffit à un agent. */
function day(iso: string): string {
  return iso.slice(0, 10);
}

/** Une image en une ligne : l'URL d'abord, c'est son identifiant. */
export function imageLine(image: LibraryMediaView): string {
  const name = image.name === '' ? '(sans étiquette)' : `« ${image.name} »`;
  const tags = image.tags.length === 0 ? 'aucun tag' : `tags: ${image.tags.join(', ')}`;
  const series =
    image.series === null
      ? ''
      : ` — série: ${image.series.title} [${image.series.id}]${image.series.shotOn === null ? '' : ` ${image.series.shotOn}`}`;
  return `${image.url} — ${name} — ${tags}${series} — déposée ${day(image.depositedAt)} — ${image.uses} emploi(s)`;
}

/** Les dominantes d'une palette, la plus large d'abord, sans les écarts. */
export function dominants(palette: LibraryMediaView['palette']): string {
  if (palette === null) {
    return 'pas encore calculée';
  }
  const kept = palette.filter((swatch) => !swatch.outlier);
  return kept.length === 0
    ? 'aucune dominante'
    : kept.map((swatch) => `${swatch.hex} ${Math.round(swatch.share * 100)} %`).join(', ');
}

/**
 * Le détail d'une image et ses porteurs. `null` dans un texte localisé ou un
 * point focal se DIT — « personne ne s'est prononcé » n'est pas « au centre ».
 */
export function imageDetail(
  image: LibraryMediaView,
  carriers: readonly MediaCarrierView[],
): string {
  const alt = Object.entries(image.alt)
    .filter(([, text]) => text !== undefined && text !== '')
    .map(([locale, text]) => `  ${locale}: ${text}`);
  const size =
    image.width === null || image.height === null
      ? 'non mesurées'
      : `${image.width}×${image.height}`;
  const used =
    carriers.length === 0
      ? ['  aucun — elle n’est affichée nulle part']
      : carriers.map((carrier) => `  ${carrier.kind} ${carrier.id} — ${carrier.label}`);
  return [
    `url        : ${image.url}`,
    `étiquette  : ${image.name === '' ? '(aucune)' : image.name}`,
    `tags       : ${image.tags.length === 0 ? '(aucun)' : image.tags.join(', ')}`,
    `série      : ${image.series === null ? '(aucune)' : `${image.series.title} [${image.series.id}]`}`,
    `déposée    : ${day(image.depositedAt)}`,
    `dimensions : ${size}`,
    `focal      : ${image.focal === null ? 'non décidé (cadrage au centre)' : `x=${image.focal.x} y=${image.focal.y}`}`,
    `palette    : ${dominants(image.palette)}`,
    'texte alternatif :',
    ...(alt.length === 0 ? ['  (aucun)'] : alt),
    `porteurs (${carriers.length}) :`,
    ...used,
  ].join('\n');
}

export function tagsText(tags: readonly MediaTagView[]): string {
  return tags.length === 0
    ? 'Aucun mot-clé au fonds.'
    : tags.map((tag) => `${tag.tag} (${tag.count})`).join('\n');
}

export function seriesText(series: readonly MediaSeriesView[]): string {
  return series.length === 0
    ? 'Aucune série.'
    : series
        .map(
          (one) =>
            `${one.id} — ${one.title} — ${one.shotOn ?? 'jour inconnu'} — ${one.images} image(s)${one.note === null ? '' : ` — ${one.note}`}`,
        )
        .join('\n');
}

/** La frise, colonne par colonne : période, nombre de photos, dominantes. */
export function stripText(strip: MediaPaletteStripView): string {
  const head = `${strip.total} image(s) retenue(s), ${strip.unpainted} sans palette, ${strip.columns.length} colonne(s).`;
  const rows = strip.columns.map((column) => {
    const colors = column.palette
      .filter((swatch) => !swatch.outlier)
      .map((swatch) => swatch.hex)
      .join(' ');
    return `${day(column.from)} → ${day(column.to)} — ${column.count} photo(s) — ${colors === '' ? 'sans couleur' : colors}`;
  });
  return [head, ...rows].join('\n');
}

/**
 * Relit UNE image par `GET /media/one`, ou `null` si elle n'est pas au fonds
 * (404). Tout autre refus remonte : `said` le rendra lisible.
 */
export async function readImage(
  api: Pick<MediaLibraryHttpApi, 'one'>,
  url: string,
): Promise<LibraryMediaView | null> {
  try {
    return await api.one(url);
  } catch (caught) {
    if (caught instanceof HttpErrorResponse && caught.status === HTTP_NOT_FOUND) {
      return null;
    }
    throw caught;
  }
}

const HTTP_NOT_FOUND = 404;

/**
 * Ce que l'image porte déjà, prêt à repartir — `PUT /media` REMPLACE
 * étiquette, texte alternatif, tags et point focal ensemble : omettre l'un
 * l'effacerait. La série n'y est pas : son absence ne change rien.
 */
export function detailsOf(image: LibraryMediaView): MediaDetailsPayload {
  return {
    url: image.url,
    name: image.name,
    alt: image.alt,
    tags: [...image.tags],
    focal: image.focal,
  };
}

/** Un mot comparé comme le serveur le range : rogné, en minuscules. */
export function normalTag(tag: string): string {
  return tag.trim().toLowerCase();
}

export function notFound(url: string): string {
  return `${url} — introuvable au fonds.`;
}
