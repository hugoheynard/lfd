import { DomainError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

import { mediaTags } from "./image.js";

/**
 * **Le vocabulaire du fonds** — les mots-clés vus d'en haut, et les deux gestes
 * qui les touchent partout à la fois (L1, 2026-10-10).
 *
 * 🔴 Un mot-clé n'a pas de table : il n'existe que porté par des images. Le
 * renommer, c'est donc réécrire la liste de CHAQUE image qui le porte — et la
 * réécrire avec la même normalisation qu'à l'écriture d'une image
 * ({@link mediaTags}), sans quoi un renommage pourrait poser un mot qu'aucune
 * saisie n'aurait accepté.
 */

/** Une image vue par ses seuls mots-clés. */
export interface TaggedImage {
  /** L'identité de l'image : son URL, adressée par contenu. */
  readonly url: string;
  readonly tags: readonly string[];
}

/** Un mot du vocabulaire, et combien d'images le portent. */
export interface TagCount {
  readonly tag: string;
  readonly count: number;
}

/** Un geste sur le vocabulaire : les images réécrites, rien d'autre. */
export interface TagRename {
  readonly from: string;
  readonly to: string;
  /** Les images qui portaient `from`, avec leur nouvelle liste. */
  readonly images: readonly TaggedImage[];
  /** Au moins une image portait déjà `to` : deux mots n'en font plus qu'un. */
  readonly merged: boolean;
}

export interface TagRemoval {
  readonly tag: string;
  readonly images: readonly TaggedImage[];
}

export class MediaTagRequiredError extends DomainError {
  constructor(role: "visé" | "nouveau") {
    super(
      "media.tag.required",
      role === "visé"
        ? "Aucun mot-clé n'est désigné : choisissez celui à modifier dans la liste."
        : "Le nouveau mot-clé est vide : saisissez au moins une lettre.",
    );
  }
}

export class MediaTagUnchangedError extends DomainError {
  constructor(tag: string) {
    super(
      "media.tag.unchanged",
      `Le nouveau mot-clé est identique à « ${tag} » une fois mis en minuscules : rien à renommer.`,
    );
  }
}

/** Aucune image ne porte ce mot (→ 404) — typiquement retiré entre-temps. */
export class MediaTagNotFoundError extends ResourceNotFoundError {
  constructor(tag: string) {
    super(
      "media.tag.not_found",
      `Aucune image ne porte le mot-clé « ${tag} » : rechargez la liste des mots-clés.`,
    );
  }
}

/**
 * Compte les mots de tout le fonds, du plus porté au moins porté, puis par
 * ordre alphabétique — un ordre stable, pour que la bande ne saute pas d'un
 * chargement à l'autre.
 */
export function tagVocabulary(lists: readonly (readonly string[])[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const tags of lists) {
    // Une image compte une fois par mot, même si une ligne d'avant la
    // normalisation le portait deux fois.
    for (const tag of new Set(tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "fr"));
}

/**
 * Renomme `from` en `to` sur les images qui le portent.
 *
 * `to` est normalisé comme à l'écriture ; s'il est déjà sur une image, la
 * liste est dédoublonnée en gardant la PREMIÈRE place — celle que quelqu'un a
 * choisie en premier.
 *
 * @throws {MediaTagRequiredError} un des deux mots est vide une fois normalisé.
 * @throws {MediaTagUnchangedError} `to` normalisé est `from`.
 * @throws {MediaTagNotFoundError} aucune image ne porte `from`.
 */
export function renameTag(
  images: readonly TaggedImage[],
  fromInput: string,
  toInput: string,
): TagRename {
  const from = oneTag(fromInput, "visé");
  const to = oneTag(toInput, "nouveau");
  if (to === from) {
    throw new MediaTagUnchangedError(from);
  }
  const carriers = carriersOf(images, from);
  return {
    from,
    to,
    images: carriers.map((image) => ({
      url: image.url,
      tags: mediaTags(image.tags.map((tag) => (tag === from ? to : tag))),
    })),
    merged: carriers.some((image) => image.tags.includes(to)),
  };
}

/**
 * Retire `tagInput` des images qui le portent.
 *
 * @throws {MediaTagRequiredError} le mot est vide une fois normalisé.
 * @throws {MediaTagNotFoundError} aucune image ne le porte.
 */
export function removeTag(images: readonly TaggedImage[], tagInput: string): TagRemoval {
  const tag = oneTag(tagInput, "visé");
  return {
    tag,
    images: carriersOf(images, tag).map((image) => ({
      url: image.url,
      tags: image.tags.filter((kept) => kept !== tag),
    })),
  };
}

/**
 * Le mot VISÉ par un geste, normalisé comme à l'écriture d'une image — c'est
 * sous cette forme que la base le porte, et sous elle qu'on le cherche.
 *
 * @throws {MediaTagRequiredError} vide une fois normalisé.
 */
export function targetTag(input: string): string {
  return oneTag(input, "visé");
}

/** Un seul mot, normalisé exactement comme à l'écriture d'une image. */
function oneTag(input: string, role: "visé" | "nouveau"): string {
  const [tag] = mediaTags([input]);
  if (tag === undefined) {
    throw new MediaTagRequiredError(role);
  }
  return tag;
}

/** Les images qui portent le mot — l'appelant a pu en passer d'autres. */
function carriersOf(images: readonly TaggedImage[], tag: string): readonly TaggedImage[] {
  const carriers = images.filter((image) => image.tags.includes(tag));
  if (carriers.length === 0) {
    throw new MediaTagNotFoundError(tag);
  }
  return carriers;
}
