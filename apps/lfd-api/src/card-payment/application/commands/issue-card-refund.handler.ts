import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { AppError } from "../../../platform/shared/errors/app-error.js";
import { WallClock } from "../../../platform/time/wall-clock.js";
import type { RefundIssuance } from "../../domain/ports/card-provider-types.js";
import { CardProviders } from "../../domain/ports/card-providers.js";
import { CardRefundRequestLease } from "../../domain/ports/card-refund-request.lease.js";
import { PaymentAccount } from "../../domain/value-objects/payment-account.js";
import {
  CardRefundIssuancePreparation,
  type RefundCall,
} from "../refunds/card-refund-issuance-preparation.js";
import { CardRefundIssuanceRecorder } from "../refunds/card-refund-issuance-recorder.js";
import { IssueCardRefundCommand } from "./issue-card-refund.command.js";

/**
 * Le bail : plus long que l'appel le plus long — recherche puis création,
 * chacune 3 × 20 s au pire, attentes du SDK comprises : moins de 3 min (C4.7).
 */
export const CARD_REFUND_LEASE_MS = 5 * 60 * 1000;

/**
 * **L'exécuteur des remboursements** (plan M2, §3.5, §3.6) — déménagé
 * d'`IssueOrderRefundHandler` (`lafoliecoffee/orders`), retiré au lot P1.c : c'est le
 * seul exécuteur des remboursements par carte.
 *
 * 🔴 Jamais dans une transaction ni dans un abonné durable : le prestataire y
 * serait appelé sous transaction, et une levée effacerait l'essai, la cloche
 * et le journal de l'échec. Trois temps :
 *
 * 1. prendre le bail (écriture validée seule, à l'horloge MURALE), puis
 *    préparer sous `lockSubject` et le verrou du paiement
 *    (`CardRefundIssuancePreparation`) ;
 * 2. HORS de toute transaction : chercher, puis créer, chez le prestataire DU
 *    COMPTE de la ligne ; « tout est déjà rendu » relance la recherche ;
 * 3. une transaction courte écrit l'issue (`CardRefundIssuanceRecorder`), qui
 *    journalise sous unité de travail.
 *
 * Un `COMMIT` du 3. qui échoue après un `re_…` créé : le bail expire,
 * l'exécuteur suivant retrouve le `re_…` par la recherche — jamais un second.
 */
@CommandHandler(IssueCardRefundCommand)
export class IssueCardRefundHandler implements ICommandHandler<IssueCardRefundCommand, void> {
  private readonly logger = new Logger(IssueCardRefundHandler.name);

  constructor(
    private readonly lease: CardRefundRequestLease,
    private readonly preparation: CardRefundIssuancePreparation,
    private readonly recorder: CardRefundIssuanceRecorder,
    private readonly providers: CardProviders,
    private readonly ids: IdGenerator,
    private readonly wall: WallClock,
  ) {}

  async execute(command: IssueCardRefundCommand): Promise<void> {
    const token = this.ids.next();
    const wallNow = this.wall.elapsedNow();
    const until = new Date(wallNow.getTime() + CARD_REFUND_LEASE_MS);
    if (!(await this.lease.claim(command.requestId, token, until, wallNow))) {
      return;
    }
    const call = await this.preparation.prepare(command.requestId, token);
    if (call === null) {
      return;
    }
    const issuance = await this.callProvider(call);
    await this.recorder.record({
      requestId: command.requestId,
      paymentId: call.paymentId,
      token,
      generation: call.params.generation,
      issuance,
    });
  }

  /** Hors transaction. Un compte inconnu ou non configuré n'est pas une exception : `unavailable`. */
  private async callProvider({
    account,
    providerRef,
    params,
  }: RefundCall): Promise<RefundIssuance> {
    let issuance: RefundIssuance;
    try {
      const provider = this.providers.forAccount(PaymentAccount.of(account));
      issuance = await provider.refund(providerRef, params);
      if (issuance.kind === "nothing_left") {
        const lookup = await provider.findRefund(providerRef, params);
        issuance = lookup.kind === "found" ? { kind: "issued", refund: lookup.refund } : issuance;
      }
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }
      issuance = { kind: "unavailable", reason: error.message };
    }
    if (issuance.kind === "unavailable") {
      this.logger.warn(`Remboursement non émis (demande ${params.requestId}) : ${issuance.reason}`);
    }
    return issuance;
  }
}
