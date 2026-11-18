import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import {
  type DeclarationCorrection,
  OutputCorrectionsReader,
} from "../../../production/channels/packing/index.js";
import {
  AppliedCorrectionLedger,
  HandoffReceipts,
} from "../../domain/ports/applied-correction.ledger.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import { CorrectionBell } from "./correction-bell.js";

/** Ce qu'une correction a donné. */
export type CorrectionOutcome = "deferred" | "unchanged" | "applied";

/**
 * **Appliquer une correction du fournil à la réserve** (D9 de
 * `colisage/plan-niveaux-de-suivi-colisage.md`).
 *
 * Le fournil publie un cumul par fournée ; seule la différence avec ce qui
 * est déjà retiré s'applique, sous le verrou de la réserve `(jour, SKU)` —
 * rejouer un fait, ou relire le cumul, ne baisse jamais deux fois. Un cumul
 * plus bas (une fournée retirée, ou qui a disparu du lecteur) ne fait jamais
 * remonter la réserve. Une remise pas encore reçue attend : sa réception
 * appliquera la correction.
 *
 * Dans l'unité de travail de l'appelant.
 */
@Injectable()
export class OutputCorrectionApplier {
  constructor(
    private readonly corrections: OutputCorrectionsReader,
    private readonly stocks: PackingStockRepository,
    private readonly ledger: AppliedCorrectionLedger,
    private readonly receipts: HandoffReceipts,
    private readonly bell: CorrectionBell,
    private readonly clock: Clock,
  ) {}

  /** Les corrections publiées d'une journée qui répondent à `match`, une à une. */
  async applyMatching(
    serviceDay: string,
    match: (correction: DeclarationCorrection) => boolean,
  ): Promise<void> {
    for (const correction of await this.corrections.correctionsOf(serviceDay)) {
      if (match(correction)) {
        await this.apply(serviceDay, correction);
      }
    }
  }

  /** Une correction : sa différence, l'ordre manquant → libre, puis la cloche. */
  async apply(serviceDay: string, correction: DeclarationCorrection): Promise<CorrectionOutcome> {
    if (!(await this.receipts.isReceived(correction.handoffId))) {
      return "deferred";
    }
    const receipt = { serviceDay, handoffId: correction.handoffId, sku: correction.sku };
    const stock = await this.stocks.lock(serviceDay, correction.sku);
    // Lu APRÈS le verrou : deux corrections de la même remise se suivent.
    const applied = await this.ledger.appliedOf(receipt);
    const owed = correction.corrected - applied;
    if (owed <= 0) {
      return "unchanged";
    }
    const { fromMissing, fromFree, uncovered } = stock.correctReceived(owed);
    const lowered = fromMissing + fromFree;
    if (lowered > 0) {
      await this.stocks.save(stock);
      await this.ledger.record(receipt, applied + lowered);
    }
    if (uncovered > 0) {
      this.bell.ringAfterCommit({
        ...receipt,
        totalCorrected: correction.corrected,
        uncovered,
        at: this.clock.now(),
      });
    }
    return lowered > 0 ? "applied" : "unchanged";
  }
}
