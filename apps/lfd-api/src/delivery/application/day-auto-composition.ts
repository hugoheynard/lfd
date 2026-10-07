import type { ApplyDeliveryProposalPayload, DeliveryRoundProposalView } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { DayComposer } from "./day-composer.js";
import { ApplyDeliveryProposalCommand } from "./commands/apply-delivery-proposal.command.js";
import { ApplyDeliveryProposalHandler } from "./commands/apply-delivery-proposal.handler.js";
import { GetDeliveryRoundProposalQuery } from "./queries/get-delivery-round-proposal.query.js";
import { GetDeliveryRoundProposalHandler } from "./queries/get-delivery-round-proposal.handler.js";

/**
 * **Composer un jour tout seul, à l'arrêt du plan** (Hugo, 2026-10-07 :
 * « proposer des tournées devrait être automatique à la clôture » ; option a,
 * le calcul compose et enregistre, le bureau corrige ensuite).
 *
 * C'est exactement « Proposer » puis « Appliquer » du bureau, sans écran : la
 * même lecture (`GetDeliveryRoundProposalHandler`, mode réglé par défaut,
 * tous les véhicules du jour), la même écriture tout ou rien
 * (`ApplyDeliveryProposalHandler`), sous les versions que la proposition a
 * lues. Un geste du bureau passé entre les deux fait refuser l'application :
 * rien n'est écrasé, et l'écran Tournées propose toujours à la main.
 *
 * Remplace la règle « Appliquer est toujours un clic » (`composition-
 * automatique.md`, §9) pour ce seul moment. Appelé hors transaction, après
 * que les arrêts du jour ont été situés (`DeliveryStopsLocating`).
 */
@Injectable()
export class DayAutoComposition extends DayComposer {
  private readonly logger = new Logger(DayAutoComposition.name);

  constructor(
    private readonly proposals: GetDeliveryRoundProposalHandler,
    private readonly apply: ApplyDeliveryProposalHandler,
  ) {
    super();
  }

  /** Rend le nombre de tournées appliquées ; 0 quand il n'y avait rien à placer. */
  async composeDay(day: string): Promise<number> {
    const view = await this.proposals.execute(
      new GetDeliveryRoundProposalQuery(day, null, false, null),
    );
    const payload = applyPayloadOf(view);
    if (payload === null) {
      return 0;
    }
    await this.apply.execute(new ApplyDeliveryProposalCommand(payload));
    this.logger.log(
      `Tournées du ${day} composées à l'arrêt du plan : ${String(payload.rounds.length)}.`,
    );
    return payload.rounds.length;
  }
}

/**
 * La proposition telle que l'écran l'appliquerait : ses tournées dans leur
 * ordre, et les versions de toutes celles du jour. `null` sans tournée : le
 * contrat d'application en exige une au moins.
 */
export function applyPayloadOf(
  view: DeliveryRoundProposalView,
): ApplyDeliveryProposalPayload | null {
  if (view.rounds.length === 0) {
    return null;
  }
  return {
    day: view.day,
    rounds: view.rounds.map((round) => ({
      roundId: round.roundId,
      vehicleId: round.vehicleId,
      orderIds: round.stops.map((stop) => stop.orderId),
    })),
    versions: view.versions.map(({ roundId, version }) => ({ roundId, version })),
  };
}
