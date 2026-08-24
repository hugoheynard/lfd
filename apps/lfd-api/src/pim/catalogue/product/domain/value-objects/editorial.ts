import { DomainError } from "../../../../../platform/shared/errors/app-error.js";
import {
  localizedText,
  SOURCE_LOCALE,
  type LocalizedText,
} from "../../../shared/domain/value-objects/localized-text.js";

/** Usages d'un visuel. Chaque canal en consomme un sous-ensemble (doc 01). */
export const MEDIA_ROLES = ["hero", "gallery", "lifestyle", "thumbnail", "print"] as const;

export type MediaRole = (typeof MEDIA_ROLES)[number];

/** Rôles dont il ne peut exister **qu'un seul** visuel par produit. */
const SINGLE_ROLES: readonly MediaRole[] = ["hero", "thumbnail"];

export class DuplicateMediaRoleError extends DomainError {
  constructor(readonly role: MediaRole) {
    super(
      "catalogue.media.duplicate_role",
      `Un seul visuel « ${role} » par produit — remplacez celui qui existe.`,
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

export interface Editorial {
  readonly descriptionShort?: LocalizedText | undefined;
  readonly descriptionLong?: LocalizedText | undefined;
  readonly story?: LocalizedText | undefined;
  readonly pairing?: LocalizedText | undefined;
  readonly brand?: string | undefined;
  readonly seoTitle?: LocalizedText | undefined;
  readonly seoDescription?: LocalizedText | undefined;
}

export interface EditorialInput {
  readonly descriptionShort?: LocalizedText | undefined;
  readonly descriptionLong?: LocalizedText | undefined;
  readonly story?: LocalizedText | undefined;
  readonly pairing?: LocalizedText | undefined;
  /** Un nom propre, donc pas de traduction : « La Folie Coffee » l'est partout. */
  readonly brand?: string | undefined;
  readonly seoTitle?: LocalizedText | undefined;
  readonly seoDescription?: LocalizedText | undefined;
}

export interface MediaInput {
  readonly role: string;
  readonly url: string;
  readonly name?: string | undefined;
  /** Le SEUL champ d'image qui se traduit — accessibilité ET référencement. */
  readonly alt?: LocalizedText | undefined;
}

/**
 * Un champ vide n'est pas une valeur : il ne doit pas créer de `{ fr: "" }`.
 *
 * L'entrée arrive déjà localisée, donc on la RECONSTRUIT plutôt que de la
 * recopier — `localizedText` est le seul endroit qui sait rogner, écarter une
 * traduction vide et exiger la langue source. La laisser passer telle quelle
 * ferait entrer en base ce qu'aucune autre porte ne laisserait entrer.
 */
function optionalText(field: string, raw: LocalizedText | undefined): LocalizedText | undefined {
  if (raw === undefined || (raw[SOURCE_LOCALE] ?? "").trim() === "") {
    return undefined;
  }
  return localizedText(field, raw);
}

export function editorial(input: EditorialInput): Editorial {
  const brand = input.brand?.trim();
  return {
    descriptionShort: optionalText("résumé", input.descriptionShort),
    descriptionLong: optionalText("description", input.descriptionLong),
    story: optionalText("récit", input.story),
    pairing: optionalText("accord", input.pairing),
    ...(brand === undefined || brand === "" ? {} : { brand }),
    seoTitle: optionalText("titre SEO", input.seoTitle),
    seoDescription: optionalText("description SEO", input.seoDescription),
  };
}

/** Rien de renseigné ⇒ pas de ligne du tout (satellite optionnel, ADR-13). */
export function isEmptyEditorial(value: Editorial): boolean {
  return Object.values(value).every((entry) => entry === undefined);
}

export function isMediaRole(value: string): value is MediaRole {
  return MEDIA_ROLES.some((role) => role === value);
}

export function mediaItems(inputs: readonly MediaInput[]): MediaItem[] {
  const items: MediaItem[] = [];
  const usedSingles = new Set<MediaRole>();

  for (const input of inputs) {
    const url = input.url.trim();
    if (url === "") {
      throw new MissingMediaUrlError();
    }
    if (!isMediaRole(input.role)) {
      continue; // rôle inconnu : ignoré plutôt que de faire échouer la fiche
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
