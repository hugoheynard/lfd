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
 * `legal_entity.` a été sans module jusqu'au 2026-09-19 : notre propre entité
 * émettrice n'est ni un compte client, ni une commande, ni le référentiel. Elle
 * a désormais le sien, `comptabilite` (Hugo, 2026-09-19).
 *
 * `feature_access.` et `company_mercuriale.` étaient sans module jusqu'au lot B
 * du plan des phrases (2026-09-19) ; depuis, un test confronte chaque type du
 * catalogue des faits à cette table, et un orphelin ne passe plus.
 */
const PREFIXES: Readonly<Record<ActivityModule, readonly string[]>> = {
  pim: [
    "vat_rate.",
    // Les taux quand ils s'appelaient « régimes » : retirés, encore en base de
    // dev (21 août). Sans ce préfixe, le filtre par module les perdrait.
    "tax_regime.",
    "product.",
    "product_category.",
    // Le rapport et la méthode du prix pro s'écrivent au référentiel, sous le
    // même droit que les taux (`pim_tax`) : ils retarifent tout son catalogue.
    "accounting_rules.",
    // Les points de vente sont du référentiel : ses familles les citent dans
    // leur matrice de canaux (2026-09-19).
    "point_of_sale.",
    // Le reste du référentiel, orphelin jusqu'au 2026-09-19 : déclinaisons,
    // révisions poussées aux canaux, contextes de vente, appellations,
    // ingrédients et allergènes s'écrivent tous sous les droits du PIM.
    "variant.",
    "catalog_revision.",
    "sales_context.",
    "appellation.",
    "ingredient.",
    "allergen_category.",
    "allergen_entry.",
    // Les opérations datées se préparent au référentiel, sous `pim_catalog` :
    // choisir les articles de Noël et fixer ses dates, c'est le travail du
    // catalogue (plan des opérations datées, D1 — 2026-09-24).
    "operation.",
  ],
  // La tarification négociée est du COMMERCIAL : c'est le même métier que le
  // lead et le rendez-vous — ce qu'on consent à un client pour qu'il achète.
  commercial: [
    "lead.",
    "appointment.",
    // Une demande client traitée (2026-10-09) : la relation client, comme
    // les demandes de rappel et les rendez-vous.
    "customer_request.",
    "reco.",
    "price_rule.",
    "price_floor.",
    "volume_ladder.",
    "volume_commitment.",
    // La mercuriale d'un client est une tarification négociée comme les autres :
    // posée, renommée, archivée par le même commercial (2026-09-19).
    "company_mercuriale.",
    // Le suivi de la mercuriale d'un principal par un sous-compte : une
    // décision du commercial (Q9, `plan-sous-comptes.md`, S3).
    "pricing_follow.",
    "pricing_follower.",
    // Le catalogue B2B — prix négocié, vitrine, arrivée validée — décide ce
    // qu'on vend et à quel prix : le même métier que la tarification
    // (2026-09-19).
    "catalog_item.",
    "catalog_delivery.",
    // La surcharge d'une opération datée reçue restreint ce qu'on vend et
    // quand : le même geste que masquer un article (2026-09-24, lot 2 du plan
    // des opérations datées).
    "catalog_operation.",
    // La vitrine décide ce qu'on met en avant, sur quel rayon : le même métier
    // que la mise en avant d'un article (`catalog_item.featured`), 2026-09-24.
    "storefront.",
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
    // La TVA du port (2026-10-08) : un réglage de la commande, comme la surtaxe.
    "order_delivery_vat.",
    "delivery_availability.",
    // À qui la boutique prend des commandes (2026-10-09) : un réglage de la commande.
    "order_opening.",
    // La flotte et le départ des tournées (2026-09-29) : avec quoi et d'où
    // part une livraison. Sous `commandes` faute d'un module « livraison » —
    // en créer un est un changement du contrat `ActivityModule`, que le lot 2
    // n'a pas pris.
    "delivery_vehicle.",
    "delivery_departure.",
    // La composition des tournées (lot 3, 2026-09-29) : même famille.
    "delivery_round.",
    // Les bacs et leur chargement (lot 4, 2026-09-29) : même famille.
    "delivery_bin.",
    // Le calculateur de tournée (lot 7, 2026-09-29) : ses réglages.
    "delivery_routing.",
    // La décision réglée d'avance à la porte, globale (B3 bis, 2026-10-01) : même famille.
    "delivery_doorstep.",
    // Les scénarios du simulateur (lot 9, L9-C7, 2026-09-29) : même famille.
    "delivery_simulation_scenario.",
    // Les bacs et leurs contenances (lot 4 bis, tranche A, 2026-09-29) : même famille.
    "delivery_bin_type.",
    "delivery_bin_capacity.",
    // La bibliothèque d'achat (lot B1, 2026-09-30) : même famille.
    "delivery_purchase_vehicle_candidate.",
    "delivery_purchase_bin_candidate.",
    // Ses scénarios (lot B3, 2026-10-01) : même famille.
    "delivery_purchase_scenario.",
    // L'heure limite posée sur un produit : même famille que celle d'un point.
    "order_time_limit.",
    // Les pièces d'une remise à la porte, effacées (2026-10-01) : avec la
    // commande qu'elles prouvaient.
    "order_handover_proof.",
  ],
  // Le RIB d'une société s'écrit `company.bank_account_changed` : il se range
  // ici par son préfixe, sans entrée propre.
  //
  // L'accès aux fonctionnalités ouvre ou ferme l'espace client — boutique,
  // commandes, factures, mandat — pour tous les comptes ou une adresse : il se
  // lit avec les comptes qu'il touche (2026-09-19).
  comptes: ["user.", "company.", "subscription.", "support.", "feature_access."],
  // L'annuaire staff et ses rôles : qui entre, avec quels droits, et qui l'a décidé.
  equipe: ["staff_user.", "staff_role."],
  // Le fournil : arrêter et reprendre une journée, régler le contenant d'un
  // article (2026-09-19). Les coches d'atelier n'y écrivent rien encore. Le
  // contrôle qualité du superviseur s'y range aussi (2026-09-28, lot QC2) : un
  // verdict juge ce que le fournil a fabriqué.
  // Les contenants du colisage (K2b, 2026-10-04) : le poste est au fournil.
  production: [
    "production_day.",
    "production_container.",
    "production_quality.",
    "packing_container.",
    // Les réglages du fournil — l'arrêt du plan, les jours fermés (A1, 2026-10-06).
    "production_settings.",
    "production_closed_day.",
    // Les destinataires du dossier du jour par e-mail (E1, 2026-10-06).
    "production_dossier_recipient.",
  ],
  // Le travail de la comptabilité (Hugo, 2026-09-19). `accounting_rules.` n'y
  // est PAS : il reste sous `pim`, à côté des taux qu'il accompagne.
  comptabilite: [
    // Notre entité émettrice — raison sociale, ICS, compte créancier, schéma
    // des mandats : ce qu'on imprime sur nos factures, écrit sous `b2b_accounting`.
    "legal_entity.",
    // Le mandat SEPA qui nous autorise à prélever un client : préparé, signé,
    // envoyé, révoqué par le staff sous `b2b_payments` — le client peut aussi
    // en préparer un et y joindre sa preuve. Sous `comptes` jusqu'au 2026-09-19.
    "payment_mandate.",
    // Les liens de paiement libres, créés et annulés sous `b2b_accounting`
    // (plan liens de paiement §2b, 2026-09-25).
    "payment_link.",
    // Un remboursement Stripe qu'aucune commande ne porte — un lien libre, le
    // plus souvent (lot R1, arbitrage A11, 2026-10-08).
    "payment_refund.",
    // Le réglage de la comptabilité — aujourd'hui le plafond de ces liens.
    "accounting_settings.",
    // La fidélité, sous `b2b_accounting` : le ratio, les bons et les
    // ajustements (plan points de fidélité, 2026-09-26). `loyalty.` ne couvre
    // PAS `loyalty_settings.` — le point fait partie du préfixe.
    "loyalty_settings.",
    "loyalty.",
    // Le lot de prélèvement figé — constitué, annulé, déposé, et la commande
    // réglée autrement (plan `lot-de-prelevement-fige.md`, 2026-10-05).
    "collection.",
    // L'arrêté de facturation, figé et annulé avec son lot (plan
    // `le-prelevement-suit-la-facture.md`, 2026-10-08).
    "billing_statement.",
    // La facture émise et l'avoir (plan `facture-emise.md`, 2026-10-08).
    "invoice.",
    // L'export des mandats pour le portail de la banque, préparé et marqué
    // importé sous `b2b_accounting` (plan `export-des-mandats-pour-la-banque.md`, 2026-10-09).
    "mandate_bank_export.",
  ],
  // Le fonds d'images : un bloc à lui depuis le 2026-09-23, avec son droit
  // (`media_library`). Rangé sous `pim` jusqu'au 2026-10-10.
  // `media_tag.` : les gestes sur un mot-clé dans tout le fonds (L1, 2026-10-10).
  mediatheque: ["media_asset.", "media_tag."],
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
  "comptabilite",
  "mediatheque",
];

/** Le module d'un type, ou `null` si son préfixe n'est rattaché à aucun. */
export function moduleOf(type: string): ActivityModule | null {
  return (
    MODULES.find((module) => PREFIXES[module].some((prefix) => type.startsWith(prefix))) ?? null
  );
}
