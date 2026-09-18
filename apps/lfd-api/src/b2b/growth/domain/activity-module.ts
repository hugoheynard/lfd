import type { ActivityModule } from "@lfd/contracts";

/**
 * À quel **module** appartient un fait du journal, déduit du préfixe de son
 * type (`vat_rate.rate_changed` → `pim`).
 *
 * Dérivé plutôt que stocké : la colonne n'existe pas, et l'ajouter obligerait à
 * la remplir pour tous les faits déjà écrits — alors que le préfixe la porte
 * déjà. Le jour où un type ne se range plus sous un préfixe, c'est le type
 * qu'il faut renommer, pas une colonne qu'il faut ajouter.
 */
const PREFIXES: Readonly<Record<ActivityModule, readonly string[]>> = {
  pim: ["vat_rate.", "product.", "product_category."],
  // La tarification négociée est du COMMERCIAL : c'est le même métier que le
  // lead et le rendez-vous — ce qu'on consent à un client pour qu'il achète.
  commercial: [
    "lead.",
    "appointment.",
    "reco.",
    "price_rule.",
    "price_floor.",
    "volume_ladder.",
    "volume_commitment.",
  ],
  // Zones, points de retrait, heures limites et ouverture de la livraison
  // décident où et quand une commande part : ils se lisent avec les commandes,
  // pas avec les prix.
  commandes: [
    "order.",
    "delivery_zone.",
    "pickup_address.",
    // Les créneaux PUBLICS d'un point : même famille que le point lui-même —
    // ils décident de l'heure à laquelle une commande change de mains.
    "public_pickup_schedule.",
    "order_cutoff.",
    "delivery_availability.",
  ],
  comptes: ["user.", "company.", "subscription.", "support."],
  // L'annuaire staff et ses rôles : qui entre, avec quels droits, et qui l'a décidé.
  equipe: ["staff_user.", "staff_role."],
};

/** Les préfixes d'un module — l'entrée du filtre côté base. */
export function prefixesOf(module: ActivityModule): readonly string[] {
  return PREFIXES[module];
}

/** Les modules, dans l'ordre où on les essaie. Typé, donc `moduleOf` n'a rien à transtyper. */
const MODULES: readonly ActivityModule[] = ["pim", "commercial", "commandes", "comptes", "equipe"];

/** Le module d'un type, ou `null` si son préfixe n'est rattaché à aucun. */
export function moduleOf(type: string): ActivityModule | null {
  return (
    MODULES.find((module) => PREFIXES[module].some((prefix) => type.startsWith(prefix))) ?? null
  );
}
