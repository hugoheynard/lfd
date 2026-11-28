import { z } from "zod";

import type { ActivationBlocker } from "./admin-company.js";

/**
 * **La page « Comptes du comptoir »** — `GET /admin/counter-opened-accounts`
 * (`documentation/comptes-client/plan-comptes-du-comptoir.md`, § 4), sous
 * `b2b_companies:read` : une ligne par société `counter_opened` non
 * supprimée, ce qu'elle doit, ce qui manque pour la convertir, et le total
 * du dû.
 */
export interface CounterOpenedAccountsView {
  readonly accounts: readonly CounterOpenedAccountRow[];
  /** La somme des `outstandingCents` de la page, en centimes TTC. */
  readonly totalOutstandingCents: number;
}

/** Une ligne de la page. */
export interface CounterOpenedAccountRow {
  readonly companyId: string;
  /** Référence humaine courte (`C-XXXXXX`). */
  readonly reference: string;
  readonly enseigne: string;
  readonly contact: {
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly phone: string;
  };
  /** ISO : l'ouverture au comptoir. */
  readonly openedAt: string;
  /** L'agent qui a ouvert, figé à l'ouverture ; `null` si l'annuaire ne le nommait pas. */
  readonly openedByName: string | null;
  /**
   * La case « J'ai vu une preuve d'identité » : cochée ou non, par quel agent
   * (`byName` `null` s'il n'est pas nommé), et quand. `null` : aucune trace.
   */
  readonly identityCheck: {
    readonly seen: boolean;
    readonly byStaffId: string;
    readonly byName: string | null;
    readonly at: string;
  } | null;
  /** Les commandes au compte non annulées. */
  readonly onAccountOrders: number;
  /** Le dû : ces commandes, en centimes TTC (le compte n'est jamais facturé avant conversion). */
  readonly outstandingCents: number;
  /** Ce qui manque, selon le verdict d'activation de la fiche. */
  readonly missing: readonly ActivationBlocker[];
  /** Rien ne manque : « Convertir » activera le compte directement. */
  readonly convertsToActive: boolean;
}

/**
 * **Convertir un compte ouvert au comptoir** — `POST
 * /admin/counter-opened-accounts/:companyId/convert` (§ 3.1, § 4), sous
 * `b2b_companies:write`, sans corps. `200` : le statut atteint —
 * `active` quand le verdict d'activation est vert, `pending` sinon (SIRET et
 * adresse de facturation exigés). Un refus est un `409` qui nomme la pièce.
 */
export interface CounterAccountConversionView {
  readonly status: "pending" | "active";
}

/**
 * **Le plafond des comptes ouverts au comptoir** — `GET
 * /admin/counter-account-ceiling` (§ 3.3), sous `lfc_order_settings:read`.
 * `ceilingCents` en centimes TTC, `null` = aucun plafond (le défaut).
 */
export interface CounterAccountCeilingView {
  readonly ceilingCents: number | null;
  /** ISO du dernier geste ; `null` tant que personne n'a rien réglé. */
  readonly updatedAt: string | null;
  readonly updatedByStaffId: string | null;
  /** Le nom de l'auteur dans l'annuaire, `null` s'il n'y est pas. */
  readonly updatedByName: string | null;
}

/**
 * `PUT /admin/counter-account-ceiling` (`204`), sous
 * `lfc_order_settings:write` : pose le plafond, ou `null` pour n'en avoir
 * aucun. La forme seulement ; le domaine refuse un montant négatif.
 */
export const counterAccountCeilingPayloadSchema = z.strictObject({
  ceilingCents: z.number().int().nullable(),
});
export type CounterAccountCeilingPayload = z.infer<typeof counterAccountCeilingPayloadSchema>;
