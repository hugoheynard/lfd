import { z } from "zod";

import { companyMemberRoleSchema, type CompanyMemberRole } from "./company-member.js";

/**
 * **Les actions d'un sous-compte dont son principal peut être prévenu**
 * (`documentation/comptes-client/plan-notifications-sous-comptes.md`, §1).
 *
 * Ce sont des VALEURS de donnée — l'enum Postgres `SubAccountNoticeKind` les
 * porte : elles ne se renomment qu'en migration.
 */
export const subAccountNoticeKindSchema = z.enum([
  "order_placed",
  "order_cancelled",
  "payment_failed",
  "subscription_changed",
  "delivery_address_changed",
  "contact_changed",
  "bank_account_changed",
  "order_problem_reported",
]);
export type SubAccountNoticeKind = z.infer<typeof subAccountNoticeKindSchema>;

/**
 * **Les actions dont le mail EXISTE** — celles que l'écran du staff montre
 * (plan des avis au principal, N3 et N4). Les autres restent cachées : une
 * ligne réglable sans mail derrière laisserait croire que le principal sera
 * prévenu. Un lot de N4 bâti y ajoute sa clé, et rien d'autre ne change.
 */
export const SUB_ACCOUNT_NOTICE_KINDS_WITH_MAIL: readonly SubAccountNoticeKind[] = [
  "order_placed",
  "order_cancelled",
  "payment_failed",
  "delivery_address_changed",
  "contact_changed",
  "order_problem_reported",
];

/**
 * Une **cellule** du tableau action × rôle d'un principal, telle que le
 * serveur l'a résolue : `atDefault` dit si le staff y a dérogé. Le front ne
 * recompose jamais `dérogation ?? défaut`.
 */
export interface SubAccountNoticeRuleView {
  readonly kind: SubAccountNoticeKind;
  readonly role: CompanyMemberRole;
  readonly enabled: boolean;
  readonly atDefault: boolean;
}

/** Régler UNE cellule du tableau (`PUT /admin/companies/:id/sub-account-notices`). */
export const setSubAccountNoticeRulePayloadSchema = z.object({
  kind: subAccountNoticeKindSchema,
  role: companyMemberRoleSchema,
  enabled: z.boolean(),
});
export type SetSubAccountNoticeRulePayload = z.infer<typeof setSubAccountNoticeRulePayloadSchema>;
