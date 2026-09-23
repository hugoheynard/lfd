import { DomainError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * Les VISUELS, indépendamment de ce qui les porte.
 *
 * Ces règles vivaient sous `product/`, du temps où une fiche était le seul
 * porteur possible. Une FAMILLE en porte aussi désormais, et faire dépendre son
 * domaine de celui des produits aurait posé une hiérarchie qui n'existe pas :
 * ni l'un ni l'autre ne possède la bibliothèque.
 */

/** Usages d'un visuel. Chaque canal en consomme un sous-ensemble (doc 01). */
export const MEDIA_ROLES = ["hero", "gallery", "lifestyle", "thumbnail", "print"] as const;

export type MediaRole = (typeof MEDIA_ROLES)[number];

/** Rôles dont il ne peut exister **qu'un seul** visuel par porteur. */
const SINGLE_ROLES: readonly MediaRole[] = ["hero", "thumbnail"];

export class DuplicateMediaRoleError extends DomainError {
  constructor(readonly role: MediaRole) {
    super(
      "catalogue.media.duplicate_role",
      `Un seul visuel « ${role} » — remplacez celui qui existe.`,
    );
  }
}

export class MissingMediaUrlError extends DomainError {
  constructor() {
    super("catalogue.media.missing_url", "Un visuel doit avoir une adresse.");
  }
}

/**
 * Ce qu'un porteur décide d'une image : **son usage et son rang**, rien d'autre.
 *
 * 🔴 L'étiquette et le texte alternatif en sont SORTIS le 2026-09-23. Ils
 * décrivent l'image, pas l'emploi qu'une fiche en fait, et ils ont désormais
 * un seul point — la médiathèque (décision Hugo). Les laisser ici obligeait le
 * référentiel à écrire dans la bibliothèque à chaque enregistrement de fiche,
 * ce qui lui en donnait la propriété au sens de
 * `lint:prisma-model-ownership` — et rendait le déménagement impossible.
 */
export interface MediaItem {
  readonly role: MediaRole;
  readonly url: string;
  readonly position: number;
}

/** Ce qu'un écran ENVOIE : une adresse, et ce qu'il veut en faire. */
export interface MediaInput {
  readonly role: string;
  readonly url: string;
}

export function isMediaRole(value: string): value is MediaRole {
  return MEDIA_ROLES.some((role) => role === value);
}

/**
 * La liste reçue, validée et **numérotée par son rang**.
 *
 * La position n'est pas une entrée : deux images ne peuvent donc pas revendiquer
 * la même place, et l'ordre affiché est l'ordre enregistré par construction.
 */
export function mediaItems(inputs: readonly MediaInput[]): MediaItem[] {
  const items: MediaItem[] = [];
  const usedSingles = new Set<MediaRole>();

  for (const input of inputs) {
    const url = input.url.trim();
    if (url === "") {
      throw new MissingMediaUrlError();
    }
    if (!isMediaRole(input.role)) {
      continue; // rôle inconnu : ignoré plutôt que de faire échouer l'enregistrement
    }
    if (SINGLE_ROLES.includes(input.role)) {
      if (usedSingles.has(input.role)) {
        throw new DuplicateMediaRoleError(input.role);
      }
      usedSingles.add(input.role);
    }

    items.push({ role: input.role, url, position: items.length });
  }

  return items;
}
