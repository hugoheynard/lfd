import type { OrderHandoverLine } from "./order-handover.js";

/**
 * Le **colisage** : ce que l'atelier a sous les yeux quand il scanne le QR de la
 * fiche pour déclarer une commande prête.
 *
 * ## Ce qui le distingue de la remise, et pourquoi ça compte
 *
 * La remise se lit par un **jeton secret** ; le colisage se lit par le **numéro
 * de commande**, déjà imprimé en clair sur la même feuille. Ce n'est pas un
 * relâchement : les deux gestes n'attestent pas la même chose.
 *
 * - La **remise** est un fait à DEUX parties — l'un présente, l'autre scanne.
 *   Son code doit donc être un secret que le porteur du colis n'a pas, sans quoi
 *   un coursier scannerait son propre carton.
 * - Le **colisage** est un fait INTERNE. Il n'y a personne d'autre à
 *   représenter, donc rien à s'attribuer indûment : la porte staff suffit.
 *
 * C'est pour ça que le QR de la fiche peut s'imprimer et que celui de la remise
 * ne le peut pas. Voir `documentation/order/architecture-bon-de-commande.md`.
 */
export interface OrderPackingView {
  readonly orderId: string;
  /** Le numéro humain, `ORD-4812` — ce que le QR de la fiche encode. */
  readonly reference: string;
  /** La raison sociale, ou la personne si la commande est sans entreprise. */
  readonly customerLabel: string;
  /** Le jour de service (`AAAA-MM-JJ`), ou `null`. */
  readonly requestedFor: string | null;
  /** Somme des quantités — le chiffre qu'on recompte en fermant le bac. */
  readonly totalUnits: number;
  readonly lines: readonly OrderHandoverLine[];
  /** ISO du colisage déjà déclaré, ou `null` s'il reste à faire. */
  readonly readyAt: string | null;
  /** Qui l'a déclarée prête — l'identité staff figée (claim `sub`) —, ou `null`. */
  readonly readyBy: string | null;
  /** `null` = le colisage est possible ; sinon la raison du refus, en clair. */
  readonly blockedReason: string | null;
}
