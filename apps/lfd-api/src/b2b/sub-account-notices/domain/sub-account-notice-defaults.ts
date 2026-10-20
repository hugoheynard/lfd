import type { SubAccountNoticeKind } from "@lfd/contracts";

import type { CompanyRole } from "../../account/domain/value-objects/company-role.js";

/** Les rôles d'une société, dans l'ordre des colonnes du tableau (§1). */
export const NOTICE_ROLES: readonly CompanyRole[] = ["owner", "admin", "orders", "billing"];

/**
 * **Le tableau par défaut** des avis au principal
 * (`plan-notifications-sous-comptes.md`, §1) : pour chaque action d'un
 * sous-compte, les rôles du PRINCIPAL qui en sont prévenus.
 *
 * Il vit ici et pas en base : changer le défaut ne demande pas de migration,
 * et une dérogation posée par le staff reste sa volonté. Un `Record` sur la
 * clé : une action ajoutée à l'enum sans sa ligne ne compile pas.
 */
export const SUB_ACCOUNT_NOTICE_DEFAULTS: Readonly<
  Record<SubAccountNoticeKind, readonly CompanyRole[]>
> = {
  order_placed: ["owner", "admin", "orders"],
  order_cancelled: ["owner", "admin", "orders"],
  // À la charge du principal : c'est lui qui paie, d'où `billing`.
  payment_failed: ["owner", "billing"],
  subscription_changed: ["owner", "admin", "orders"],
  delivery_address_changed: ["owner", "admin"],
  contact_changed: ["owner", "admin"],
  bank_account_changed: ["owner", "billing"],
  order_problem_reported: ["owner", "admin", "orders"],
};

/** Les actions, dans l'ordre des lignes du tableau (§1). */
export const NOTICE_KINDS: readonly SubAccountNoticeKind[] = [
  "order_placed",
  "order_cancelled",
  "payment_failed",
  "subscription_changed",
  "delivery_address_changed",
  "contact_changed",
  "bank_account_changed",
  "order_problem_reported",
];
