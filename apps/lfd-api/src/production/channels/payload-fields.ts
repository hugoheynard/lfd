import type { SaleUnit } from "@lfd/money";

/**
 * **Relire un champ de charge utile**, côté abonné — sans jamais inventer de
 * valeur. Chaque lecteur rend `null` quand le champ est hors forme ; c'est
 * l'appelant (`fromPayload`) qui lève l'erreur propre à son fait.
 *
 * Partagés par les faits de TOUS les canaux du fournil (colisage, commerce,
 * livraison) : des copies des mêmes gardes auraient divergé à la première
 * correction. Rangés à la racine de `channels/` le 2026-11-03 : le canal du
 * commerce et celui de la livraison les lisaient jusque-là DANS le canal du
 * colisage, comme s'ils en dépendaient.
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
 * L'unité d'une ligne (P6 de `pricing/vente-au-poids.md`) : `piece` ou
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

/** Une option de ligne relue : le groupe, le choix, et combien d'unités la portent. */
export interface LineOptionField {
  readonly groupName: string;
  readonly choiceLabel: string;
  readonly quantity: number;
}

/**
 * Les options d'une ligne (« dont 2 tranchés »,
 * `documentation/catalogue/plan-options-de-commande.md`, § 3.4). **Absentes
 * = `[]`** — un fait ou une colonne d'avant les options n'en portait aucune.
 * Une forme illisible rend `null`, jamais `[]` : la relire « sans option »
 * ferait livrer entier un pain qu'on a demandé tranché.
 */
export function lineOptionsOf(value: unknown): readonly LineOptionField[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const options: LineOptionField[] = [];
  for (const item of value) {
    const raw = recordOf(item);
    const groupName = textOf(raw?.["groupName"]);
    const choiceLabel = textOf(raw?.["choiceLabel"]);
    const quantity = piecesOf(raw?.["quantity"]);
    if (groupName === null || choiceLabel === null || quantity === null) {
      return null;
    }
    options.push({ groupName, choiceLabel, quantity });
  }
  return options;
}
