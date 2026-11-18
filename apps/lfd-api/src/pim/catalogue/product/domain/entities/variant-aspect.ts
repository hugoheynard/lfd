import type { VariantSnapshot } from "./variant-snapshot.js";

/**
 * Ce qu'une déclinaison peut **suivre** de celle par défaut, tel qu'on le
 * DEMANDE — la surface acceptée en écriture.
 *
 * Une union nommée et non des méthodes jumelles : le jour où une quatrième
 * section devient alignable, c'est une valeur de plus ici et une colonne de
 * plus en base — pas un chemin de plus à tenir d'accord avec les autres.
 *
 * Trois sections seulement, et c'est le MODÈLE qui le décide : l'identité, la
 * communication et les visuels sont portés par la fiche, donc une déclinaison
 * ne peut pas en diverger — il n'y a rien à aligner sur ce qu'on ne possède pas.
 */
export type VariantAspect = "regulatory" | "allergens" | "pricing" | "nutrition";

/**
 * Les drapeaux réellement PORTÉS — un par colonne, et trois pour quatre mots.
 *
 * `regulatory_follows_default` est devenue celle des allergènes le 2026-09-22
 * sans changer de nom : elle garde sa valeur et ses lecteurs, et n'en perd
 * qu'une moitié de sens (`plan-separer-allergenes-et-nutrition.md`, §6d).
 */
export type VariantFlag = "regulatory" | "pricing" | "nutrition";

/**
 * 🔴 **Le seul endroit où `"regulatory"` et `"allergens"` se rejoignent.**
 *
 * Les valeurs de l'énumération s'AJOUTENT, on ne renomme pas : `"regulatory"`
 * est déjà posée dans des faits de journal que personne ne réécrira. Elle
 * désigne donc le drapeau des allergènes, exactement comme `"allergens"`.
 *
 * Plus aucun écran ne l'émet depuis le 2026-09-22 ; elle reste acceptée le
 * temps que la bascule du back-office soit en production, puisque les deux ne
 * se déploient pas ensemble. Le jour où elle se retire, cette table perd une
 * ligne et rien d'autre — résoudre la correspondance ailleurs (un `if` dans le
 * handler, un autre dans l'adaptateur) l'aurait rendue impossible à retirer
 * sans les retrouver tous.
 */
export const ASPECT_FLAG: Readonly<Record<VariantAspect, VariantFlag>> = {
  regulatory: "regulatory",
  allergens: "regulatory",
  pricing: "pricing",
  nutrition: "nutrition",
};

/**
 * Le drapeau d'une section, **lu sur un instantané** plutôt que sur l'entité.
 *
 * Pour l'appelant qui a relevé l'état d'AVANT et veut savoir si le geste change
 * quelque chose : l'entité, elle, porte déjà la nouvelle valeur. Exporté pour
 * que la correspondance `"regulatory"` → allergènes n'existe qu'ici.
 */
export function followsDefaultIn(snapshot: VariantSnapshot, aspect: VariantAspect): boolean {
  const flags: Record<VariantFlag, boolean> = {
    regulatory: snapshot.regulatoryFollowsDefault,
    pricing: snapshot.pricingFollowsDefault,
    nutrition: snapshot.nutritionFollowsDefault,
  };
  return flags[ASPECT_FLAG[aspect]];
}
