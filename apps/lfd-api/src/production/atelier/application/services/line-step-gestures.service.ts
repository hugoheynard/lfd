import { Injectable } from "@nestjs/common";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { ProductionDayLock, ProductionDayRepository, ServiceDay } from "../../../day/index.js";
import { GroupingSourceReading } from "../../../workstations/index.js";
import type { LineStep, LineStepKey } from "../../domain/entities/line-step.js";
import { LineStationsUnreadableError } from "../../domain/errors/line-step-errors.js";
import { LineStepChangedEvent } from "../../domain/events/line-step.events.js";
import { LineStepRepository } from "../../domain/ports/line-step.ports.js";
import { assertStepOf } from "../../domain/services/line-steps.js";

/**
 * Ce qu'un geste fait de l'étape relue : la nouvelle étape à écrire, ou
 * `null` — rien ne change, rien n'est écrit ni journalisé.
 */
export type StepChange = (known: LineStep | null) => LineStep | null;

/**
 * **Le passage commun des gestes d'une étape** (
 * `documentation/fournil/un-produit-sur-plusieurs-postes.md`, § 2.3) —
 * cocher, mettre en rouge, décocher. Dans l'unité de travail de l'appelant,
 * sous le verrou de la journée comme « Fait » :
 *
 * 1. la journée est arrêtée et la ligne est au compte (`itemToMark`, les
 *    refus mêmes de « Fait ») ;
 * 2. le poste est une étape de la ligne **sur la carte courante** — ni celui
 *    qui la finit, ni un poste étranger au produit (409 nommé) ;
 * 3. l'étape est relue, le geste la mute par une méthode métier, puis elle
 *    est sauvée et son fait part dans la boîte d'envoi.
 *
 * Aucune fournée n'est touchée : une étape ne compte aucune pièce.
 */
@Injectable()
export class LineStepGestures {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly lock: ProductionDayLock,
    private readonly stations: GroupingSourceReading,
    private readonly steps: LineStepRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   * @throws {ProducedItemNotFoundError} ce SKU n'est pas au compte du jour.
   * @throws {FinishingWorkstationIsNotAStepError} le poste finit la ligne.
   * @throws {WorkstationNotOnLineError} le poste n'est pas un poste du produit.
   * @throws {LineStationsUnreadableError} les postes de la ligne sont illisibles.
   */
  async apply(key: LineStepKey, change: StepChange): Promise<void> {
    const day = ServiceDay.of(key.serviceDay);
    await this.lock.lock(day);
    const item = (await this.days.load(day)).itemToMark(key.sku);
    const line = await this.lineStations(key.sku);
    assertStepOf(line.stations, key.workstationId, key.sku);
    const changed = change(await this.steps.load(key));
    if (changed === null) {
      return;
    }
    await this.steps.save(changed);
    await this.events.publishTraced(
      new LineStepChangedEvent(changed.state, {
        productName: item.productName,
        workstationName:
          line.workstations.find((station) => station.id === key.workstationId)?.name ??
          key.workstationId,
      }),
    );
  }

  private async lineStations(
    sku: string,
  ): Promise<Awaited<ReturnType<GroupingSourceReading["stationsOfLine"]>>> {
    try {
      return await this.stations.stationsOfLine(sku);
    } catch (error) {
      throw new LineStationsUnreadableError(sku, error);
    }
  }
}
