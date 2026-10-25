import type { UnrepairableReason } from "../../domain/services/delivery-note-alignment.js";
import type { DeliveryNoteTermsGap } from "../../domain/services/delivery-note-terms-control.js";
import type { BillingGap } from "../services/order-billing-closer.js";

/**
 * **Le réconciliateur des bons de livraison** (plan
 * `documentation/commandes/plan-e2-rattrapage-des-bons.md`, § 8.2) : chaque
 * commande confirmée, prête, remise ou annulée voit son BL aligné par la même
 * règle que les gestes. Déclenché toutes les heures par le Worker, et à la
 * demande par l'équipe.
 */
export class ReconcileDeliveryNotesCommand {}

/** Une page du parcours ; les commandes se lisent par identifiant croissant. */
export const RECONCILE_PAGE_SIZE = 200;

/**
 * Le plafond des réparations d'un passage : chacune est une transaction
 * courte, et un premier passage en production ne doit pas tenir une instance
 * plusieurs minutes. Le reste attend le passage suivant (`complete: false`).
 */
export const RECONCILE_REPAIR_LIMIT = 100;

/** Un écart non réparable, nommé pour qu'on le retrouve. */
export interface UnrepairedOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly reason: UnrepairableReason;
}

/** Le compte rendu d'un passage — ce qu'il a lu, écrit, et laissé. */
export interface DeliveryNoteReconciliationReport {
  /** Commandes passées en revue. */
  readonly scanned: number;
  readonly created: number;
  readonly advanced: number;
  readonly voided: number;
  /** BL à l'état juste dont l'en-tête vide a été complété depuis la commande (plan E4a). */
  readonly completed: number;
  /** Réparations tentées et échouées (erreur technique) : à relire dans le journal. */
  readonly failed: number;
  /** Écarts non réparables, comptés par cause et nommés. Rien n'a été inventé. */
  readonly unrepaired: readonly UnrepairedOrder[];
  /** `false` si le plafond de réparations a arrêté le passage avant la fin. */
  readonly complete: boolean;
  /**
   * Le contrôle des totaux (plan E4a, § 2) : les commandes complètes dont le
   * BL n'avait rien à réparer à ce passage, comparées champ par champ.
   * Zéro écart, ou la facture ne lira pas le BL (E4b).
   */
  readonly terms: {
    readonly compared: number;
    readonly gaps: readonly DeliveryNoteTermsGap[];
  };
  /**
   * Le solde (E6c1, plan E6 § 12.3) : montants facturables posés (`closed`),
   * corrigés tant que rien n'est facturé (`corrected`), et le contrôle des
   * commandes déjà soldées — la recopie pour une commande à un BL complet, la
   * somme des BL pour une partielle. Zéro écart, ou E6c2 ne bascule pas.
   */
  readonly billing: {
    readonly closed: number;
    readonly corrected: number;
    readonly compared: number;
    readonly gaps: readonly BillingGap[];
  };
}
