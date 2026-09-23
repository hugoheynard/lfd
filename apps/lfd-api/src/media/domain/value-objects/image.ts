import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Ce qu'on DÉCIDE d'une image — par opposition à ce qu'un porteur en fait.
 *
 * 🔴 Ces règles vivaient sous `pim/catalogue/shared/`, avec celles du
 * rattachement. Elles s'en sont séparées le 2026-09-23 : les mots-clés et le
 * point focal décrivent l'image, le rôle et le rang décrivent son EMPLOI. Les
 * garder ensemble faisait croire que le référentiel possédait les deux.
 */

/** Plafonds des tags. Bornés parce qu'un champ libre non borné finit par
 *  recevoir un paragraphe collé depuis un tableur. */
const MAX_TAG_LENGTH = 40;
const MAX_TAGS = 30;

export class TooManyMediaTagsError extends DomainError {
  constructor(readonly count: number) {
    super(
      "catalogue.media.too_many_tags",
      `Trop de mots-clés sur une image : ${String(count)} pour ${String(MAX_TAGS)} au plus.`,
    );
  }
}

/**
 * Les mots par lesquels on retrouve une image, **normalisés**.
 *
 * Vocabulaire libre et à plat : ni arbre, ni racine, ni liste fermée. Ce qui
 * est imposé, c'est la FORME — et seulement elle :
 *
 * - découpé et débarrassé de ses espaces, parce qu'un tag qui commence par une
 *   espace ne se retrouve jamais ;
 * - en **minuscules**, parce que « Croissant » et « croissant » doivent être le
 *   même mot. Sans ça, un vocabulaire libre devient un vocabulaire à doublons,
 *   ce qu'on lui reproche à juste titre ;
 * - **dédoublonné**, en gardant le premier venu : l'ordre de saisie est le seul
 *   ordre que quelqu'un ait voulu.
 *
 * Les vides disparaissent sans faire échouer : « croissant, , beurre » est une
 * virgule de trop, pas une erreur à signaler.
 *
 * @throws {TooManyMediaTagsError} au-delà de {@link MAX_TAGS} mots distincts.
 */
export function mediaTags(inputs: readonly string[]): string[] {
  const kept: string[] = [];
  for (const input of inputs) {
    const tag = input.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (tag === "" || kept.includes(tag)) {
      continue;
    }
    kept.push(tag);
  }
  if (kept.length > MAX_TAGS) {
    throw new TooManyMediaTagsError(kept.length);
  }
  return kept;
}

/**
 * Le point gardé au centre quand le cadre n'a pas la forme de l'image.
 *
 * Fractions de 0 à 1 depuis le coin haut-gauche — jamais des pixels : l'image
 * est recadrée à des tailles qu'on ne connaît pas, et une coordonnée absolue
 * ne voudrait rien dire une fois la vignette produite.
 *
 * 🔴 `null` veut dire « personne ne s'est prononcé », et **pas** « au centre ».
 * Le centre est un choix comme un autre ; les confondre obligerait à deviner
 * lequel on lit, et retirerait le moyen de dire « je n'ai pas décidé ».
 */
export interface FocalPoint {
  readonly x: number;
  readonly y: number;
}

export class InvalidFocalPointError extends DomainError {
  constructor() {
    super("catalogue.media.invalid_focal_point", "Le point focal se donne en fractions de 0 à 1.");
  }
}

/**
 * Valide un point focal, ou le laisse absent.
 *
 * @throws {InvalidFocalPointError} hors de [0, 1], ou non fini.
 */
export function focalPoint(input: FocalPoint | null): FocalPoint | null {
  if (input === null) {
    return null;
  }
  if (!inUnit(input.x) || !inUnit(input.y)) {
    throw new InvalidFocalPointError();
  }
  return { x: input.x, y: input.y };
}

function inUnit(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/** L'URL visée n'est portée par aucune inscription de la bibliothèque (→ 404). */
export class MediaNotInLibraryError extends ResourceNotFoundError {
  constructor(url: string) {
    super("catalogue.media.not_in_library", `Image absente de la bibliothèque : ${url}`);
  }
}

/**
 * On ne supprime pas une image qu'un porteur affiche (→ 409).
 *
 * 🔴 **La base tient déjà la règle** : `product_media` et `category_media`
 * référencent l'actif en `ON DELETE RESTRICT`, donc Postgres refuserait de
 * toute façon. Cette erreur-ci existe pour que le refus arrive **avant** la
 * tentative, et surtout pour qu'il DISE combien de fiches la portent : un
 * « suppression impossible » sans chiffre laisse chercher lesquelles.
 *
 * ⚠️ Le compte ne peut pas devenir une autorisation. Il vaut au moment de la
 * lecture ; c'est la contrainte de base qui reste le dernier mot.
 */
export class MediaStillInUseError extends BusinessError {
  constructor(readonly uses: number) {
    super(
      "catalogue.media.still_in_use",
      uses === 1
        ? "Cette image est affichée par une fiche : retirez-la d'abord."
        : `Cette image est affichée par ${String(uses)} fiches : retirez-la d'abord.`,
    );
  }
}
