import { Injectable } from "@nestjs/common";

import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { HandedToPackingEvent } from "../../channels/packing/handed-to-packing.event.js";
import { ReturnRequestedEvent } from "../../channels/packing/return-requested.event.js";
import type { PackedMark, ProductionBatchSnapshot } from "../../domain/entities/production-day.js";
import { ProductionHandoffLedger } from "../../domain/ports/production-handoff.ledger.js";
import { ProductionHandoffReader } from "../../domain/ports/production-handoff.reader.js";
import { handoffOf, returnOf } from "../../domain/services/production-handoff.js";
import type { PackingOwner } from "../../domain/value-objects/packing-owner.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * **Remettre au colisage, et reprendre** — le registre et le fait durable,
 * ensemble (plan `documentation/colisage/plan-domaine-colisage.md`, §11.2, §13).
 *
 * Partagé par les quatre gestes de fournée (déclarer, cocher, annuler,
 * décocher) : la règle « une remise = une ligne + un fait » s'écrit une fois.
 *
 * 🔴 Il tourne dans l'unité de travail de l'APPELANT, et n'en ouvre pas : la
 * fournée, sa remise et le fait partent ensemble, ou rien ne part. La boîte
 * d'envoi refuse d'ailleurs d'écrire hors transaction.
 */
@Injectable()
export class PackingHandoffs {
  constructor(
    private readonly ledger: ProductionHandoffLedger,
    private readonly handed: ProductionHandoffReader,
    private readonly durable: DurablePublisher,
  ) {}

  /** La fournée déclarée est remise. Rejouée, elle ne l'est qu'une fois (même `id`, même clé). */
  async handOver(day: ServiceDay, batch: ProductionBatchSnapshot): Promise<void> {
    const handoff = handoffOf(batch);
    await this.ledger.record(day, handoff);
    await this.durable.publish(
      new HandedToPackingEvent(
        handoff.id,
        day.value,
        handoff.sku,
        handoff.quantity,
        handoff.at,
      ).durableFact(),
    );
  }

  /**
   * Les fournées annulées qui avaient été remises sont reprises. Une fournée
   * jamais remise (d'avant K1, ou implicite) ne demande rien au colisage.
   *
   * Sur une journée `legacy`, l'annulation a DÉJÀ eu lieu, synchrone, sous la
   * garde de l'ancien poste : le fait le dit (`legacy: true`), et le colisage
   * l'applique sans répondre (§13, B2).
   */
  async takeBack(
    day: ServiceDay,
    batches: readonly ProductionBatchSnapshot[],
    mark: PackedMark,
    owner: PackingOwner,
  ): Promise<void> {
    const handed = await this.handed.handedAmong(
      day,
      batches.map((batch) => batch.id),
    );
    for (const batch of batches.filter((candidate) => handed.has(candidate.id))) {
      const back = returnOf(batch, mark);
      await this.ledger.record(day, back);
      await this.durable.publish(
        new ReturnRequestedEvent(
          back.id,
          day.value,
          batch.sku,
          batch.quantity,
          owner === "legacy",
          mark.at,
        ).durableFact(),
      );
    }
  }
}
