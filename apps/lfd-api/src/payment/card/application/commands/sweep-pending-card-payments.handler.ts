import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  CardPayments,
  type CardProviderSettlement,
} from "../../../channels/requests/card-payments.js";
import { CardPaymentRepository } from "../../domain/ports/card-payment.repository.js";
import { PendingCardPaymentsReader } from "../../domain/ports/pending-card-payments.reader.js";
import { providerCheckSelection } from "../../domain/services/provider-check-schedule.js";
import {
  type PendingCardPaymentsSweepReport,
  SweepPendingCardPaymentsCommand,
} from "./sweep-pending-card-payments.command.js";

type Issue = CardProviderSettlement | "failed_check";

/** La case du rapport de chaque issue. */
const TALLY_KEY: { readonly [K in Issue]: keyof Omit<PendingCardPaymentsSweepReport, "examined"> } =
  {
    settled: "settled",
    replayed: "replayed",
    refused_by_subject: "refusedBySubject",
    closed: "closed",
    pending: "pending",
    failed_check: "failedChecks",
  };

/**
 * **Le balayage des paiements en attente** (plan B) — tous types de sujet,
 * sans en connaître aucun, hors rôle `complement` (les balayages des hausses
 * le relisent avec leur propre logique).
 *
 * Un par un, HORS transaction : le curseur avance d'abord — même si la
 * relecture échoue ensuite, une intention illisible ne bloque pas la file —,
 * puis `settleFromProvider` relit le prestataire avant d'ouvrir sa propre
 * unité de travail. Un échec est compté et journalisé avec l'identifiant du
 * paiement seul ; il n'arrête pas les suivants.
 *
 * @sans-journal Rattrapage machine d'un webhook perdu, sans geste humain :
 * un règlement rejoue le chemin du webhook et publie ses faits ; le reste va
 * au rapport du cron.
 */
@CommandHandler(SweepPendingCardPaymentsCommand)
export class SweepPendingCardPaymentsHandler implements ICommandHandler<
  SweepPendingCardPaymentsCommand,
  PendingCardPaymentsSweepReport
> {
  private readonly logger = new Logger(SweepPendingCardPaymentsHandler.name);

  constructor(
    private readonly pending: PendingCardPaymentsReader,
    private readonly payments: CardPaymentRepository,
    private readonly cards: CardPayments,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<PendingCardPaymentsSweepReport> {
    const now = this.clock.now();
    const ids = await this.pending.dueForProviderCheck(providerCheckSelection(now));
    const report = {
      examined: ids.length,
      settled: 0,
      replayed: 0,
      refusedBySubject: 0,
      closed: 0,
      pending: 0,
      failedChecks: 0,
    };
    for (const paymentId of ids) {
      report[TALLY_KEY[await this.checkOne(paymentId, now)]] += 1;
    }
    return report;
  }

  private async checkOne(paymentId: string, now: Date): Promise<Issue> {
    try {
      await this.payments.markProviderChecked(paymentId, now);
      return await this.cards.settleFromProvider(paymentId);
    } catch (error) {
      this.logger.error(
        `Paiement ${paymentId} non relu chez le prestataire : il sera repris au prochain intervalle.`,
        error instanceof Error ? error.stack : String(error),
      );
      return "failed_check";
    }
  }
}
