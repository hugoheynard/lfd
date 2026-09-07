import type { OrderHandoverView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { HandoverSubjectReader } from "../../channels/commerce/handover-subject.reader.js";
import { HandoverReferenceNotFoundError } from "../../domain/errors/production-errors.js";
import { HandoverAttestation } from "../services/handover-attestation.service.js";
import { ConfirmManualHandoverCommand } from "./confirm-manual-handover.command.js";

/**
 * **La remise saisie à la main** — le chemin de secours, et la raison pour
 * laquelle la règle de l'autoscan tient.
 *
 * ## Pourquoi elle existe
 *
 * Le code de remise voyage dans le courriel du destinataire, et jamais sur un
 * papier : le bon d'une livraison est dans le carton, où un coursier scannerait
 * son propre colis. Mais le destinataire n'a pas toujours son courriel — un
 * magasinier, quelqu'un d'autre à l'accueil, un téléphone déchargé.
 *
 * Sans porte de secours, ce jour-là quelqu'un demande d'imprimer le code « juste
 * pour les livraisons difficiles ». La règle saute par la porte de service. Elle
 * ne tient que parce que **le cas difficile a déjà sa réponse**.
 *
 * ## Ce qui la distingue du scan
 *
 * Un seul mot : elle grave `manual`. Une remise saisie n'a eu qu'**une** partie ;
 * la présenter comme un scan la rendrait **fausse** plutôt que faible.
 */
@CommandHandler(ConfirmManualHandoverCommand)
export class ConfirmManualHandoverHandler implements ICommandHandler<
  ConfirmManualHandoverCommand,
  OrderHandoverView
> {
  constructor(
    private readonly subjects: HandoverSubjectReader,
    private readonly attestation: HandoverAttestation,
  ) {}

  async execute(command: ConfirmManualHandoverCommand): Promise<OrderHandoverView> {
    const subject = await this.subjects.byReference(command.reference);
    if (subject === null) {
      throw new HandoverReferenceNotFoundError(command.reference);
    }
    return this.attestation.attest(subject, command.staffSubject, "manual");
  }
}
