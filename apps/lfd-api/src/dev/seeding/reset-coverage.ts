/**
 * **Ce que « Tout recharger » retire, et ce qui le tient** — confronté au
 * catalogue Postgres par `test/dev-seed-reset-coverage.e2e-spec.ts`.
 *
 * Le rechargement (`reset.seed.ts`, `order-restricted-children.seed.ts`)
 * supprime des lignes de ces tables. Toute table qui en tient une par une clé
 * bloquante (`RESTRICT` ou `NO ACTION`) doit être retirée avant elle — et donc
 * listée ici dans `referencedBy` —, ou exemptée avec sa raison. Une migration
 * qui ajoute une telle clé fait échouer le test en nommant la table : c'est
 * ainsi que le rechargement cesse de mourir en 409 « Une ressource liée est
 * introuvable » le jour où la donnée d'essai porte enfin la ligne nouvelle.
 *
 * La même garde tient la purge du scénario (`scenario/purge/purge-coverage.ts`).
 * Elle ne vérifie pas l'ORDRE des suppressions, seulement qu'aucun enfant
 * n'est oublié : l'ordre se lit dans le code, juste au-dessus de chaque parent.
 */

import type { CoveredTable, CoverageExemption } from "../coverage-types.js";

export const RESET_COVERAGE_FILE = "apps/lfd-api/src/dev/seeding/reset-coverage.ts";

