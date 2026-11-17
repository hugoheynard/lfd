import { Injectable } from "@nestjs/common";

import { ProductionBatchRepository } from "../../../day/index.js";
import type { ProductionDay, ServiceDay } from "../../../day/index.js";
import { PackingHandoffs } from "./packing-handoffs.service.js";

/** Qui déclare la fournée, et quand. */
export interface BatchAuthor {
  readonly at: Date;
  readonly by: string;
  /** Deux lettres au crayon ; vide autorisé. */
  readonly initials: string;
}

/**
 * **Écrire une fournée et la remettre au colisage** — le geste commun à toute
 * déclaration : la fournée de l'écran (`RecordBatchHandler`), « Fait » et le
 * surplus d'un rouge (plan `documentation/fournil/plan-niveaux-de-suivi.md`,
 * § 3.4, § 3.6). Une fournée ordinaire, quel que soit le geste qui la pose.
 *
 * 🔴 L'appelant a pris le verrou de la journée et l'a rechargée SOUS lui,
 * dans son unité de travail : ce service n'en ouvre pas. L'agrégat refuse
 * (journée non arrêtée, SKU hors du compte, moins d'une pièce), la base garde
 * la première fournée sous un `id`, l'agrégat compare les charges, et seule
 * une fournée vivante est remise.
 */
@Injectable()
export class BatchRecording {
  constructor(
    private readonly batches: ProductionBatchRepository,
    private readonly handoffs: PackingHandoffs,
  ) {}

  async record(
    day: ServiceDay,
    current: ProductionDay,
    batch: { readonly id: string; readonly sku: string; readonly quantity: number },
    author: BatchAuthor,
  ): Promise<void> {
    const declared = current.batchToRecord(batch.id, batch.sku, batch.quantity, author);
    const stored = await this.batches.record(day, declared);
    current.acknowledge(declared, stored.serviceDay, stored.batch);
    if (stored.batch.cancelled === null) {
      await this.handoffs.handOver(day, current, stored.batch);
    }
  }
}
