import { DomainError } from "../../../../../platform/shared/errors/app-error.js";
import { localizedText, SOURCE_LOCALE, type LocalizedText } from "./localized-text.js";

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

export interface MediaItem {
  readonly role: MediaRole;
  readonly url: string;
  /** L'étiquette de la bibliothèque — courte, non traduite, faite pour
   *  RETROUVER. `''` tant que personne n'a nommé le fichier. */
  readonly name: string;
  /** Accessibilité **et** SEO : ce n'est pas un champ décoratif. */
  readonly alt: LocalizedText;
  readonly position: number;
}

export interface MediaInput {
  readonly role: string;
  readonly url: string;
  readonly name?: string | undefined;
  /** Le SEUL champ d'image qui se traduit — accessibilité ET référencement. */
  readonly alt?: LocalizedText | undefined;
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

    items.push({
      role: input.role,
      url,
      name: (input.name ?? "").trim(),
      // Sans texte alternatif on retombe sur l'URL : la colonne est obligatoire,
      // et une chaîne vide passerait pour une alternative rédigée.
      alt: localizedText("texte alternatif", input.alt ?? { [SOURCE_LOCALE]: url }),
      position: items.length,
    });
  }

  return items;
}
