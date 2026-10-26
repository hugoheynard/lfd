/**
 * **Ce que la purge du scénario sait de ses clés étrangères** — la déclaration
 * que `test/dev-scenario-purge-coverage.e2e-spec.ts` confronte au catalogue
 * Postgres.
 *
 * Pourquoi elle existe : le 2026-10-25, « Remettre à l'état de base » est tombé
 * en panne parce qu'une table neuve (`order_shortfall_decision`) tenait
 * `orders` en `RESTRICT` sans que la purge le sache (commit `82f2d3971`). Rien
 * ne relie une migration aux fichiers `*.purge.ts` : seule une lecture du
 * schéma réel le peut, et elle a besoin de savoir ce que la purge PRÉTEND
 * couvrir.
 *
 * Seules comptent les clés qui BLOQUENT une suppression (`RESTRICT`,
 * `NO ACTION`) : une clé en cascade ou en `SET NULL` suit d'elle-même. Chaque
 * table supprimée liste les tables qui la tiennent ainsi ET que la purge
 * supprime avant elle ; toute table ainsi listée est à son tour une table
 * supprimée, et doit donc être déclarée ici (la règle est transitive).
 *
 * Dressée en lisant les fichiers `*.purge.ts` et les clés du schéma le
 * 2026-10-25.
 */

/** Une table que la purge supprime (au moins en partie), et ceux qui la tiennent. */
export interface PurgedTable {
  /** `schéma.table`, tel que Postgres le nomme. */
  readonly table: string;
  /** Le fichier de purge qui la supprime — là où ajouter un enfant oublié. */
  readonly purgedIn: string;
  /** Les tables qui la tiennent par une clé bloquante, supprimées avant elle. */
  readonly referencedBy: readonly string[];
}

/** Une table qui tient une table purgée et que la purge laisse VOLONTAIREMENT. */
export interface PurgeExemption {
  readonly table: string;
  /** La table purgée qu'elle tient. */
  readonly references: string;
  readonly reason: string;
}

/** Le fichier où se déclare la couverture, nommé par les messages d'échec. */
export const PURGE_COVERAGE_FILE = "apps/lfd-api/src/dev/scenario/purge/purge-coverage.ts";

const COMMERCE = "commerce.purge.ts";
const DELIVERY = "delivery.purge.ts";
const PACKING = "packing.purge.ts";
const PRODUCTION = "production.purge.ts";
const RESUPPLY = "resupply.purge.ts";

