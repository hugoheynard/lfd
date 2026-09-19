import type { ActivityModule } from "@lfd/contracts";

/**
 * À quel **module** appartient un fait du journal, déduit du préfixe de son
 * type (`vat_rate.rate_changed` → `pim`).
 *
 * Dérivé plutôt que stocké : la colonne n'existe pas, et l'ajouter obligerait à
 * la remplir pour tous les faits déjà écrits — alors que le préfixe la porte
 * déjà. Le jour où un type ne se range plus sous un préfixe, c'est le type
 * qu'il faut renommer, pas une colonne qu'il faut ajouter.
 *
 * ⚠️ `legal_entity.` n'est rangé nulle part, et c'est délibéré (2026-09-19) :
 * notre propre entité émettrice n'est ni un compte client, ni une commande, ni
 * le référentiel. La ranger sous `comptes` l'afficherait « Comptes clients ».
 * Elle attend une décision — un module à elle, ou un libellé élargi —, et se
 * lit en attendant sous « tous les modules ».
 */
const PREFIXES: Readonly<Record<ActivityModule, readonly string[]>> = {
  pim: [
    "vat_rate.",
    "product.",
    "product_category.",
    // Le rapport et la méthode du prix pro s'écrivent au référentiel, sous le
    // même droit que les taux (`pim_tax`) : ils retarifent tout son catalogue.
    "accounting_rules.",
    // Les points de vente sont du référentiel : ses familles les citent dans
    // leur matrice de canaux (2026-09-19).
    "point_of_sale.",
  ],
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
    // Le catalogue B2B — prix négocié, vitrine, arrivée validée — décide ce
    // qu'on vend et à quel prix : le même métier que la tarification
    // (2026-09-19).
    "catalog_item.",
    "catalog_delivery.",
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
    // Une dérogation laisse passer une commande en retard, la surtaxe dit ce
    // que ce retard coûte : deux gestes sur la même commande (2026-09-19).
    // ⚠️ `order_cutoff_waiver.` ne tombe PAS sous `order_cutoff.` — le point
    // fait partie du préfixe —, d'où son entrée propre.
    "order_cutoff_waiver.",
    "order_late_fee.",
    "delivery_availability.",
  ],
  // Le RIB d'une société s'écrit `company.bank_account_changed` : il se range
  // ici par son préfixe, sans entrée propre.
  comptes: [
    "user.",
    "company.",
    "subscription.",
    "support.",
    // Le mandat SEPA d'une société cliente se lit avec son RIB, déjà ici : c'est
    // l'autorisation de prélever SON compte (2026-09-19).
    "payment_mandate.",
  ],
  // L'annuaire staff et ses rôles : qui entre, avec quels droits, et qui l'a décidé.
  equipe: ["staff_user.", "staff_role."],
  // Le fournil : arrêter et reprendre une journée, régler le contenant d'un
  // article (2026-09-19). Les coches d'atelier n'y écrivent rien encore.
  production: ["production_day.", "production_container."],
};

/** Les préfixes d'un module — l'entrée du filtre côté base. */
export function prefixesOf(module: ActivityModule): readonly string[] {
  return PREFIXES[module];
}

/** Les modules, dans l'ordre où on les essaie. Typé, donc `moduleOf` n'a rien à transtyper. */
const MODULES: readonly ActivityModule[] = [
  "pim",
  "commercial",
  "commandes",
  "comptes",
  "equipe",
  "production",
];

/** Le module d'un type, ou `null` si son préfixe n'est rattaché à aucun. */
export function moduleOf(type: string): ActivityModule | null {
  return (
    MODULES.find((module) => PREFIXES[module].some((prefix) => type.startsWith(prefix))) ?? null
  );
}
