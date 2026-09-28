import type { HandoverQueueEntryView, HandoverQueueState, HandoverQueueView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { HandoverQueueReader, type HandoverQueueEntry } from "../../channels/commerce/index.js";
import {
  HandoverAttestationsReader,
  type AttestedHandover,
} from "../../domain/ports/handover-attestations.reader.js";
import { QualityHoldsReader } from "../../../production/channels/handover/index.js";
import { GetHandoverQueueQuery } from "./get-handover-queue.query.js";

/**
 * **La file du comptoir** — ce que le commerce attend ce jour-là, croisé avec ce
 * que le retrait a déjà attesté.
 *
 * ## Deux lectures, deux propriétaires, et c'est tout le dossier
 *
 * Ce que le client a commandé appartient au **commerce** : on le lui demande,
 * on ne le recopie pas. Ce qui a été remis appartient au **retrait** : il le
 * lit chez lui, et ne le redemande à personne.
 *
 * 🔴 C'est le seul endroit du contexte où les deux se rencontrent, et il fallait
 * que ce soit un handler plutôt qu'un port : fusionner les deux lectures dans un
 * adaptateur aurait obligé le commerce à connaître les attestations, ou le
 * retrait à joindre `orders` — c'est-à-dire à franchir la frontière que tout ce
 * chantier vient de poser.
 *
 * ## Trois questions, jamais N + 1
 *
 * Une pour la file, une pour les attestations du lot, une pour les retenues
 * qualité du lot (`QualityHoldsReader`, publié par la production —
 * `plan-controle-qualite.md`, D4). Demander ligne par ligne ferait autant
 * d'allers-retours que de commandes pour peindre un écran.
 */
@QueryHandler(GetHandoverQueueQuery)
export class GetHandoverQueueHandler implements IQueryHandler<
  GetHandoverQueueQuery,
  HandoverQueueView
> {
  constructor(
    private readonly queue: HandoverQueueReader,
    private readonly attestations: HandoverAttestationsReader,
    private readonly holds: QualityHoldsReader,
  ) {}

  async execute(query: GetHandoverQueueQuery): Promise<HandoverQueueView> {
    const expected = await this.queue.expectedOn(query.day);
    const orderIds = expected.map((entry) => entry.orderId);
    const [attested, held] = await Promise.all([
      this.attestations.forOrders(orderIds),
      this.holds.heldOrders(query.day, orderIds),
    ]);
    return {
      day: query.day,
      entries: expected.map((entry) =>
        toEntryView(entry, attested.get(entry.orderId), held.has(entry.orderId)),
      ),
    };
  }
}

/** Une ligne de file, dans le vocabulaire de l'écran. */
function toEntryView(
  entry: HandoverQueueEntry,
  attestation: AttestedHandover | undefined,
  held: boolean,
): HandoverQueueEntryView {
  const state = stateOf(entry, attestation);
  return {
    orderId: entry.orderId,
    reference: entry.reference,
    customerLabel: entry.customerLabel,
    tradeName: entry.tradeName,
    clientele: entry.clientele,
    pickupLabel: entry.pickupLabel,
    fulfillmentMethod: entry.fulfillmentMethod,
    window: entry.window,
    totalUnits: entry.totalUnits,
    placedAt: entry.placedAt.toISOString(),
    state,
    // L'ordre de `handoverBlocker` (D4) : une commande retirée ou annulée dit
    // cela d'abord, jamais « en vérification » — la production peut retenir
    // un sac déjà parti sans le savoir.
    heldForQuality: held && (state === "ready" || state === "expected"),
    handedOverAt: attestation === undefined ? null : attestation.handedOverAt.toISOString(),
    handedOverVia: attestation?.via ?? null,
    readyAt: entry.readyAt === null ? null : entry.readyAt.toISOString(),
  };
}

/**
 * **L'état tel que le comptoir le lit**, et non le statut brut du commerce.
 *
 * L'ordre des tests est la règle métier, pas une commodité :
 *
 * 1. 🔴 **`handed_over` gagne sur tout**, y compris sur une annulation. Une
 *    commande retirée est retirée — le sac est parti. Laisser une annulation
 *    postérieure repeindre la ligne ferait mentir l'écran sur un fait physique,
 *    et c'est exactement le jour où on a besoin de le relire.
 * 2. `cancelled` ensuite : rien ne partira, et il faut pouvoir le dire à
 *    quelqu'un qui se présente.
 * 3. `ready` quand le fournil l'a déclarée prête.
 * 4. `expected` sinon — y compris pour une commande jamais colisée, qui reste
 *    remettable (`handoverBlocker` est volontairement permissif).
 */
function stateOf(
  entry: HandoverQueueEntry,
  attestation: AttestedHandover | undefined,
): HandoverQueueState {
  if (attestation !== undefined) {
    return "handed_over";
  }
  if (entry.status === "cancelled") {
    return "cancelled";
  }
  return entry.readyAt === null ? "expected" : "ready";
}
