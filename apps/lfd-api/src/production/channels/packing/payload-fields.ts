import type { SaleUnit } from "@lfd/money";

/**
 * **Relire un champ de charge utile**, côté abonné — sans jamais inventer de
 * valeur. Chaque lecteur rend `null` quand le champ est hors forme ; c'est
 * l'appelant (`fromPayload`) qui lève l'erreur propre à son fait.
 *
 * Partagés par les trois faits du canal : trois copies des mêmes gardes
 * auraient divergé à la première correction.
 */

/** Une chaîne non vide, ou `null`. */
export function textOf(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Un entier strictement positif — une quantité de pièces —, ou `null`. */
export function piecesOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * L'unité d'une ligne (P6 de `pricing/plan-vente-au-poids.md`) : `piece` ou
 * `weight`. **Absente = `piece`** — un fait écrit avant le champ ne portait
 * que des pièces, aucun article au poids n'existait. Une valeur inconnue rend
 * `null` : la relire en pièces ferait coliser des grammes un par un.
 */
export function saleUnitOf(value: unknown): SaleUnit | null {
  if (value === undefined) {
    return "piece";
  }
  return value === "piece" || value === "weight" ? value : null;
}

/** Un instant ISO lisible, ou `null`. */
export function instantOf(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Un objet clé → valeur (pas un tableau), ou `null`. */
export function recordOf(value: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return Object.fromEntries(Object.entries(value));
}
