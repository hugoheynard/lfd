import type { OrderHandoverView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { FIRST_SHIPMENT_RANK } from "../../../production/channels/handover/index.js";
import { HandoverSubjectReader } from "../../channels/commerce/handover-subject.reader.js";
import { HandoverReferenceNotFoundError } from "../../domain/errors/handover-errors.js";
import { HandoverAttestation } from "../services/handover-attestation.service.js";
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
  ) {}

  async execute(command: ConfirmManualHandoverCommand): Promise<OrderHandoverView> {
    const subject = await this.subjects.byReference(command.reference);
    if (subject === null) {
      throw new HandoverReferenceNotFoundError(command.reference);
    }
    // Le scan et la saisie résolvent la COMMANDE, donc son rang 1 : rendre
    // les envois prêts de la commande est le lot L4c (plan E7 reliquat).
    return this.attestation.attest(subject, FIRST_SHIPMENT_RANK, command.staffUserId, "manual");
  }
}
