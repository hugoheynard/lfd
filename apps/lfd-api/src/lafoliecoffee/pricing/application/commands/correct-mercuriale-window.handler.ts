import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import { checkedWindowCorrectionReason } from "../../domain/entities/mercuriale-window-correction.js";
import { CompanyMercurialeReader } from "../../domain/ports/company-mercuriale.reader.js";
import { CompanyMercurialeRepository } from "../../domain/ports/company-mercuriale.repository.js";
import { PricedDecisionsReader } from "../../domain/ports/priced-decisions.reader.js";
import { VolumeCommitmentReader } from "../../domain/ports/volume-commitment.reader.js";
import { describeWindowOf } from "../../domain/pricing-act.js";
import type { PricingAct } from "../../domain/pricing-act.js";
import {
  PosedMercurialeNotFoundError,
  PricedPeriodIsSealedError,
  RunningMercurialeError,
} from "../../domain/pricing-errors.js";
import { designated } from "./company-mercuriale-support.js";
import { CorrectMercurialeWindowCommand } from "./correct-mercuriale-window.command.js";
import { assertNoVolumeCommitmentUnder } from "./general-discount-support.js";
import { MERCURIALE_GESTURES } from "./mercuriale-intent-support.js";

@CommandHandler(CorrectMercurialeWindowCommand)
export class CorrectMercurialeWindowHandler implements ICommandHandler<
  CorrectMercurialeWindowCommand,
  void
> {
  constructor(
    private readonly reader: CompanyMercurialeReader,
    private readonly mercuriales: CompanyMercurialeRepository,
    private readonly priced: PricedDecisionsReader,
    private readonly commitments: VolumeCommitmentReader,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * Corrige le début et la fin d'une mercuriale **à venir**
   * (`documentation/pricing/mercuriales/comprendre-une-mercuriale.md`, § 9).
   *
   * Désignée par le mur `company_id` (comme le renommage), puis **verrouillée
   * et relue** : les refus de l'agrégat (C1 à C4), ceux de la pose rejoués
   * sur la nouvelle période (C5) et l'avenant passé entre-temps (C6) voient
   * l'état sous le verrou, jamais celui de la désignation.
   *
   * @throws {PosedMercurialeNotFoundError} rien ne correspond chez ce client.
   * @throws {MissingWindowCorrectionReasonError} motif vide (C7).
   * @throws les refus de `CompanyMercuriale.correctWindow` (C1 à C4).
   * @throws {RunningMercurialeError} une autre mercuriale en cours recouvre la nouvelle période.
   * @throws {PricedPeriodIsSealedError} une mercuriale close qui a facturé la recouvre.
   * @throws {GeneralDiscountOverVolumeCommitmentError} une remise générale tomberait
   *   sur un engagement de volume (Q2).
   * @throws {MercurialeAmendedMeanwhileError} un avenant a été écrit depuis celui annoncé.
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a servi pour un autre geste ou une autre mercuriale.
   *
   * Une fois par intention, sujet la mercuriale : un second envoi de même clé
   * ne corrige rien et ne réécrit pas l'acte. La clé est résolue dans la
   * transaction de la correction.
   */
  execute(command: CorrectMercurialeWindowCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: MERCURIALE_GESTURES.correctWindow,
        subject: intentSubject(command.mercurialeId, command.companyId, command.payload),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.correct(command, seal),
    );
  }

  private async correct(
    command: CorrectMercurialeWindowCommand,
    seal: () => Promise<void>,
  ): Promise<void> {
    const { companyId, mercurialeId, payload, staffUserId } = command;
    const target = await designated(this.reader, companyId, { id: mercurialeId });
    const reason = checkedWindowCorrectionReason(payload.reason);
    const validFrom = new Date(payload.validFrom);
    const validTo = payload.validTo === null ? null : new Date(payload.validTo);

    await this.uow.run(async () => {
      const mercuriale = await this.mercuriales.lockForAmendment(target.id);
      if (mercuriale === null || mercuriale.companyId !== companyId) {
        throw new PosedMercurialeNotFoundError(mercurialeId);
      }
      const now = this.clock.now();
      const corrected = mercuriale.correctWindow(validFrom, validTo, now);
      await this.assertPeriodFree(corrected);
      mercuriale.assertNotAmendedSince(payload.basedOnAmendmentId);
      await this.mercuriales.correctWindow(corrected, {
        subjectType: "mercuriale",
        subjectId: corrected.id,
        // Le fil de l'accord : l'acte vit sur le document, comme un avenant.
        kind: "amended",
        actor: staffUserId,
        at: now,
        reason,
        summary: describeCorrection(mercuriale, corrected),
        subjectLabel: corrected.label,
      } satisfies PricingAct);
      await seal();
    });
  }

  /** C5 : les refus de la pose, rejoués sur la nouvelle période. */
  private async assertPeriodFree(corrected: CompanyMercuriale): Promise<void> {
    const { companyId, validFrom, validTo } = corrected.toPersistence();
    const running = await this.mercuriales.runningFor(companyId, validFrom, validTo, corrected.id);
    if (running !== null) {
      const state = running.toPersistence();
      throw new RunningMercurialeError(state.label, state.validFrom, state.validTo);
    }
    const closed = await this.mercuriales.archivedOverlapping(companyId, validFrom, validTo);
    if (closed.length > 0 && (await this.priced.anyPriced(closed))) {
      throw new PricedPeriodIsSealedError("mercuriale", validFrom);
    }
    for (const window of discountWindowsOf(corrected)) {
      await assertNoVolumeCommitmentUnder(this.commitments, companyId, window.from, window.to);
    }
  }
}

/**
 * Les fenêtres où une remise générale parlerait : celle du document s'il en
 * porte une, celle de chaque avenant non rangé qui en pose une — bornée par
 * la nouvelle fin du document.
 */
function discountWindowsOf(
  mercuriale: CompanyMercuriale,
): readonly { readonly from: Date; readonly to: Date | null }[] {
  const state = mercuriale.toPersistence();
  if (state.generalDiscount !== null) {
    return [{ from: state.validFrom, to: state.validTo }];
  }
  return state.amendments
    .filter((amendment) => amendment.archivedAt === null && amendment.generalDiscount?.set != null)
    .map((amendment) => ({ from: amendment.validFrom, to: amendment.validTo ?? state.validTo }));
}

/** « Dates corrigées : du 1er janvier 2027, sans date de fin → du 1er janvier 2026 au … ». */
function describeCorrection(before: CompanyMercuriale, after: CompanyMercuriale): string {
  const was = before.toPersistence();
  const is = after.toPersistence();
  return `Dates corrigées : ${describeWindowOf(was.validFrom, was.validTo)} → ${describeWindowOf(is.validFrom, is.validTo)}`;
}
