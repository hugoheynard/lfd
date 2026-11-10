import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CardAccountDefaults } from "../../../platform/config/card-accounts.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { BusinessError, DomainError } from "../../../platform/shared/errors/app-error.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  type SubjectReference,
  type SubjectSettlement,
  SubjectSettlements,
} from "../../channels/subjects/index.js";
import { CardPayment } from "../../domain/entities/card-payment.js";
import { CardPaymentRepository } from "../../domain/ports/card-payment.repository.js";
import { TakeoverReader } from "../../domain/ports/takeover.reader.js";
import { PaymentAccount } from "../../domain/value-objects/payment-account.js";
import { PaymentSubject } from "../../domain/value-objects/payment-subject.js";
import {
  type FirstPaymentsReplayReport,
  ReplayFirstPaymentsCommand,
} from "./replay-first-payments.command.js";
import { ReplayTally } from "./replay-tally.js";

/** Le lot de la reprise des premiers paiements (`card_payment.takeover`). */
export const FIRST_PAYMENTS_TAKEOVER_LOT = "P0";

/**
 * La marge sous le témoin : une commande passée par l'ancienne image pendant
 * que la migration tournait a pu naître juste avant `migrated_at` (§4.3).
 */
const TAKEOVER_MARGIN_MS = 60 * 60 * 1000;

/**
 * **Rattrape les premiers paiements** (plan M2, §4.3, §4.6) — ce que la
 * reprise SQL n'a pas vu, ou vu trop tôt : une commande passée par l'ancienne
 * image pendant la fenêtre de déploiement, un `markPaid` qu'elle a fait.
 *
 * Il **ne lit pas `orders`** : il demande à chaque sujet ses références
 * créées depuis `migrated_at − 1 h` (une borne connue), et relit par un
 * `claim` chaque ligne `pending | failed` plus ancienne (§15 ter). Pour
 * chacune : absente, elle est insérée à l'état du sujet ; en retard, elle
 * avance — jamais en arrière ; autrement différente, elle est signalée, sauf
 * une annulée que le sujet dit `failed` et la ligne `paid` : encaissée après
 * l'annulation, ce que le sujet ne peut pas savoir.
 *
 * Sans témoin (une base de test vidée), il ne fait rien et le dit.
 *
 * @sans-journal Rattrapage machine d'une reprise, sans geste humain ; ses
 * écarts vont au journal technique et au rapport du cron. Le catalogue du
 * journal de `card-payment` arrive avec P1 (plan M2, §15 bis).
 */
@CommandHandler(ReplayFirstPaymentsCommand)
export class ReplayFirstPaymentsHandler implements ICommandHandler<
  ReplayFirstPaymentsCommand,
  FirstPaymentsReplayReport
