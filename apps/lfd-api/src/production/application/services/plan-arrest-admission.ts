import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PendingSettlementSweeper } from "../../channels/commerce/pending-settlement.sweeper.js";
import {
  AUTOMATIC_SIGNER,
  type PlanSigner,
  staffSigner,
} from "../../domain/entities/plan-signer.js";
import { ProductionDayStatusReader } from "../../domain/ports/production-day-status.reader.js";
import { refuseCloseBeforeCutoff } from "../../domain/services/early-close.js";
import { type PlanStop, planStopOf } from "../../domain/services/latest-order-cutoff.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import type { CloseProductionDayCommand } from "../commands/close-production-day.command.js";
import { PlanStopRules } from "./plan-stop-rules.js";

/** Ce que l'arrêt a établi avant de prendre le verrou de la journée. */
export interface PlanArrestAdmitted {
  /** Qui arrête, nom figé maintenant ; `null` pour un arrêt anonyme (un semis). */
  readonly signer: PlanSigner | null;
  /** L'arrêt du plan pour ce jour (heure limite et sa cause), `null` sans règle. */
  readonly stop: PlanStop | null;
}

/**
 * **Tout ce que l'arrêt fait AVANT le verrou de la journée** — l'heure limite
 * lue et contrôlée, les règlements en l'air tranchés au commerce, le signataire
 * résolu. Sorti de `CloseProductionDayHandler` le 2026-11-03 (audit final du
 * réassort : neuf dépendances).
 *
 * 🔴 **Le contrôle d'ici ne décide de rien.** Il épargne le balayage — qui
 * annulerait les paiements de clients encore en train de commander — à un
 * arrêt anticipé d'une journée ouverte. La DÉCISION se reprend sous le verrou
 * ({@link refuseUnderLock}) sur la journée relue : jusqu'au 2026-11-03, le
 * contrôle n'était fait que si l'en-tête lu ICI disait « ouverte », et une
 * réouverture validée entre cette lecture et le verrou laissait l'arrêt
 * figer, avant l'heure, une journée qu'il avait crue déjà arrêtée.
 */
@Injectable()
export class PlanArrestAdmission {
  constructor(
    private readonly status: ProductionDayStatusReader,
    private readonly stopRules: PlanStopRules,
    private readonly settlements: PendingSettlementSweeper,
    private readonly authors: StaffAuthorDirectory,
    private readonly clock: Clock,
  ) {}

  /**
   * Hors verrou : refuse un arrêt anticipé d'une journée qu'on voit ouverte,
   * puis balaie (à CHAQUE appel, réannonce comprise) et résout le signataire —
   * même pour une réannonce : une journée rouverte entre-temps se trouve
   * ouverte sous le verrou, et s'arrête alors signée, pas anonyme.
   *
   * @throws {PlanClosedBeforeOrderCutoffError} journée vue ouverte, avant l'heure.
   */
  async beforeLock(
    day: ServiceDay,
    command: CloseProductionDayCommand,
  ): Promise<PlanArrestAdmitted> {
    const stop = planStopOf(await this.stopRules.rules(), day.value);
    if (!(await this.status.isClosed(day))) {
      refuseCloseBeforeCutoff(day.value, stop, this.clock.now());
    }
    await this.settlements.sweep(day);
    return { signer: await this.signerOf(command), stop };
  }

  /**
   * Sous le verrou, sur la journée RELUE ouverte : la seule décision.
   *
   * @throws {PlanClosedBeforeOrderCutoffError} l'arrêt précède l'heure limite.
   */
  refuseUnderLock(day: ServiceDay, admitted: PlanArrestAdmitted): void {
    refuseCloseBeforeCutoff(day.value, admitted.stop, this.clock.now());
  }

  /**
   * Qui arrête, nom FIGÉ maintenant (le papier ne bouge plus). Un arrêt
   * manuel sans fiche (un semis) reste anonyme : on n'invente pas d'auteur.
   */
  private async signerOf(command: CloseProductionDayCommand): Promise<PlanSigner | null> {
    if (command.trigger === "automatic") {
      return AUTOMATIC_SIGNER;
    }
    if (command.staffUserId === null) {
      return null;
    }
    const authors = await this.authors.identify([command.staffUserId]);
    return staffSigner(command.staffUserId, authors.nameOf(command.staffUserId));
  }
}
