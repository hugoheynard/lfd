import { Injectable } from "@nestjs/common";

import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { ProductionDayClosedEvent } from "../../channels/commerce/production-day-closed.event.js";
import type { ProductionDay } from "../../domain/entities/production-day.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { packingListFactsOf, resupplyListFactsOf } from "./packing-list-facts.js";

/**
 * **Écrit et annonce un arrêt du plan, ou le réannonce** — la journée, puis
 * `production.day_closed` et la liste à coliser (une commande, un fait ; un
 * réassort servi par transfert, un fait). Sorti de `CloseProductionDayHandler`
 * (audit du réassort, 2026-11-02) ; à appeler dans son unité de travail, sous
 * le verrou de la journée. Le journal reste au handler : c'est lui que la
 * porte `lint:journal-tracked` lit.
 *
 * Les faits portent l'instant du TIRAGE d'origine, jamais celui d'un rejeu ;
 * la réannonce ajoute le sien à la clé seulement.
 */
@Injectable()
export class PlanArrestRecording {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly durable: DurablePublisher,
  ) {}

  /** L'arrêt qui vient d'être décidé : la journée, le fait, la liste. */
  async record(day: ServiceDay, current: ProductionDay, closedAt: Date): Promise<void> {
    await this.days.save(current);
    await this.publish(day, current, closedAt, null);
  }

  /**
   * La réannonce d'une journée déjà arrêtée, sans rien recalculer — SAUF une
   * journée arrêtée par un lancement « au plus tôt » (`openedByLaunch`) : elle
   * n'a jamais publié `production.day_closed` (décision Q6,
   * `reassort-boutiques/au-plus-tot.md` : ni fait d'arrêt, ni dossier), et en
   * réannoncer un apprendrait au commerce et à la livraison un arrêt du plan
   * qui n'a pas eu lieu. Le fait du lancement (`openedPlan`) l'a déjà dit
   * (comportement vérifié dans `ResupplyLaunchRecording` le 2026-11-03).
   *
   * Ne rend rien : l'accusé de la réannonce est le même dans les deux cas
   * (`alreadyClosed: true`), et aucun appelant ne distinguait « rien
   * republié » (le booléen d'avant n'était lu par personne, 2026-11-03).
   */
  async republish(
    day: ServiceDay,
    current: ProductionDay,
    closedAt: Date,
    reannouncedAt: Date,
  ): Promise<void> {
    if (current.openedByLaunch) {
      return;
    }
    await this.publish(day, current, closedAt, reannouncedAt);
  }

  private async publish(
    day: ServiceDay,
    current: ProductionDay,
    closedAt: Date,
    reannouncedAt: Date | null,
  ): Promise<void> {
    const orderIds = current.orders.map((order) => order.orderId);
    const resupplyIds = current.resupplies.map((resupply) => resupply.resupplyId);
    await this.durable.publish(
      new ProductionDayClosedEvent(
        day.value,
        closedAt,
        orderIds,
        reannouncedAt,
        resupplyIds,
      ).durableFact(),
    );
    const reopenedAt = current.reopened?.at ?? null;
    // Un `publish` par fait, donc une instruction par commande, sous le verrou
    // EXCLUSIF de la journée : `OutboxDurablePublisher` n'a pas d'écriture en
    // lot (une CTE par fait, vérifié le 2026-11-03). L'ajouter est un
    // changement du port de `platform/` et de ses sept doubles, hors du
    // fournil — laissé au reste à faire du réassort.
    for (const fact of packingListFactsOf(day, current.orders, closedAt, reopenedAt)) {
      await this.durable.publish(fact.durableFact());
    }
    for (const fact of resupplyListFactsOf(day, current.resupplies, closedAt, reopenedAt)) {
      await this.durable.publish(fact.durableFact());
    }
  }
}
