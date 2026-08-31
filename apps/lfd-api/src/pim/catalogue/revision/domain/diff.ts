import type { FieldDiffView } from "@lfd/pim-contracts";

import { canonical, type JsonObject, type JsonValue } from "./fingerprint.js";

/**
 * **Le diff entre deux ancres — pur, et paresseux par construction.**
 *
 * L'appelant compare d'abord des couples `(sku, empreinte)`, qui tiennent dans
 * une requête. Il ne charge les payloads que des articles dont l'empreinte
 * diffère : sur un catalogue de mille articles dont trois ont bougé, on lit
 * trois payloads. C'est toute la raison d'être du magasin adressé par contenu —
 * sans lui, un diff relirait deux catalogues entiers pour en comparer trois
 * lignes.
 */

/** Ce qu'une révision expose pour être comparée sans être lue. */
export interface RevisionIndex {
  /** L'empreinte de chaque article, par SKU. */
  readonly hashBySku: ReadonlyMap<string, string>;
  readonly proRatioBp: number | null;
}

/** Les SKU à charger, et eux seuls. */
export interface DiffPlan {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  /** Présents des deux côtés, empreintes différentes. */
  readonly changed: readonly string[];
}

/**
 * Ce qu'il faut lire avant de pouvoir détailler — sans rien lire.
 *
 * Les listes sont **triées** : deux appels sur les mêmes révisions rendent le
 * même plan, et un écran qui pagine ne verra pas ses lignes danser.
 */
export function planDiff(before: RevisionIndex, after: RevisionIndex): DiffPlan {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [sku, hash] of after.hashBySku) {
    const previous = before.hashBySku.get(sku);
    if (previous === undefined) {
      added.push(sku);
    } else if (previous !== hash) {
      changed.push(sku);
    }
  }
  for (const sku of before.hashBySku.keys()) {
    if (!after.hashBySku.has(sku)) {
      removed.push(sku);
    }
  }
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}

/** Ce qui a bougé dans l'en-tête. Vide = rien. */
export function headerDiff(before: RevisionIndex, after: RevisionIndex): readonly FieldDiffView[] {
  if (before.proRatioBp === after.proRatioBp) {
    return [];
  }
  return [
    {
      field: "proRatioBp",
      before: label(before.proRatioBp),
      after: label(after.proRatioBp),
    },
  ];
}

/** Un article modifié, champ par champ. */
export interface ItemDiff {
  readonly sku: string;
  readonly fields: readonly FieldDiffView[];
}

/**
 * Le détail d'un article, **au premier niveau**.
 *
 * Un champ imbriqué qui bouge (une description en italien, l'alternative d'un
 * visuel) rend une ligne pour le champ ENTIER, sérialisé. Descendre plus bas
 * demanderait de décider ce qu'est « la même » entrée dans deux tableaux — un
 * visuel déplacé est-il modifié ou remplacé ? — et cette question n'a pas de
 * réponse universelle. La rendre au premier niveau est honnête : elle dit que
 * le champ a changé, et montre les deux états.
 */
export function diffItem(sku: string, before: JsonObject, after: JsonObject): ItemDiff {
  const fields: FieldDiffView[] = [];
  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const from = canonical(before[key] ?? null);
    const to = canonical(after[key] ?? null);
    if (from !== to) {
      fields.push({ field: key, before: readable(before[key]), after: readable(after[key]) });
    }
  }
  return { sku, fields };
}

/** `null` est une VALEUR (« jamais réglé »), pas une absence : elle se nomme. */
function label(value: number | null): string {
  return value === null ? "—" : String(value);
}

/**
 * La forme lue par un humain : les chaînes telles quelles, le reste canonique.
 *
 * Sans ce cas particulier, un nom de produit sortirait entouré de guillemets
 * dans la colonne « avant » d'un tableau, et chaque diff textuel se lirait avec
 * du bruit autour.
 */
function readable(value: JsonValue | undefined): string {
  if (value === undefined) {
    return "—";
  }
  return typeof value === "string" ? value : canonical(value);
}
