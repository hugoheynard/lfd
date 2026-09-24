import { InvalidStorefrontError } from "./storefront-errors.js";

/** Un texte localisé en primitives — la forme rangée en `jsonb`. */
export interface StorefrontTextState {
  readonly fr: string;
  readonly en?: string | undefined;
  readonly it?: string | undefined;
}

/** Ce qu'on dit d'un champ dans un refus, et sa longueur maximale. */
export interface StorefrontTextField {
  /** « Le titre d'une info », « La pastille »… — le sujet de la phrase de refus. */
  readonly label: string;
  readonly max: number;
}

/** Les champs localisés de la vitrine, et leurs bornes (plan, D5). */
export const STOREFRONT_TEXT_FIELDS = {
  badge: { label: "La pastille", max: 30 },
  title: { label: "Le titre d'une info", max: 80 },
  lede: { label: "La phrase d'une info", max: 280 },
  imageAlt: { label: "Le texte alternatif d'une image", max: 200 },
} as const satisfies Readonly<Record<string, StorefrontTextField>>;

/**
 * **Un texte de vitrine** : le français est obligatoire, l'anglais et
 * l'italien facultatifs (plan, D5).
 *
 * Propre au contexte, et non le `LocalizedText` du référentiel : les deux
 * contextes ne s'importent pas, et leurs règles divergeront — celui-ci n'a
 * pas de langue « de repli », il a une langue exigée.
 *
 * Une traduction vide est une traduction ABSENTE : la boutique retombera sur
 * le français plutôt que d'afficher un blanc.
 */
export class StorefrontText {
  private constructor(private readonly state: StorefrontTextState) {}

  /** @throws {InvalidStorefrontError} français vide, ou une langue trop longue. */
  static of(input: StorefrontTextState, field: StorefrontTextField): StorefrontText {
    const fr = input.fr.trim();
    if (fr === "") {
      throw new InvalidStorefrontError("text", `${field.label} porte un texte en français.`);
    }
    const en = optional(input.en);
    const it = optional(input.it);
    for (const value of [fr, en, it]) {
      if (value !== undefined && value.length > field.max) {
        throw new InvalidStorefrontError(
          "text",
          `${field.label} tient en ${String(field.max)} caractères, dans chaque langue.`,
        );
      }
    }
    return new StorefrontText({
      fr,
      ...(en === undefined ? {} : { en }),
      ...(it === undefined ? {} : { it }),
    });
  }

  toPersistence(): StorefrontTextState {
    return { ...this.state };
  }
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}
