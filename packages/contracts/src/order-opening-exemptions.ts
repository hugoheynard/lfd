import { z } from "zod";

/**
 * **Les exemptions à la fermeture de la boutique** (décision de Hugo du
 * 2026-10-26). Doc : `documentation/commandes/passation/ouverture-de-la-boutique.md`.
 *
 * Une exemption laisse commander malgré la fermeture de SA clientèle. Elle
 * vise une **société** — choisie parmi les sociétés existantes — ou une
 * **adresse e-mail** : une personne connectée, ou une commande sans compte
 * passée avec cette adresse. Elle ne fait rien quand la boutique est ouverte.
 */
export const ORDER_OPENING_EXEMPTION_KINDS = ["company", "email"] as const;
export type OrderOpeningExemptionKind = (typeof ORDER_OPENING_EXEMPTION_KINDS)[number];

/**
 * Ce qu'il faut pour accorder une exemption. La forme seulement : l'adresse
 * est normalisée et contrôlée par le domaine, la société cherchée en base.
 */
export const orderOpeningExemptionPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("company"), companyId: z.string().trim().min(1, "société requise") }),
  z.object({
    kind: z.literal("email"),
    email: z.string().trim().min(1, "adresse requise").max(320),
  }),
]);
export type OrderOpeningExemptionPayload = z.infer<typeof orderOpeningExemptionPayloadSchema>;

/** Une exemption active, telle que l'écran la liste. */
export interface OrderOpeningExemptionView {
  readonly id: string;
  readonly kind: OrderOpeningExemptionKind;
  /** La société visée ; `null` pour une adresse. */
  readonly companyId: string | null;
  /** Le nom de la société figé à l'ajout, ou l'adresse normalisée. */
  readonly label: string;
  readonly grantedAt: string;
  /** Le nom de qui l'a accordée, figé au geste ; `null` si l'annuaire ne le nommait pas. */
  readonly grantedBy: string | null;
}

/** Codes des refus propres aux exemptions. */
export const ORDER_OPENING_EXEMPTION_ERRORS = {
  companyNotFound: "order_opening.exemption_company_not_found",
  companyTerminated: "order_opening.exemption_company_terminated",
  alreadyExempt: "order_opening.already_exempt",
  notFound: "order_opening.exemption_not_found",
} as const;
