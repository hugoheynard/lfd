import type { CockpitHandoverSplitView, CockpitHandoversView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { HandoverQueueReader, type HandoverQueueEntry } from "../../channels/commerce/index.js";
import {
  HandoverAttestationsReader,
  type AttestedHandover,
} from "../../domain/ports/handover-attestations.reader.js";
import { queueStateOf, showsInQueue } from "../../domain/services/queue-state.js";
import { GetCockpitHandoversQuery } from "./get-cockpit-handovers.query.js";

/**
 * **Les remises du jour, en chiffres** — ce que le cockpit commercial affiche,
 * et rien de plus (une route par usage, décidé par Hugo le 2026-11-13).
 *
 * Il compte les MÊMES lignes que la file de la Supervision, par les mêmes
 * règles (`showsInQueue`, `queueStateOf`) : un compteur qui divergerait de
 * l'écran qu'il résume ferait douter des deux. Deux lectures en lot — la file
 * du commerce, les attestations du retrait — et aucune tournée, aucune
 * retenue, aucun transfert : ils ne changent aucun chiffre.
 *
 * 🔴 **Les annulées sont exclues.** La file les rend pour qu'on puisse dire
 * au client pourquoi on ne lui donne rien ; ce n'est pas une remise à faire.
 */
@QueryHandler(GetCockpitHandoversQuery)
export class GetCockpitHandoversHandler implements IQueryHandler<
  GetCockpitHandoversQuery,
  CockpitHandoversView
> {
  constructor(
    private readonly queue: HandoverQueueReader,
    private readonly attestations: HandoverAttestationsReader,
  ) {}

  async execute(query: GetCockpitHandoversQuery): Promise<CockpitHandoversView> {
    const expected = await this.queue.expectedOn(query.day);
    const attested = await this.attestations.forOrders(expected.map((entry) => entry.orderId));
    const live = expected.filter((entry) => {
      const attestation = attested.get(entry.orderId);
      return showsInQueue(entry, attestation) && queueStateOf(entry, attestation) !== "cancelled";
    });
    return {
      day: query.day,
      pickup: splitOf(
        live.filter((entry) => entry.fulfillmentMethod !== "delivery"),
        attested,
      ),
      delivery: splitOf(
        live.filter((entry) => entry.fulfillmentMethod === "delivery"),
        attested,
      ),
    };
  }
}

function splitOf(
  rows: readonly HandoverQueueEntry[],
  attested: ReadonlyMap<string, AttestedHandover>,
): CockpitHandoverSplitView {
  return {
    expected: rows.length,
    done: rows.filter((entry) => attested.has(entry.orderId)).length,
  };
}
