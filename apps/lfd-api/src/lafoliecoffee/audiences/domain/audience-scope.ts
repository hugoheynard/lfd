/**
 * **Quelles commandes décrivent la clientèle** (lot A1,
 * `documentation/recommandation-produit/plan-audiences.md`).
 *
 * Exclues : le brouillon (personne n'a commandé) et l'annulée (rien n'a été
 * vendu) — comme les ventes de RS6 —, puis la carte en attente, refusée ou
 * remboursée : le tableau chiffre un CA, et une carte non encaissée n'en est
 * pas un (même règlement que le CA de la croissance, `growth/domain/revenue-scope.ts`,
 * relu le 2026-10-18).
 *
 * GARDÉES, à la différence de RS6 : les commandes saisies par le staff. RS6
 * les écarte parce qu'elles n'ont vu aucune suggestion ; ici on décrit qui
 * commande, et une commande prise au téléphone reste celle du client
 * (`placed_by_user_id`, `orders.prisma`). Les écarter effacerait les pros
 * qui commandent par téléphone. Leur moment est celui de la saisie.
 *
 * À PART : les commandes nées d'un abonnement (`from_subscription_id`) — leur
 * moment est celui du planificateur et leur fréquence est automatique.
 */
export const AUDIENCE_EXCLUDED_ORDER_STATUSES = ["draft", "cancelled"] as const;

/** Les règlements qui font un chiffre d'affaires : au compte, gratuit, ou encaissé. */
export const AUDIENCE_COUNTED_PAYMENT_STATUSES = ["not_required", "paid"] as const;
