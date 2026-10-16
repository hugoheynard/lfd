import type { ReferentialOperation } from "../entities/operation.js";
import type { OperationTextInput } from "../value-objects/operation-text.js";

/** Les champs que la migration compare, un par un. */
export const MIGRATION_FIELDS = [
  "name",
  "lede",
  "image",
  "announceFrom",
  "orderFrom",
  "orderUntil",
  "pickupFrom",
  "pickupUntil",
  "audience",
  "skus",
  "hidden",
  "archived",
] as const;
export type MigrationField = (typeof MIGRATION_FIELDS)[number];

/** Une opération en texte, champ par champ — ce que l'aperçu affiche et compare. */
export type FieldTexts = Readonly<Record<MigrationField, string>>;

/**
 * Chaque champ en TEXTE : ISO pour les instants, `AAAA-MM-JJ` pour les jours,
 * SKU séparés par `, `, `""` pour une absence. Comparer des textes plutôt que
 * des objets : une `Date` ne se compare pas par `===`, et l'aperçu doit
 * MONTRER ce qu'il a comparé.
 */
export function fieldTexts(values: ReferentialOperation): FieldTexts {
  const { schedule } = values;
  return {
    name: textOf(values.name),
    lede: values.lede === null ? "" : textOf(values.lede),
    image: values.image?.url.trim() ?? "",
    announceFrom: schedule.announceFrom.toISOString(),
    orderFrom: schedule.orderFrom === null ? "" : schedule.orderFrom.toISOString(),
    orderUntil: schedule.orderUntil.toISOString(),
    pickupFrom: schedule.pickupFrom,
    pickupUntil: schedule.pickupUntil,
    audience: values.audience,
    skus: values.skus.join(", "),
    hidden: String(values.hidden),
    archived: String(values.archivedAt !== null),
  };
}

/** `fr`, puis les traductions présentes : `Noël · en: Christmas`. */
function textOf(text: OperationTextInput): string {
  const others = (["en", "it"] as const).flatMap((language) => {
    const value = text[language]?.trim() ?? "";
    return value === "" ? [] : [`${language}: ${value}`];
  });
  return [text.fr.trim(), ...others].join(" · ");
}
