import { z } from "zod";

import type { CustomerOrderView } from "./order.js";

/**
 * **« Mes commandes » d'une société, sites compris** — `GET
 * /companies/:companyId/orders?site=…` (plan
 * `documentation/comptes-client/plan-commandes-des-sites.md`, lot C1,
 * 2026-10-21).
 *
 * `site` filtre sur UNE société : le principal lui-même ou l'un de ses sites
 * ACTUELS. Un id hors de ce périmètre rend une liste vide, jamais l'erreur qui
 * dirait qu'il existe.
 */
export const companyOrdersQuerySchema = z.object({
  site: z.string().min(1).optional(),
});
export type CompanyOrdersQuery = z.infer<typeof companyOrdersQuerySchema>;

/** Le site d'une commande, quand ce n'est pas la société listée elle-même. */
export interface CompanyOrderSiteView {
  readonly companyId: string;
  /** Son enseigne (sa raison sociale à défaut), lue à la requête. */
  readonly name: string;
}

/**
 * Qui a passé la commande (§7.6) — un fait figé, `placed_by_user_id`, et non
 * une déduction sur des rattachements qui changent. `team` : saisie par
 * l'équipe.
 */
export type CompanyOrderAuthorView =
  { readonly kind: "team" } | { readonly kind: "customer"; readonly name: string };

/**
 * Une ligne de la liste : la commande telle que le client la voit, plus son
 * site et son auteur. ADDITIF sur `CustomerOrderView` : un écran qui ne lit
 * que la commande continue de fonctionner.
 */
export interface CompanyOrderListItemView extends CustomerOrderView {
  /** `null` : la commande est celle de la société listée. */
  readonly site: CompanyOrderSiteView | null;
  readonly author: CompanyOrderAuthorView;
}
