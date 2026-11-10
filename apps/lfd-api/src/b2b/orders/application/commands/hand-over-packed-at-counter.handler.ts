import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CounterHandoverDesk } from "../../../../handover/channels/commerce/index.js";
import { ShortfallFreezeDesk } from "../../../../packing/channels/commerce/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { FIRST_SHIPMENT_RANK } from "../../../../production/channels/commerce/index.js";
import { OrderShortfall } from "../../domain/entities/order-shortfall.js";
import { ShortfallDecision } from "../../domain/entities/shortfall-decision.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { ShortfallDecisionRepository } from "../../domain/ports/shortfall-decision.repository.js";
import { ShortfallDeparture } from "../services/shortfall-departure.js";
import { HandOverPackedAtCounterCommand } from "./hand-over-packed-at-counter.command.js";

/**
 * **Le départ incomplet décidé au comptoir** (plan
 * `documentation/commandes/reliquat/depart-incomplet.md`, §4.2,
 * piste C — Hugo, 2026-11-03, après `vitruve`).
 *
 * UNE transaction, les verrous dans l'ordre établi — commande, puis fiche :
 *
 * 1. la commande verrouillée (`lockSubject`, rang 1) ;
 * 2. le retrait juge AVANT toute écriture (`CounterHandoverDesk.vet`) : la
 *    garde du comptoir (retrait du jour), puis la règle de remise — réglée,
 *    retenue, annulée, déjà retirée, QR d'une autre commande ; puis les refus de la décision qui ne
 *    dépendent pas du bac (carte, bon, pas confirmée, termes non figés) ;
 * 3. le colisage fige le bac sous le verrou de la fiche, SANS publier
 *    (`ShortfallFreezeDesk`) — pas tiré, rien ne manque, contenants… ;
 * 4. le commerce écrit le signal, puis la décision, et le BL-1 se réécrit
 *    (`ShortfallDeparture`, le chemin d'E6b) — rien au bac est refusé ici ;
 * 5. le retrait remet (`CounterHandoverDesk.handOver`) : `scan` avec le
 *    jeton de la commande, `manual` sans (Hugo, 2026-11-03).
 *
 * Un refus à n'importe quelle étape annule tout. Un « Il manque » pressé au
 * poste juste avant a laissé un signal en vigueur : celui du comptoir, plus
 * récent, le remplace, et son fait en vol arrivera sur une décision prise —
 * sans effet (`OrderShortfall.report`).
 *
 * Le sort du reste est un paramètre (§4.3) : `abandoned` seul aujourd'hui.
 */
@CommandHandler(HandOverPackedAtCounterCommand)
export class HandOverPackedAtCounterHandler implements ICommandHandler<
  HandOverPackedAtCounterCommand,
  void
> {
  constructor(
    private readonly decisions: ShortfallDecisionRepository,
    private readonly counter: CounterHandoverDesk,
    private readonly bins: ShortfallFreezeDesk,
    private readonly departure: ShortfallDeparture,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: HandOverPackedAtCounterCommand): Promise<void> {
    const { orderId, staffUserId, remainder, token } = command;
    await this.uow.run(async () => {
      const locked = await this.decisions.lockSubject(orderId, FIRST_SHIPMENT_RANK);
      if (locked === null) {
        throw new OrderNotFoundError(orderId);
      }
      await this.counter.vet(orderId, staffUserId, token);
      ShortfallDecision.assertDecidable(locked.subject);
      const lines = await this.bins.freeze(orderId, FIRST_SHIPMENT_RANK);
      const shortfall = OrderShortfall.fromSnapshot(locked.shortfall);
      shortfall.reportForDecision(this.clock.now(), lines);
      await this.departure.decide(locked, shortfall, { staffUserId, remainder });
      await this.counter.handOver(orderId, staffUserId, token);
    });
  }
}