/** Les tables supprimées par `purgeScenario`, domaine par domaine. */
export const SCENARIO_PURGED_TABLES: readonly PurgedTable[] = [
  {
    table: "public.orders",
    purgedIn: COMMERCE,
    referencedBy: [
      "public.delivery_note",
      "public.order_refund",
      "public.order_refund_request",
      "public.order_revision",
      "public.order_shortfall_decision",
    ],
  },
  // Les lignes partent en cascade avec leur commande.
  { table: "public.order_lines", purgedIn: COMMERCE, referencedBy: [] },
  { table: "public.order_idempotency", purgedIn: COMMERCE, referencedBy: [] },
  { table: "public.account_alerts", purgedIn: COMMERCE, referencedBy: [] },
  { table: "public.staff_notifications", purgedIn: COMMERCE, referencedBy: [] },
  { table: "public.day_change", purgedIn: COMMERCE, referencedBy: [] },
  { table: "public.order_shortfall_decision", purgedIn: COMMERCE, referencedBy: [] },
  { table: "public.order_revision", purgedIn: COMMERCE, referencedBy: [] },
  { table: "public.order_refund", purgedIn: COMMERCE, referencedBy: [] },
  { table: "public.order_refund_request", purgedIn: COMMERCE, referencedBy: [] },
  {
    table: "public.delivery_note",
    purgedIn: COMMERCE,
    referencedBy: ["public.delivery_note_line"],
  },
  { table: "public.delivery_note_line", purgedIn: COMMERCE, referencedBy: [] },

  {
    table: "public.site_resupply",
    purgedIn: RESUPPLY,
    referencedBy: ["public.resupply_receipt", "public.site_resupply_line"],
  },
  { table: "public.site_resupply_line", purgedIn: RESUPPLY, referencedBy: [] },
  {
    table: "public.resupply_receipt",
    purgedIn: RESUPPLY,
    referencedBy: ["public.resupply_receipt_line"],
  },
  { table: "public.resupply_receipt_line", purgedIn: RESUPPLY, referencedBy: [] },

  {
    table: "production.production_day",
    purgedIn: PRODUCTION,
    referencedBy: [
      "production.production_batch",
      "production.production_handoff",
      "production.production_return_request",
    ],
  },
  { table: "production.production_batch", purgedIn: PRODUCTION, referencedBy: [] },
  { table: "production.production_handoff", purgedIn: PRODUCTION, referencedBy: [] },
  { table: "production.production_return_request", purgedIn: PRODUCTION, referencedBy: [] },
  { table: "production.day_change", purgedIn: PRODUCTION, referencedBy: [] },
  { table: "production.order_handover", purgedIn: PRODUCTION, referencedBy: [] },
  { table: "production.order_handover_proof", purgedIn: PRODUCTION, referencedBy: [] },
  { table: "production.order_departure", purgedIn: PRODUCTION, referencedBy: [] },

  {
    table: "packing.packing_order",
    purgedIn: PACKING,
    referencedBy: ["packing.container", "packing.packing_line"],
  },
  { table: "packing.container", purgedIn: PACKING, referencedBy: ["packing.container_line"] },
  { table: "packing.container_line", purgedIn: PACKING, referencedBy: [] },
  { table: "packing.packing_line", purgedIn: PACKING, referencedBy: [] },
  { table: "packing.packing_stock", purgedIn: PACKING, referencedBy: [] },
  { table: "packing.packing_receipt", purgedIn: PACKING, referencedBy: [] },
  { table: "packing.packing_return", purgedIn: PACKING, referencedBy: [] },
  { table: "packing.day_change", purgedIn: PACKING, referencedBy: [] },

  {
    table: "delivery.delivery_round",
    purgedIn: DELIVERY,
    referencedBy: ["delivery.delivery_round_stop"],
  },
  {
    table: "delivery.delivery_round_stop",
    purgedIn: DELIVERY,
    referencedBy: ["delivery.delivery_bin_load", "delivery.delivery_stop_execution"],
  },
  {
    table: "delivery.delivery_bin",
    purgedIn: DELIVERY,
    referencedBy: ["delivery.delivery_bin_load"],
  },
  { table: "delivery.delivery_bin_load", purgedIn: DELIVERY, referencedBy: [] },
  { table: "delivery.delivery_stop_execution", purgedIn: DELIVERY, referencedBy: [] },
  { table: "delivery.stop_decision", purgedIn: DELIVERY, referencedBy: [] },
  { table: "delivery.delivery_incident", purgedIn: DELIVERY, referencedBy: [] },
  {
    table: "delivery.delivery_internal_transfer",
    purgedIn: DELIVERY,
    referencedBy: [
      "delivery.delivery_bin",
      "delivery.delivery_internal_transfer_item",
      "delivery.delivery_internal_transfer_manifest_line",
      "delivery.delivery_round_stop",
    ],
  },
  { table: "delivery.delivery_internal_transfer_item", purgedIn: DELIVERY, referencedBy: [] },
  {
    table: "delivery.delivery_internal_transfer_manifest_line",
    purgedIn: DELIVERY,
    referencedBy: [],
  },
  { table: "delivery.day_change", purgedIn: DELIVERY, referencedBy: [] },
  {
    table: "delivery.delivery_day_readiness",
    purgedIn: DELIVERY,
    referencedBy: ["delivery.delivery_day_readiness_shipment"],
  },
  { table: "delivery.delivery_day_readiness_shipment", purgedIn: DELIVERY, referencedBy: [] },

  {
    table: "platform.outbox",
    purgedIn: "outbox.purge.ts",
    referencedBy: ["platform.outbox_delivery"],
  },
  { table: "platform.outbox_delivery", purgedIn: "outbox.purge.ts", referencedBy: [] },
  { table: "ops.mail_send", purgedIn: "journals.purge.ts", referencedBy: [] },
  { table: "growth.activity_events", purgedIn: "journals.purge.ts", referencedBy: [] },
];

/** Ce que la purge laisse exprès, malgré une clé bloquante vers une table purgée. */
export const SCENARIO_PURGE_EXEMPTIONS: readonly PurgeExemption[] = [
  {
    table: "public.card_invoice_outcome",
    references: "public.orders",
    reason:
      "Trace de facturation d'un règlement par carte : elle ne s'efface pas avec la démo. " +
      "Une commande qui en porte une fait échouer la remise à l'état de base, et c'est voulu — " +
      "mieux vaut un refus nommé qu'une facture sans trace.",
  },
];
