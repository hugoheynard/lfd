import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { VitrineNoticeNotFoundError } from "../../domain/errors/vitrine-notice-errors.js";
import { VitrineNoticeRepository } from "../../domain/ports/vitrine-notice.repository.js";
import { VitrineNoticeDispatcher } from "../services/vitrine-notice-dispatcher.js";
import { ResumeVitrineNoticeCommand } from "./resume-vitrine-notice.command.js";

/**
 * **Reprend une annonce interrompue** (2026-10-19) : un envoi coupé au milieu
 * (processus redémarré, déploiement) laisse des destinataires « pas tentés »
 * que rien ne relançait.
 *
 * L'agrégat choisit qui reprendre (`VitrineNotice.resumption`) et
 * refuse s'il n'en reste aucun ; l'envoi repart avec la MÊME clé Resend
 * qu'au premier passage. Deux reprises simultanées, ou une reprise pendant
 * l'envoi d'origine, se rejoignent donc chez Resend, et la base ne laisse
 * pas la seconde réécrire une issue consignée.
 *
 * `@hors-transaction` les e-mails partent chez un tiers ; chaque issue est
 * consignée dès qu'elle est connue.
 * `@sans-journal` l'annonce EST le journal : ses destinataires y gagnent
 * leur issue.
 *
 * @throws {VitrineNoticeNotFoundError}
 * @throws {VitrineNoticeNothingToResumeError}
 */
@CommandHandler(ResumeVitrineNoticeCommand)
export class ResumeVitrineNoticeHandler implements ICommandHandler<
  ResumeVitrineNoticeCommand,
  void
> {
  constructor(
    private readonly notices: VitrineNoticeRepository,
    private readonly dispatcher: VitrineNoticeDispatcher,
  ) {}

  async execute(command: ResumeVitrineNoticeCommand): Promise<void> {
    const notice = await this.notices.load(command.noticeId);
    if (notice === null) {
      throw new VitrineNoticeNotFoundError(command.noticeId);
    }
    await this.dispatcher.dispatch(notice, notice.resumption());
  }
}
