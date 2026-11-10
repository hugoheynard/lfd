import type { OrderShortfallSnapshot } from "../entities/order-shortfall.js";
import type {
  ShortfallDecision,
  ShortfallDecisionSubject,
} from "../entities/shortfall-decision.js";

/** La commande relue sous son verrou : ce que la décision juge, et le signal de l'envoi qu'elle résout. */
export interface LockedShortfallSubject {
  readonly subject: ShortfallDecisionSubject;
  /** Le client qui a passé la commande : le sujet du témoin au journal. */
  readonly placedByUserId: string;
  readonly shortfall: OrderShortfallSnapshot;
}

/**
 * Port d'**écriture** de la décision du départ incomplet (lot E6b ; par envoi
 * depuis le plan E7 reliquat, lot LB) — il prend
 * l'agrégat ; le signal résolu s'écrit par `OrderShortfallRepository`, dans la
 * même unité de travail.
 *
 * `lockSubject` pose le verrou de la COMMANDE (`SELECT … FOR UPDATE` sur
 * `orders`) : c'est le premier verrou de la décision, la fiche du colisage
 * vient après (plan § 12.2, « commande, puis fiche »).
 */
export abstract class ShortfallDecisionRepository {
  /**
   * La commande verrouillée, l'envoi `rank` relu (son manque, sa décision, le
   * statut de son BL au-delà du rang 1). `null` : commande inconnue. Dans une
   * unité de travail.
   */
  abstract lockSubject(orderId: string, rank: number): Promise<LockedShortfallSubject | null>;

  /** Écrit la décision ; l'unicité par envoi `(commande, rang)` refuse une seconde en base. */
  abstract save(decision: ShortfallDecision): Promise<void>;
}
