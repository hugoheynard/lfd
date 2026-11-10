import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { CardIncreaseProposalRepository } from "../../domain/ports/card-increase-proposal.repository.js";
import { OrderLock } from "../../../domain/ports/order-lock.js";
import { CardIncreaseBell } from "./card-increase-bell.js";
import { IncreaseOrderLabels } from "../../../application/services/increase-order-labels.js";

/**
 * **Un contrôle au prestataire a échoué** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.7) —
 * l'annulation au délai qui répond `unavailable`, ou la vérification d'un
 * paiement (`settleFromProvider`) qui lève. Partagé par les deux balayages.
 *
 * `provider_checks + 1` (jamais `attempts`, qui est à l'exécuteur), sous
 * `orders` puis le projet ; au 3ᵉ échec, la cloche. Un projet qui n'attend
 * plus son paiement n'est pas touché.
 */
@Injectable()
export class CardIncreaseProviderChecks {
  constructor(
    private readonly lock: OrderLock,
    private readonly proposals: CardIncreaseProposalRepository,
    private readonly labels: IncreaseOrderLabels,
    private readonly bell: CardIncreaseBell,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  recordFailure(proposalId: string, orderId: string): Promise<void> {
    return this.unitOfWork.run(async () => {
      await this.lock.lock(orderId);
      const live = await this.proposals.lockLiveOf(orderId);
      if (live === null || live.id !== proposalId || live.state !== "awaiting_payment") {
        return;
      }
      const ring = live.recordProviderCheckFailure();
      if (!(await this.proposals.save(live)) || !ring) {
        return;
      }
      await this.bell.ring(live, await this.labels.of(orderId), "provider_unreachable");
    });
  }
}
