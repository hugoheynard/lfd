import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { CompanyStatusReader } from "../../domain/ports/company-status.reader.js";
import { isCounterAccount } from "../../domain/services/counter-account-service.js";
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
 * **La naissance du reliquat** (`documentation/commandes/reliquat/reliquat.md`, § 6.2,
 * décision 1) : dans l'unité de travail de la décision du départ, sous le
 * verrou de la commande, ce qui n'est pas parti devient un reliquat `open`
 * et `backorder.opened` s'écrit au journal.
 *
 * Rien ne naît quand tout est parti. Une commande de particulier (sans
 * société) a son reliquat comme celle d'un pro (décision 13) : l'équipe le
 * transforme en commande réglée en boutique ou offerte, ou l'abandonne. Un
 * compte ouvert au comptoir n'en a pas (`plan-comptes-du-comptoir.md`, § 3.7).
 */
@Injectable()
export class BackorderOpening {
  constructor(
    private readonly origins: BackorderOriginReader,
    private readonly backorders: BackorderRepository,
    private readonly journal: Journal,
    private readonly ids: IdGenerator,
    // Facultatif pour les doubles des suites ; Nest l'injecte toujours (§ 3.7).
    private readonly statuses?: CompanyStatusReader,
  ) {}

  async openAfter(birth: BackorderBirth): Promise<void> {
    const origin = await this.origins.ofLocked(birth.originOrderId);
    if (origin === null) {
      return;
    }
    // Un compte ouvert au comptoir n'a pas de reliquat : le reste est abandonné.
    if (await this.hasNoBackorder(origin.companyId)) {
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

  private async hasNoBackorder(companyId: string | null): Promise<boolean> {
    if (companyId === null || this.statuses === undefined) {
      return false;
    }
    return isCounterAccount(await this.statuses.companyStatusOf(companyId));
  }
}
