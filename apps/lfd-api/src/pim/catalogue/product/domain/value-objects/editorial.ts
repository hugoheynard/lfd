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
  readonly descriptionShort?: string | undefined;
  readonly descriptionLong?: string | undefined;
  readonly story?: string | undefined;
  readonly pairing?: string | undefined;
  readonly brand?: string | undefined;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
}

export interface MediaInput {
  readonly role: string;
  readonly url: string;
  readonly alt?: string | undefined;
}

/** Un champ vide n'est pas une valeur : il ne doit pas créer de `{ fr: "" }`. */
function optionalText(field: string, raw: string | undefined): LocalizedText | undefined {
  return raw === undefined || raw.trim() === ""
    ? undefined
    : localizedText(field, { [SOURCE_LOCALE]: raw });
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
      alt: localizedText("texte alternatif", { [SOURCE_LOCALE]: input.alt ?? url }),
      position: items.length,
    });
  }

  return items;
}
