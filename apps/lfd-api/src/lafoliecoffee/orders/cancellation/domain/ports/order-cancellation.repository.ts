import type { CustomerCancellationReasonCode } from "@lfd/contracts";

import type { CancellationAllowance } from "../services/cancellation-allowance.js";
import type { CancellationSubject } from "./cancellation-subject.reader.js";

/**
 * Ce que l'annulation écrit, avec le statut, dans la même écriture (C3.5).
 *
 * Lot C6 : sans `customer`, c'est l'équipe (`cancelled_by_kind = staff`) ;
 * avec, un client — `cancelledBy` est alors `null` (la colonne ne porte
 * QUE des fiches staff), et le motif peut l'être.
 */
export interface CancellationRecord {
  /** L'id de la FICHE staff — jamais un `sub` ; `null` pour un client. */
  readonly cancelledBy: string | null;
  readonly reason: string | null;
  readonly cancelledAt: Date;
  readonly customer?: CustomerCancellationStamp;
}

/** L'auteur client d'une annulation, et son motif choisi (lot C6, C6.6). */
export interface CustomerCancellationStamp {
  readonly kind: "customer" | "guest";
  readonly userId: string;
  readonly reasonCode: CustomerCancellationReasonCode | null;
}

/**
 * Port d'**écriture** de l'annulation staff (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.4, C3.4 ter).
 *
 * 🔴 **Écriture nue, conditionnée en base, et c'est voulu** — comme
 * `absorbIntoPlan` et `markAbandoned` : `Order` est un agrégat de PASSATION qui
 * ne sait pas se recharger, et la règle tient entière dans le `where` (`placed`,
 * total nul, carte non encaissée, au compte — lot C5 —, ou carte payée — lot C4). La règle qui NOMME le refus est
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
   * non payée passe aussi `failed`, comme l'abandon ; une carte payée garde
   * son règlement (lot C4 : le carnet le fera passer `refunded`). Rend `true` si la ligne a
   * franchi — c'est ce `true`, et lui seul, qui rend le bon et publie le fait.
   *
   * Sous `before_packing` (plan A1, § 1 point 5), `confirmed` — inscrite au
   * plan — franchit aussi ; `ready` et au-delà, jamais.
   */
  abstract cancel(
    orderId: string,
    record: CancellationRecord,
    allowance: CancellationAllowance,
  ): Promise<boolean>;
}