export const RESET_WIPED_TABLES: readonly CoveredTable[] = [
  { table: "growth.activity_events", referencedBy: [] },
  { table: "growth.company_terminations", referencedBy: [] },
  { table: "growth.lead_scores", referencedBy: [] },
  { table: "public.account_alert_overrides", referencedBy: [] },
  { table: "public.account_alerts", referencedBy: [] },
  { table: "public.addresses", referencedBy: ["public.delivery_procedures"] },
  { table: "public.client_notebooks", referencedBy: [] },
  {
    table: "public.companies",
    referencedBy: [
      "public.addresses",
      "public.client_notebooks",
      "public.companies",
      "public.company_chorus_routing",
      "public.company_chorus_service",
      "public.company_collection_form",
      "public.company_follows",
      "public.in_house_recap",
      "public.in_house_recap_run",
      "public.loyalty_ledger_entries",
      "public.loyalty_vouchers",
      "public.memberships",
      "public.order_cutoff_waiver",
      "public.orders",
      "public.payer_in_house",
      "public.payment_links",
      "public.payment_mandates",
      "public.principal_sites_menu",
      "public.sub_account_menu",
      "public.sub_account_notice_rules",
      "public.sub_account_notice_settings",
    ],
  },
  { table: "public.company_chorus_routing", referencedBy: [] },
  { table: "public.company_chorus_service", referencedBy: [] },
  { table: "public.company_collection_form", referencedBy: [] },
  { table: "public.company_follows", referencedBy: [] },
  {
    table: "public.delivery_note",
    referencedBy: [
      "public.delivery_note_discounts",
      "public.delivery_note_line",
      "public.delivery_note_version",
      "public.in_house_recap_note",
    ],
  },
  { table: "public.delivery_note_discounts", referencedBy: [] },
  { table: "public.delivery_note_line", referencedBy: [] },
  { table: "public.delivery_note_version", referencedBy: [] },
  { table: "public.delivery_procedures", referencedBy: [] },
  { table: "public.delivery_zones", referencedBy: [] },
  {
    table: "public.in_house_recap",
    referencedBy: [
      "public.in_house_recap",
      "public.in_house_recap_line",
      "public.in_house_recap_note",
    ],
  },
  { table: "public.in_house_recap_line", referencedBy: [] },
  { table: "public.in_house_recap_note", referencedBy: [] },
  { table: "public.in_house_recap_run", referencedBy: [] },
  { table: "public.loyalty_ledger_entries", referencedBy: [] },
  {
    table: "public.loyalty_vouchers",
    referencedBy: ["public.loyalty_ledger_entries", "public.loyalty_vouchers", "public.orders"],
  },
  { table: "public.memberships", referencedBy: [] },
  { table: "public.order_cutoff_waiver", referencedBy: [] },
  {
    table: "public.order_discounts",
    referencedBy: ["public.delivery_note_discounts", "public.order_line_discounts"],
  },
  { table: "public.order_drafts", referencedBy: [] },
  { table: "public.order_line_discounts", referencedBy: [] },
  { table: "public.order_revision", referencedBy: [] },
  { table: "public.order_revision_proposal", referencedBy: [] },
  { table: "public.order_shortfall", referencedBy: ["public.order_shortfall_decision"] },
  { table: "public.order_shortfall_decision", referencedBy: [] },
  { table: "public.backorder", referencedBy: [] },
  {
    table: "public.orders",
    referencedBy: [
      "public.backorder",
      "public.delivery_note",
      "public.order_discounts",
      "public.order_item_limit_overrides",
      "public.order_reviews",
      "public.order_revision",
      "public.order_revision_proposal",
      "public.order_shortfall",
      "public.order_shortfall_decision",
    ],
  },
  { table: "public.order_item_limit_overrides", referencedBy: [] },
  { table: "public.order_reviews", referencedBy: [] },
  { table: "public.payer_in_house", referencedBy: [] },
  { table: "public.payment_links", referencedBy: [] },
  { table: "public.payment_mandates", referencedBy: [] },
  {
    table: "public.pickup_addresses",
    referencedBy: ["public.pickup_discount_rules", "public.site_table"],
  },
  { table: "public.pickup_discount_rules", referencedBy: [] },
  { table: "public.price_rules", referencedBy: [] },
  { table: "public.pricing_events", referencedBy: [] },
  { table: "public.principal_sites_menu", referencedBy: ["public.principal_sites_menu_entry"] },
  { table: "public.principal_sites_menu_entry", referencedBy: [] },
  { table: "public.site_table", referencedBy: [] },
  { table: "public.sub_account_menu", referencedBy: ["public.sub_account_menu_entry"] },
  { table: "public.sub_account_menu_entry", referencedBy: [] },
  { table: "public.sub_account_notice_rules", referencedBy: [] },
  { table: "public.sub_account_notice_settings", referencedBy: [] },
  // Les paniers récurrents : identifiants opaques, aucune clé ne sort du
  // schéma ; échéances et lignes tiennent le panier en `RESTRICT`.
  { table: "recurring.basket", referencedBy: ["recurring.basket_line", "recurring.occurrence"] },
  { table: "recurring.basket_line", referencedBy: [] },
  { table: "recurring.occurrence", referencedBy: [] },
  { table: "public.support_requests", referencedBy: [] },
  {
    table: "public.users",
    referencedBy: [
      "public.loyalty_ledger_entries",
      "public.loyalty_vouchers",
      "public.orders",
      "public.support_requests",
    ],
  },
  { table: "public.volume_commitments", referencedBy: [] },
  { table: "public.volume_ladders", referencedBy: [] },
];

/** Ce que le rechargement laisse exprès, malgré une clé bloquante vers une table qu'il touche. */
export const RESET_EXEMPTIONS: readonly CoverageExemption[] = [
  {
    table: "public.card_invoice_outcome",
    references: "public.orders",
    reason:
      "Trace de facturation d'un règlement par carte : elle ne s'efface pas avec la démo, " +
      "comme dans la purge du scénario. Une commande qui en porte une fait échouer le " +
      "rechargement, et c'est voulu.",
  },
  {
    table: "public.promotion_delivery_zones",
    references: "public.delivery_zones",
    reason:
      "Une zone ciblée par une promotion n'est pas retirée (`promotionTargets: { none: {} }`).",
  },
  {
    table: "public.promotion_pickup_points",
    references: "public.pickup_addresses",
    reason: "Un point ciblé par une promotion n'est pas retiré (`promotionPoints: { none: {} }`).",
  },
];
