import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { Backorder } from "../domain/entities/backorder.js";
import { BackorderOriginReader } from "../domain/ports/backorder-origin.reader.js";
import { BackorderRepository } from "../domain/ports/backorder.repository.js";
import {
  backorderRemainderOf,
  type DepartedQuantity,
} from "../domain/services/backorder-remainder.js";
import { BackorderJournalFacts } from "./backorder-journal-facts.js";

/** La décision du départ incomplet, vue du reliquat qu'elle fait naître. */
export interface BackorderBirth {
  readonly originOrderId: string;
  /** Le numéro de la commande d'origine : le libellé du fait au journal. */
  readonly originReference: string;
  readonly departing: readonly DepartedQuantity[];
  readonly decidedAt: Date;
}

/**
 * **La naissance du reliquat** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 3,
 * décision 1) : dans l'unité de travail de la décision du départ, sous le
 * verrou de la commande, ce qui n'est pas parti devient un reliquat `open`
 * et `backorder.opened` s'écrit au journal.
 *
 * Rien ne naît quand tout est parti, ni pour une commande sans société : un
 * reliquat de particulier n'a pas encore de geste pour se fermer (plan, § 5
 * bis) — son reste est abandonné et remboursé comme la décision le fait.
 */
@Injectable()
export class BackorderOpening {
  constructor(
    private readonly origins: BackorderOriginReader,
    private readonly backorders: BackorderRepository,
    private readonly journal: Journal,
    private readonly ids: IdGenerator,
  ) {}

  async openAfter(birth: BackorderBirth): Promise<void> {
    const origin = await this.origins.ofLocked(birth.originOrderId);
    if (origin === null || origin.companyId === null) {
      return;
    }
    const lines = backorderRemainderOf(origin.lines, birth.departing);
    if (lines.length === 0) {
      return;
    }
    const backorder = Backorder.open({
      id: this.ids.next(),
      originOrderId: birth.originOrderId,
      companyId: origin.companyId,
      buyerUserId: origin.buyerUserId,
      lines,
      openedAt: birth.decidedAt,
    });
    await this.backorders.save(backorder);
    await this.journal.append(BackorderJournalFacts.opened(backorder, birth.originReference));
  }
}