> {
  private readonly logger = new Logger(ReplayFirstPaymentsHandler.name);

  constructor(
    private readonly takeover: TakeoverReader,
    private readonly settlements: SubjectSettlements,
    private readonly defaults: CardAccountDefaults,
    private readonly payments: CardPaymentRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(): Promise<FirstPaymentsReplayReport> {
    const migratedAt = await this.takeover.migratedAt(FIRST_PAYMENTS_TAKEOVER_LOT);
    if (migratedAt === null) {
      this.logger.warn(
        `Aucun témoin de reprise « ${FIRST_PAYMENTS_TAKEOVER_LOT} » : rien à rattraper.`,
      );
      return { status: "no_takeover" };
    }
    const since = new Date(migratedAt.getTime() - TAKEOVER_MARGIN_MS);
    const tally = new ReplayTally();
    for (const settlement of this.settlements.all()) {
      await this.replayType(settlement, since, tally);
    }
    const report = tally.report();
    for (const gap of report.diverged) {
      this.logger.warn(
        `Premier paiement en écart : ${gap.subjectType}:${gap.subjectId} (${gap.providerRef}) — ` +
          `ligne « ${gap.line ?? "absente"} », sujet « ${gap.subject} ».`,
      );
    }
    return report;
  }

  private async replayType(
    settlement: SubjectSettlement,
    since: Date,
    tally: ReplayTally,
  ): Promise<void> {
    const name = this.defaults.accountFor(settlement.subjectType);
    if (name === null) {
      this.logger.warn(`Aucun compte pour les sujets « ${settlement.subjectType} » : sautés.`);
      return;
    }
    const account = PaymentAccount.of(name);
    for (const reference of await settlement.referencesSince(since)) {
      await this.replayOne(settlement, account, reference, tally);
    }
    for (const line of await this.payments.unsettledCreatedBefore(settlement.subjectType, since)) {
      if (line.providerRef === null) {
        continue;
      }
      const claim = await settlement.claim(line.account.name, line.providerRef);
      if (claim === null) {
        tally.examine();
        tally.diverge(
          { subject: line.subject, providerRef: line.providerRef, settled: "unclaimed" },
          line.state,
        );
        continue;
      }
      await this.replayOne(
        settlement,
        line.account,
        { ...claim, providerRef: line.providerRef },
        tally,
      );
    }
  }

  /** Une référence, dans une transaction courte : un refus n'arrête pas les suivantes. */
  private async replayOne(
    settlement: SubjectSettlement,
    account: PaymentAccount,
    reference: SubjectReference,
    tally: ReplayTally,
  ): Promise<void> {
    tally.examine();
    try {
      await this.uow.run(() => this.reconcile(settlement, account, reference, tally));
    } catch (error) {
      if (!(error instanceof DomainError || error instanceof BusinessError)) {
        throw error;
      }
      this.logger.warn(`Référence ${reference.providerRef} non rattachable : ${error.message}`);
      tally.diverge(reference, null);
    }
  }

  private async reconcile(
    settlement: SubjectSettlement,
    account: PaymentAccount,
    reference: SubjectReference,
    tally: ReplayTally,
  ): Promise<void> {
    const found = await this.payments.findByProviderRef(account, reference.providerRef);
    if (found === null) {
      await this.insert(account, reference, tally);
      return;
    }
    const locked = (await this.payments.load(found.id)) ?? found;
    const verdict = locked.catchUp(reference.settled, this.clock.now());
    if (verdict === "advanced") {
      await this.payments.save(locked);
      tally.advance();
    } else if (
      verdict === "in_step" ||
      (await this.paidAfterCancellation(settlement, locked, reference))
    ) {
      tally.keepInStep();
    } else {
      tally.diverge(reference, locked.state);
    }
  }

  private async insert(
    account: PaymentAccount,
    reference: SubjectReference,
    tally: ReplayTally,
  ): Promise<void> {
    const payment = CardPayment.adopt(
      {
        id: this.ids.next(),
        subject: PaymentSubject.of(reference.subject.type, reference.subject.id),
        account,
        providerRef: reference.providerRef,
        role: reference.role,
        amountCents: reference.amountCents,
        at: this.clock.now(),
      },
      reference.settled,
    );
    if (await this.payments.addIfAbsent(payment)) {
      tally.insert();
      return;
    }
    // Le sujet porte déjà un autre premier paiement : rien ne les rapproche.
    tally.diverge(reference, null);
  }

  /**
   * Encaissée après l'annulation (§4.3) : la ligne dit `paid`, le sujet
   * annulé dit `closed` (une annulée se dit `closed` avant tout, comme dans la
   * reprise SQL — `orderCardSettled`, relu le 2026-11-09) — il ne peut pas
   * savoir que l'argent est arrivé. C'est juste, pas un écart.
   */
  private async paidAfterCancellation(
    settlement: SubjectSettlement,
    payment: CardPayment,
    reference: SubjectReference,
  ): Promise<boolean> {
    if (payment.state !== "paid" || reference.settled !== "closed") {
      return false;
    }
    return settlement.isCancelled(reference.subject);
  }
}
