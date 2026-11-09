import type { MailPreferenceRecipientView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  isRevealCurrent,
  revealedUntil,
} from "../../../sends/domain/entities/staff-mail-consultations.js";
import {
  MarketingPreferenceAddressErasedError,
  MarketingPreferenceNotFoundError,
  MarketingPreferenceRecipientNotRevealedError,
} from "../../domain/errors/marketing-preference-admin.errors.js";
import { MarketingPreferenceAdminReader } from "../../domain/ports/marketing-preference-admin.reader.js";
import { PreferenceConsultationLedger } from "../../domain/ports/preference-consultation.ledger.js";
import { GetMarketingPreferenceRecipientQuery } from "./get-marketing-preference-recipient.query.js";

/**
 * Lit la révélation de CETTE ligne par CETTE personne, puis l'adresse.
 * L'ordre compte : sans révélation en cours, la ligne n'est même pas lue.
 */
@QueryHandler(GetMarketingPreferenceRecipientQuery)
export class GetMarketingPreferenceRecipientHandler implements IQueryHandler<
  GetMarketingPreferenceRecipientQuery,
  MailPreferenceRecipientView
> {
  constructor(
    private readonly consultations: PreferenceConsultationLedger,
    private readonly preferences: MarketingPreferenceAdminReader,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {MarketingPreferenceRecipientNotRevealedError} pas de révélation de moins de 5 minutes.
   * @throws {MarketingPreferenceNotFoundError} la ligne n'est plus au registre.
   * @throws {MarketingPreferenceAddressErasedError} l'adresse a été effacée depuis.
   */
  async execute({
    preferenceId,
    staffUserId,
  }: GetMarketingPreferenceRecipientQuery): Promise<MailPreferenceRecipientView> {
    const revealedAt = await this.consultations.lastRevealedAt(staffUserId, preferenceId);
    if (revealedAt === null || !isRevealCurrent(revealedAt, this.clock.now())) {
      throw new MarketingPreferenceRecipientNotRevealedError(preferenceId);
    }
    const state = await this.preferences.detail(preferenceId);
    if (state === null) {
      throw new MarketingPreferenceNotFoundError(preferenceId);
    }
    if (state.recipientKey === null) {
      throw new MarketingPreferenceAddressErasedError(preferenceId);
    }
    return {
      id: preferenceId,
      recipient: state.recipientKey,
      revealedUntil: revealedUntil(revealedAt).toISOString(),
    };
  }
}
