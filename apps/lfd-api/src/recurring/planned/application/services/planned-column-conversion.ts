import { Injectable, Logger } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  PlannedColumnPlacement,
  type PlannedColumnPlacementOutcome,
  type PlannedColumnPlacementRequest,
} from "../../../channels/commerce/planned-column-placement.js";
import type { PlannedColumn } from "../../domain/entities/planned-column.js";
import { PlannedColumnVersionConflictError } from "../../domain/errors/planned-column-errors.js";
import { PlannedColumnRepository } from "../../domain/ports/planned-column.repository.js";
import { PlannedColumnIssueFact } from "./planned-column-facts.js";

/**
 * Ce que la conversion d'une colonne a donné : `lost` quand un autre balayage
 * l'a inscrite entre-temps — son issue tient, celle-ci ne s'écrit pas.
 */
export type ConversionResult = "placed" | "refused" | "missed" | "failed" | "lost";

/**
 * **Une colonne devient une commande, ou ne le devient pas** (plan du
 * planificateur, § 5) : la passation au commerce (`PlannedColumnPlacement`),
 * PUIS l'issue inscrite sur la colonne, dans sa propre transaction, avec le
 * fait qui sonne la cloche du staff pour un refus ou un manqué. Le commerce
 * n'écrit jamais `planned_columns`.
 *
 * La passation et l'inscription ne partagent pas de transaction : une
 * inscription perdue se répare au passage suivant, la passation rendant la
 * commande déjà passée (unicité de la provenance). Un refus est définitif.
 */
@Injectable()
export class PlannedColumnConversion {
  private readonly logger = new Logger(PlannedColumnConversion.name);

  constructor(
    private readonly placement: PlannedColumnPlacement,
    private readonly columns: PlannedColumnRepository,
    private readonly durable: DurablePublisher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /** Présente la colonne au commerce, puis inscrit l'issue. */
  async convert(column: PlannedColumn): Promise<ConversionResult> {
    let outcome: PlannedColumnPlacementOutcome;
    try {
      outcome = await this.placement.place(placementRequestOf(column));
    } catch (error) {
      this.logger.error(
        `Colonne planifiée ${column.id} du ${column.serviceDay.value} interrompue, reprise au prochain passage : ${String(error)}`,
      );
      return "failed";
    }
    if (outcome.kind === "placed") {
      column.markPlaced(outcome.orderId);
      return (await this.settle(column, null)) ? "placed" : "lost";
    }
    const refusal = { cause: outcome.cause, reason: outcome.reason };
    column.markRefused(refusal);
    const issue = { kind: "refused", ...refusal } as const;
    return (await this.settle(column, issue)) ? "refused" : "lost";
  }

  /** La fermeture est passée sans conversion : manquée, jamais rattrapée. */
  async miss(column: PlannedColumn): Promise<ConversionResult> {
    column.markMissed();
    return (await this.settle(column, { kind: "missed" })) ? "missed" : "lost";
  }

  /**
   * L'issue et son fait, ensemble. Faux : un autre écrivain a changé la
   * colonne depuis sa lecture — ni l'issue ni le fait ne partent.
   */
  private settle(
    column: PlannedColumn,
    issue: PlannedColumnIssueFact["issue"] | null,
  ): Promise<boolean> {
    return this.uow.run(async () => {
      try {
        await this.columns.save(column, this.clock.now());
      } catch (error) {
        if (error instanceof PlannedColumnVersionConflictError) {
          return false;
        }
        throw error;
      }
      if (issue !== null) {
        const { companyId, buyerUserId } = column.snapshot();
        const fact = new PlannedColumnIssueFact(
          column.id,
          companyId,
          buyerUserId,
          column.serviceDay.value,
          issue,
        );
        await this.durable.publish(fact.durableFact());
      }
      return true;
    });
  }
}

/** Ce que le commerce reçoit : la colonne telle que l'écran la montrait au gel. */
function placementRequestOf(column: PlannedColumn): PlannedColumnPlacementRequest {
  const { companyId, buyerUserId, routing, lines } = column.snapshot();
  return {
    columnId: column.id,
    serviceDay: column.serviceDay.value,
    buyerUserId,
    companyId,
    routing,
    lines: lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
  };
}
