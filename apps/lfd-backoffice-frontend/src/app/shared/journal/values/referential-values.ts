import { domain, ROOT_RECORD, type ValueFamily } from './value-domain';

/**
 * **Le référentiel** — fiches, familles, révisions, et ce qui règle le
 * catalogue (familles `referentialCatalogue` et `referentialSettings` du
 * catalogue des faits).
 */

/**
 * Les contextes de vente, par CLÉ — celle que `vatByContext` et la portée
 * (`blast.families`) emploient comme clés de record.
 *
 * Les libellés sont ceux du semis et de la migration qui les a créés
 * (`20260824150000_contextes_de_vente`, `prisma/seed-pim/catalogue.ts`, vérifié
 * le 2026-09-19). `emporter` et `surPlace` sont les clés d'avant le
 * 2026-08-26 (`20260826200000_resserrer_matrice_de_canaux`) : la migration a
 * renommé le registre, pas les charges — une ligne d'août les porte encore.
 *
 * ⚠️ Un contexte CRÉÉ à l'écran n'est pas ici, et ne peut pas l'être : sa clé
 * est une donnée. Il s'affiche sous sa clé — la charge ne fige pas le
 * libellé du contexte (signalé au lot D).
 */
export const SALES_CONTEXT = domain('contexte de vente', {
  takeaway: 'À emporter',
  eatIn: 'Sur place',
  b2b: 'B2B',
  emporter: 'À emporter',
  surPlace: 'Sur place',
});

/** Les mêmes mots que la fiche produit (`product-form-store.ts`, `KINDS`, vérifié le 2026-09-19). */
export const PRODUCT_KIND = domain('sorte de produit', {
  daily: 'Frais du jour',
  made_to_order: 'Sur commande',
  resale: 'Revente',
});

/** La section qu'une déclinaison aligne sur le défaut (`variant.aligned`). */
export const VARIANT_ASPECT = domain('section d’une déclinaison', {
  /** L'ancienne section entière — elle vaut `allergens` depuis le 2026-09-22. */
  regulatory: 'Fiche réglementaire',
  allergens: 'Allergènes',
  nutrition: 'Valeurs nutritionnelles',
  pricing: 'Tarif',
});

/** Les mêmes mots que l'intégration Shopify (`shopify-integration.html`, vérifié le 2026-09-19). */
export const PUSH_MODE = domain('mode d’envoi', {
  live: 'Réel',
  'dry-run': 'Simulation',
});

/** Les mêmes mots que la liste des points de vente (`point-of-sale-list.html`). */
export const POINT_OF_SALE_KIND = domain('genre de point de vente', {
  shop: 'Boutique',
  platform: 'Plateforme',
});

/**
 * Le canal vers lequel une révision part (`catalog_revision.pushed`) — une
 * énumération au catalogue depuis le lot D (2026-09-19) : seul `b2b` a jamais
 * été écrit (`push-b2b-catalog.ts`, depuis `2c6a0988`).
 */
export const PUSH_CHANNEL = domain('canal de diffusion', {
  b2b: 'Plateforme professionnelle',
});

/**
 * La méthode du prix professionnel (`accounting_rules.method_changed`) —
 * l'énumération que le catalogue déclare depuis le lot D (2026-09-19,
 * `z.enum(["ratio_ttc"])`). Une énumération se reconnaît à l'ensemble EXACT de
 * ses valeurs : celui-ci ne porte donc que les méthodes qui s'écrivent.
 */
export const PRO_PRICE_METHOD_WRITTEN = domain('méthode du prix professionnel', {
  ratio_ttc: 'Ratio TTC pré-remise',
});

/**
 * Toutes celles qu'une ligne peut citer, pour la phrase : la forme ouverte
 * (`z.string()`) reste en base, et `remise_apres_tva_max` a existé du
 * 2026-09-13 (`7278ca63`) à son retrait le même jour (`a055b4f9`). Libellés de
 * l'écran des règles comptables, à chacune de ces dates.
 */
export const PRO_PRICE_METHOD = domain('méthode du prix professionnel (toutes)', {
  ...PRO_PRICE_METHOD_WRITTEN.labels,
  remise_apres_tva_max: 'Remise après plus haute TVA possible',
});

/**
 * La clientèle d'une opération datée (`operation.*`, D7 du plan
 * `documentation/order/architecture-operations-datees.md`, 2026-09-24).
 */
export const OPERATION_AUDIENCE = domain('clientèle d’une opération', {
  pro: 'Professionnels',
  public: 'Particuliers',
  both: 'Professionnels et particuliers',
});

export const REFERENTIAL_VALUES: ValueFamily = {
  enums: [
    PRODUCT_KIND,
    VARIANT_ASPECT,
    PUSH_MODE,
    POINT_OF_SALE_KIND,
    PUSH_CHANNEL,
    PRO_PRICE_METHOD_WRITTEN,
    OPERATION_AUDIENCE,
  ],
  literals: {
    // Une fiche qui n'a pas sa propre matrice de canaux suit celle de sa famille.
    inherited: 'Ceux de la famille',
  },
  recordKeys: {
    vatByContext: SALES_CONTEXT,
    // Le même, quand il était la charge entière (lot A, `vatByContextV1`).
    [ROOT_RECORD]: SALES_CONTEXT,
    families: SALES_CONTEXT,
    // Le libellé du moment de chaque contexte, par sa clé (lot D) : un
    // dictionnaire figé à l'écriture, dont les clés sont des données.
    contextLabels: 'free',
    // Le nom d'une option de déclinaison (« Taille ») : saisi à l'écran.
    options: 'free',
  },
};
