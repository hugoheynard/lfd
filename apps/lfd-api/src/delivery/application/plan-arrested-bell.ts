import type { StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AfterCommit } from "../../platform/database/after-commit.js";
import { BackgroundWork } from "../../platform/events/background-work.js";
import { StaffNotifier } from "../../staff/notifications/domain/ports/staff-notifier.js";
import {
  ActiveBinTypesReader,
  MeasuredVehiclesReader,
} from "../domain/ports/composition-prerequisites.readers.js";
import { compositionGapOf } from "../domain/services/composition-prerequisites.js";
import { planArrestedWords } from "../domain/services/plan-arrested-words.js";

/**
 * Qui reçoit : ceux qui composent les tournées — « Proposer » et
 * « Appliquer » sont sous `delivery_rounds:write`. Résolu à l'envoi par la
 * cloche, jamais figé.
 */
const AUDIENCE: StaffPermission = "delivery_rounds:write";

const KIND = "delivery.plan_arrested";
const RUNG = "delivery-plan-arrested-bell";

/**
 * **La cloche du plan arrêté** (`documentation/livraisons/tournees/composition-automatique.md`, §4, CA6a).
 *
 * Elle vérifie le socle en BASE seulement (CA-D3, sans réseau : l'abonné
 * tourne dans une transaction), et sonne APRÈS la validation (`AfterCommit`) :
 * une unité de travail qui échoue ne prévient personne, et sera rejouée. Un
 * envoi qui échoue est journalisé par `BackgroundWork`, jamais avalé.
 *
 * Clé d'idempotence `(journée, taille de l'ensemble)` : une même croissance
 * ne sonne qu'une fois, une croissance nouvelle sonne de nouveau.
 */
@Injectable()
export class PlanArrestedBell {
  constructor(
    private readonly vehicles: MeasuredVehiclesReader,
    private readonly binTypes: ActiveBinTypesReader,
    private readonly notifier: StaffNotifier,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  async ring(input: {
    readonly serviceDay: string;
    readonly added: number;
    readonly total: number;
    readonly at: Date;
  }): Promise<void> {
    const [measuredVehicleIds, activeBinTypeIds] = await Promise.all([
      this.vehicles.measuredIds(),
      this.binTypes.activeIds(),
    ]);
    const gap = compositionGapOf({ measuredVehicleIds, activeBinTypeIds });
    const words = planArrestedWords({ ...input, gap });
    const notice = {
      kind: KIND,
      ...words,
      link: `/livraison/tournees?jour=${input.serviceDay}`,
      idempotencyKey: `notification:${KIND}:${input.serviceDay}:${String(input.total)}`,
      occurredAt: input.at,
      audience: AUDIENCE,
    };
    this.afterCommit.defer(() => this.work.track(this.notifier.notify([notice]), RUNG), RUNG);
  }
}
