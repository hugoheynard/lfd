import type { OrderHandoverView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import {
  HandoverSubjectReader,
  type HandoverSubject,
} from "../../channels/commerce/handover-subject.reader.js";
import { HandoverReferenceNotFoundError } from "../../domain/errors/handover-errors.js";
import { remainderReferenceOf } from "../../domain/services/handover-shipments.js";
import { HandoverAttestation } from "../services/handover-attestation.service.js";
import { HandoverCounterView } from "../services/handover-counter-view.js";
import { ConfirmManualHandoverCommand } from "./confirm-manual-handover.command.js";

/**
 * **Le retrait saisi à la main** — le chemin de secours, et la raison pour
 * laquelle la règle de l'autoscan tient.
 *
 * ## Pourquoi il existe
 *
 * Le code de retrait voyage dans le courriel du destinataire, et jamais sur un
 * papier : le bon d'une livraison est dans le carton, où un coursier scannerait
 * son propre colis. Mais le destinataire n'a pas toujours son courriel — un
 * magasinier, quelqu'un d'autre à l'accueil, un téléphone déchargé.
 *
 * Sans porte de secours, ce jour-là quelqu'un demande d'imprimer le code « juste
 * pour les livraisons difficiles ». La règle saute par la porte de service. Elle
 * ne tient que parce que **le cas difficile a déjà sa réponse**.
 *
 * ## Ce qui le distingue du scan
 *
 * Un seul mot : il grave `manual`. Un retrait saisi n'a eu qu'**une** partie ;
 * le présenter comme un scan le rendrait **faux** plutôt que faible.
 */
@CommandHandler(ConfirmManualHandoverCommand)
export class ConfirmManualHandoverHandler implements ICommandHandler<
  ConfirmManualHandoverCommand,
  OrderHandoverView
> {
  constructor(
    private readonly subjects: HandoverSubjectReader,
    private readonly attestation: HandoverAttestation,
    private readonly counter: HandoverCounterView,
  ) {}

  async execute(command: ConfirmManualHandoverCommand): Promise<OrderHandoverView> {
    const { subject, rank } = await this.resolve(command.reference);
    const ranks = await this.counter.ranksToHandOver(subject, command.ranks, rank);
    await this.attestation.attest(subject, ranks, command.staffUserId, "manual");
    return this.counter.viewOf(subject, ranks[0] ?? null);
  }

  /**
   * Le numéro d'une commande d'abord, puis celui d'un reste (`ORD-…-2`, plan
   * E7 reliquat, L4c) : la commande `ORD-…`, et le rang que le numéro nomme.
   */
  private async resolve(
    reference: string,
  ): Promise<{ readonly subject: HandoverSubject; readonly rank: number | null }> {
    const order = await this.subjects.byReference(reference);
    if (order !== null) {
      return { subject: order, rank: null };
    }
    const remainder = remainderReferenceOf(reference);
    const subject =
      remainder === null ? null : await this.subjects.byReference(remainder.orderNumber);
    if (subject === null || remainder === null) {
      throw new HandoverReferenceNotFoundError(reference);
    }
    return { subject, rank: remainder.rank };
  }
}
