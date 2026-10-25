import { Injectable } from "@nestjs/common";

import { OrderPackingStateReader } from "../../../../packing/channels/commerce/index.js";
import type { CancellationSubject } from "../../domain/ports/cancellation-subject.reader.js";
import {
  cancellationOf,
  type CancellationDecision,
} from "../../domain/services/order-cancellation.js";
import { CancellationAllowanceGate } from "./cancellation-allowance-gate.js";
import { CancellationRule } from "./cancellation-rule.js";

/**
 * **L'aperçu de l'annulation** — la décision que le geste prendrait, sans
 * verrou, pour l'afficher : la fiche staff (`GetAdminOrderHandler`) et
 * « Mes commandes » (`CustomerCancellability`) disent ainsi la même chose
 * (plan A1, lot A1.3).
 *
 * Ce qu'il ajoute à la règle : le bac fermé au colisage, lu par
 * {@link OrderPackingStateReader} — sans lui, une commande de retrait inscrite
 * se disait annulable jusqu'au clic, et le geste refusait `packed` sous
 * verrou. Lu seulement pour une commande inscrite : avant l'inscription, il
 * n'y a pas de feuille.
 *
 * Une indication, pas une promesse : le geste relit tout sous verrou.
 */
@Injectable()
export class CancellationPreview {
  constructor(
    private readonly rule: CancellationRule,
    private readonly allowances: CancellationAllowanceGate,
    private readonly packing: OrderPackingStateReader,
  ) {}

  async decisionOf(
    subject: CancellationSubject,
    inscribedDay: string | null,
  ): Promise<CancellationDecision> {
    const [packed, allowance] = await Promise.all([
      this.packedOf(subject.orderId, inscribedDay),
      this.allowances.of(subject),
    ]);
    return cancellationOf(await this.rule.stateOf(subject, inscribedDay, packed), allowance);
  }

  private async packedOf(orderId: string, inscribedDay: string | null): Promise<boolean> {
    if (inscribedDay === null) {
      return false;
    }
    const states = await this.packing.packedAmong([orderId]);
    return states.get(orderId) === "packed";
  }
}
