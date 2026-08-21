import type { ActivityModule } from "@lfd/contracts";

/**
 * À quel **module** appartient un fait du journal, déduit du préfixe de son
 * type (`tax_regime.rate_changed` → `pim`).
 *
 * Dérivé plutôt que stocké : la colonne n'existe pas, et l'ajouter obligerait à
 * la remplir pour tous les faits déjà écrits — alors que le préfixe la porte
 * déjà. Le jour où un type ne se range plus sous un préfixe, c'est le type
 * qu'il faut renommer, pas une colonne qu'il faut ajouter.
 */
const PREFIXES: Readonly<Record<ActivityModule, readonly string[]>> = {
  pim: ["tax_regime.", "product.", "category."],
  commercial: ["lead.", "appointment.", "reco."],
  commandes: ["order."],
  comptes: ["user.", "company.", "subscription.", "support."],
};

/** Les préfixes d'un module — l'entrée du filtre côté base. */
export function prefixesOf(module: ActivityModule): readonly string[] {
  return PREFIXES[module];
}

/** Les modules, dans l'ordre où on les essaie. Typé, donc `moduleOf` n'a rien à transtyper. */
const MODULES: readonly ActivityModule[] = ["pim", "commercial", "commandes", "comptes"];

/** Le module d'un type, ou `null` si son préfixe n'est rattaché à aucun. */
export function moduleOf(type: string): ActivityModule | null {
  return (
    MODULES.find((module) => PREFIXES[module].some((prefix) => type.startsWith(prefix))) ?? null
  );
}
