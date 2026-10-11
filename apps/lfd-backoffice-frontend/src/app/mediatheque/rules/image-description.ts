import {
  LOCALES,
  type FocalPoint,
  type LibraryMediaView,
  type LocalizedText,
  type MediaFactsView,
  type MediaSeriesRefView,
  type MediaSeriesView,
} from '@lfd/pim-contracts';

import { fileNameOf, formatBytes, formatContentType, formatDimensions } from './image-facts';
import { usesWording } from './media-wording';
import { parisMomentLabel } from './paris-calendar';

/** Ce qu'on sait d'une image sans l'avoir décrite — lu, jamais écrit ici. */
export interface ImageFacts extends MediaFactsView {
  readonly depositedAt: string;
  readonly uses: number;
}

/** Une image telle que le panneau la décrit. */
export interface ImageDescription {
  readonly url: string;
  readonly name: string;
  readonly alt: LocalizedText;
  readonly focal: FocalPoint | null;
  readonly tags: readonly string[];
  /** Sa série ; `null` = aucune. */
  readonly series: MediaSeriesRefView | null;
  /** Absent : la section « Informations » ne s'affiche pas. */
  readonly facts?: ImageFacts;
}

/** Ce qu'une description écrit — de quoi dire si elle a changé. */
export interface DescriptionFields {
  readonly name: string;
  readonly alt: LocalizedText;
  readonly focal: FocalPoint | null;
  readonly tags: readonly string[];
  readonly seriesId: string | null;
}

/**
 * Décrire une série d'images à la suite, sans refermer le panneau.
 *
 * `images` est relu à chaque pas : le fil peut s'allonger ou être réécrit
 * pendant qu'on décrit. `save` rend `false` quand l'écriture a été refusée —
 * le panneau reste alors sur l'image, avec ce qui était saisi.
 */
export interface ImagePanelSequence {
  readonly images: () => readonly ImageDescription[];
  readonly save: (result: ImagePanelResult) => Promise<boolean>;
}

/** Ce qu'on décrit, et ce qui en est déjà écrit. */
export interface ImagePanelData extends ImageDescription {
  /** Le vocabulaire du fonds, d'où viennent les suggestions. */
  readonly vocabulary: readonly string[];
  /**
   * Les séries où la rattacher — relues à chaque ouverture de la liste.
   * Absent : la série se lit, elle ne se change pas.
   */
  readonly seriesChoices?: () => readonly MediaSeriesView[];
  readonly sequence?: ImagePanelSequence;
  /** Ouvre la liste des porteurs — « voir où » des informations. */
  readonly showCarriers?: (url: string) => void;
  /**
   * Ouvre le remplacement de l'image — ce panneau se ferme alors, un panneau
   * à la fois. Absent : le geste n'est pas offert.
   */
  readonly replace?: (url: string) => void;
}

/**
 * Ce que le panneau rend. `undefined` au `closed` = annulé, et rien n'est écrit.
 *
 * `url` dit QUELLE image : après une navigation, ce n'est plus celle de
 * l'ouverture.
 */
export interface ImagePanelResult extends DescriptionFields {
  readonly url: string;
}

/** Une image du fil, telle que le panneau la lit — ses informations comprises. */
export function describedImage(item: LibraryMediaView): ImageDescription {
  return {
    url: item.url,
    name: item.name,
    alt: item.alt,
    focal: item.focal,
    tags: item.tags,
    series: item.series,
    facts: {
      width: item.width,
      height: item.height,
      bytes: item.bytes,
      contentType: item.contentType,
      depositedAt: item.depositedAt,
      uses: item.uses,
    },
  };
}

/**
 * Deux descriptions disent-elles la même chose ? Les alternatives se
 * comparent sans leurs blancs de bord, langue par langue ; l'ordre des
 * mots-clés compte.
 */
export function sameDescription(a: DescriptionFields, b: DescriptionFields): boolean {
  return (
    a.name === b.name &&
    a.seriesId === b.seriesId &&
    a.focal?.x === b.focal?.x &&
    a.focal?.y === b.focal?.y &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, at) => b.tags[at] === tag) &&
    LOCALES.every((locale) => (a.alt[locale] ?? '').trim() === (b.alt[locale] ?? '').trim())
  );
}

/** Les informations d'une image, telles que la section « Informations » les dit. */
export interface ImageFactsLabels {
  readonly format: string | null;
  readonly dimensions: string | null;
  readonly weight: string | null;
  readonly depositedAt: string;
  readonly fileName: string;
  readonly uses: number;
  readonly usesWording: string;
}

/** Les informations d'une image, mises en forme ; `null` quand le dépôt ne les a pas mesurées. */
export function factsOf(image: ImageDescription | null): ImageFactsLabels | null {
  const facts = image?.facts;
  if (image === null || facts === undefined) {
    return null;
  }
  return {
    format: formatContentType(facts.contentType),
    dimensions: formatDimensions(facts.width, facts.height),
    weight: formatBytes(facts.bytes),
    depositedAt: parisMomentLabel(facts.depositedAt),
    fileName: fileNameOf(image.url),
    uses: facts.uses,
    usesWording: usesWording(facts.uses),
  };
}
