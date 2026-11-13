import type { AdminShortfallRefund, ShortfallRefundCause } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { ShortfallRefundSubjectReader } from "../../domain/ports/shortfall-refund-subject.js";
import {
  shortfallRefundGateOf,
  shortfallRefundOf,
} from "../../domain/services/shortfall-refund.js";
import { SHORTFALL_REFUND_REASON, ShortfallRefundMoneyReader } from "./shortfall-refund-money.js";

/**
 * Les causes que « Rembourser le reste » ne répare pas : rien ne peut y
 * réussir. Une facture émise se reprend par un avoir, un remboursement hors
 * plateforme à la main (plan E9, § 4.5).
 */
const UNREPAIRABLE: ReadonlySet<ShortfallRefundCause> = new Set([
  "already_invoiced",
  "unattributed_refund",
]);

/**
 * **« Rembourser le reste » sur la fiche commande** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.5) — lu sur
 * l'ÉTAT, sans verrou ni adoption : la règle de l'abonné, rejouée sur ce qui
 * est écrit. Le bouton se montre quand la commande est décidée, encaissée,
 * soldée, sans 380, sans aucune demande `shortfall`, et que son reste est
 * positif — remboursable aujourd'hui, ou bloqué par une cause qu'un geste
 * répare (hausse en cours, paiement pas encaissé, restes qui ne couvrent pas).
 *
 * Ce n'est pas le journal qui le montre : un blocage réparé depuis (une
 * demande arrêtée « Réglée autrement ») ne réveille pas l'abonné, et c'est ce
 * bouton qui reprend. Une lettre morte de la phase 2 ne se voit qu'à l'écran
 * des lettres mortes ; ici, la commande se lit comme remboursable, et le geste
 * rejoue la même phase 2.
 */
@Injectable()
export class AdminShortfallRefundView {
  constructor(
    private readonly subjects: ShortfallRefundSubjectReader,
    private readonly money: ShortfallRefundMoneyReader,
  ) {}

  async of(orderId: string): Promise<AdminShortfallRefund | null> {
    const subject = await this.subjects.read(orderId);
    if (subject === null || subject.invoiced || shortfallRefundGateOf(subject)?.kind === "none") {
      return null;
    }
    const money = await this.money.of(orderId, "read");
    if (money.requests.some((request) => request.reason === SHORTFALL_REFUND_REASON)) {
      return null;
    }
    // La hausse vivante se dit, mais n'empêche pas de montrer le reste calculé.
    const verdict = shortfallRefundOf({ ...subject, increasePending: false }, money);
    if (verdict.kind === "none" || verdict.amountCents === null) {
      return null;
    }
    if (verdict.kind === "blocked" && UNREPAIRABLE.has(verdict.cause)) {
      return null;
    }
    const blockedBy = verdict.kind === "blocked" ? verdict.cause : null;
    const cause = subject.increasePending ? "increase_pending" : blockedBy;
    return { amountCents: verdict.amountCents, cause };
  }
}
