import { Injectable } from "@nestjs/common";

import { StaffAuthorDirectory } from "../../staff/directory/domain/staff-author-directory.js";
import { DeliveryOrdersReader } from "../channels/commerce/index.js";
import type { DeliveryRound } from "../domain/entities/delivery-round.js";
import type { DoorstepRoundKey } from "../domain/entities/doorstep-stop.js";
import type {
  DecidedStop,
  DecisionAuthor,
  StopDecision,
} from "../domain/entities/stop-decision.js";
import { StopDecisionNotFoundError } from "../domain/errors/delivery-decision-errors.js";
import type { CitedOrder } from "../domain/events/delivery-round.events.js";
import { citeStopOrder, roundKeyOf } from "../domain/events/delivery-doorstep.events.js";
import { DeliveryRoundRepository } from "../domain/ports/delivery-round.repository.js";
import { StopDecisionRepository } from "../domain/ports/stop-decision.repository.js";
import { deliveryAuthorOf } from "./delivery-author.js";

/** Tout ce qu'une réponse du commercial lit, sous le verrou de la tournée. */
export interface DecisionAtDesk {
  readonly decision: StopDecision;
  readonly round: DeliveryRound;
  readonly roundKey: DoorstepRoundKey;
  readonly stop: DecidedStop;
  readonly order: CitedOrder;
  readonly author: DecisionAuthor;
}

/**
 * **Le bureau du commercial** (`a-la-porte.md`, B3, § 10 bis) — la
 * lecture commune à « Autoriser le dépôt » et « Rapporter », DANS l'unité de
 * travail du handler :
 *
 * 1. la décision, pour connaître sa tournée ;
 * 2. la tournée VERROUILLÉE (`loadForDecision`) — le verrou que le dépôt du
 *    livreur prend aussi : décider et déposer ne se croisent pas ;
 * 3. la décision RELUE sous ce verrou : une autre réponse passée entre (1) et
 *    (2) est vue, et la dernière l'emporte ;
 * 4. l'arrêt (clos ? tournée rentrée ?), le numéro de la commande lu au
 *    commerce, et l'auteur figé.
 *
 * @throws {StopDecisionNotFoundError}
 */
@Injectable()
export class StopDecisionDesk {
  constructor(
    private readonly decisions: StopDecisionRepository,
    private readonly rounds: DeliveryRoundRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly directory: StaffAuthorDirectory,
  ) {}

  async open(stopId: string, staffUserId: string): Promise<DecisionAtDesk> {
    const first = await this.decisions.load(stopId);
    const round = first === null ? null : await this.rounds.loadForDecision(first.roundId);
    const decision = round === null ? null : await this.decisions.load(stopId);
    if (round === null || decision === null) {
      throw new StopDecisionNotFoundError();
    }
    const [facts, author] = await Promise.all([
      this.orders.byIds([decision.orderId]),
      deliveryAuthorOf(this.directory, staffUserId),
    ]);
    const reference = facts[0]?.reference ?? "";
    return {
      decision,
      round,
      roundKey: roundKeyOf(round),
      stop: {
        label: reference === "" ? decision.orderId : reference,
        closed: round.hasClosed(stopId),
        returned: round.returnedAt !== null,
      },
      order: citeStopOrder(decision.orderId, reference),
      author: { staffUserId: author.staffUserId, name: author.name },
    };
  }

  /** Écrit la décision ; refuse si elle a changé depuis la lecture. */
  async save(desk: DecisionAtDesk): Promise<void> {
    await this.decisions.save(desk.decision, desk.stop.label);
  }
}
