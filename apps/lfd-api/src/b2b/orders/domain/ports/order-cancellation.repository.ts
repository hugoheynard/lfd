import type { CancellationSubject } from "./cancellation-subject.reader.js";

/** Ce que l'annulation écrit, avec le statut, dans la même écriture (C3.5). */
export interface CancellationRecord {
  /** L'id de la FICHE staff — jamais un `sub`. */
  readonly cancelledBy: string;
  readonly reason: string;
  readonly cancelledAt: Date;
}

/**
 * Port d'**écriture** de l'annulation staff (plan
 * `documentation/order/plan-annulation-de-commande.md`, C3.4, C3.4 ter).
 *
 * 🔴 **Écriture nue, conditionnée en base, et c'est voulu** — comme
 * `absorbIntoPlan` et `markAbandoned` : `Order` est un agrégat de PASSATION qui
 * ne sait pas se recharger, et la règle tient entière dans le `where` (`placed`,
 * total nul, carte non encaissée, ou au compte — lot C5). La règle qui NOMME le refus est
 * `cancellationBlocker`, pure, relue sous le verrou par le handler.
 *
 * Les deux méthodes n'ont de sens que DANS une unité de travail : le verrou de
 * ligne est relâché à la fin de la transaction qui le prend.
 */
export abstract class OrderCancellationRepository {
  /**
   * `SELECT … FOR UPDATE` sur la ligne `orders`, puis la relit. Un second clic,
   * ou un second membre de l'équipe, attend ici le premier, puis voit
   * `cancelled`. Rend `null` si la commande n'existe pas.
   */
  abstract lock(orderId: string): Promise<CancellationSubject | null>;

  /**
   * `placed` → `cancelled`, avec l'auteur, le motif et l'instant ; une carte
   * non payée passe aussi `failed`, comme l'abandon. Rend `true` si la ligne a
   * franchi — c'est ce `true`, et lui seul, qui rend le bon et publie le fait.
   */
  abstract cancel(orderId: string, record: CancellationRecord): Promise<boolean>;
}
