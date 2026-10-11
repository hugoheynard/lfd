import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { LoyaltySettingsReader } from "../../domain/ports/loyalty-settings.store.js";
import { WelcomeCandidateReader } from "../../domain/ports/welcome-candidate.reader.js";
import { WelcomeBonusCrediting } from "../services/welcome-bonus-crediting.js";
import {
  CreditPendingWelcomeBonusesCommand,
  type PendingWelcomeBonusesReport,
} from "./credit-pending-welcome-bonuses.command.js";

/** Un lot lu d'un coup — même borne que le rattrapage des commandes. */
export const WELCOME_BATCH = 200;

const NOTHING: PendingWelcomeBonusesReport = { scanned: 0, credited: 0 };

/**
 * Parcourt par lots bornés les personnes à qui le bonus est peut-être dû, et
 * crédite chacune dans sa transaction : un échec n'en emporte qu'une, le
 * passage suivant la reprend.
 *
 * Rien n'est parcouru si le programme est fermé, fermé au public, ou le bonus
 * éteint : la réouverture ne rattrape rien. La borne basse est
 * `welcome_bonus_since` — un compte devenu tel bonus éteint n'en reçoit pas
 * quand on l'allume (§7 S8).
 *
 * `@hors-transaction` le passage entier : chaque bonus ouvre SA transaction
 * dans `WelcomeBonusCrediting`, et y trace son fait — même raison que le
 * rattrapage des commandes.
 */
@CommandHandler(CreditPendingWelcomeBonusesCommand)
export class CreditPendingWelcomeBonusesHandler implements ICommandHandler<
  CreditPendingWelcomeBonusesCommand,
  PendingWelcomeBonusesReport
> {
  constructor(
    private readonly candidates: WelcomeCandidateReader,
    private readonly settings: LoyaltySettingsReader,
    private readonly crediting: WelcomeBonusCrediting,
  ) {}

  async execute(): Promise<PendingWelcomeBonusesReport> {
    const settings = await this.settings.read();
    const since = settings?.welcomeBonusSince ?? null;
    if (
      settings === null ||
      !settings.openToPublic ||
      settings.welcomeBonusPoints === null ||
      since === null
    ) {
      return NOTHING;
    }
    let after: string | null = null;
    let scanned = 0;
    let credited = 0;
    do {
      const page = await this.candidates.listPending(since, after, WELCOME_BATCH);
      for (const userId of page.userIds) {
        if (await this.crediting.creditWelcomeBonus(userId, settings)) {
          credited += 1;
        }
      }
      scanned += page.userIds.length;
      after = page.nextAfter;
    } while (after !== null);
    return { scanned, credited };
  }
}
