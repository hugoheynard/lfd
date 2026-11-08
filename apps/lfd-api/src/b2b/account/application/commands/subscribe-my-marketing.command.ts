import type { MarketingConsentSpace } from "@lfd/contracts";
import type { MailLocale } from "@lfd/mail-blocks";

/**
 * « Mes préférences » : s'inscrire aux offres d'une société, ou s'y
 * RÉINSCRIRE après une désinscription — le seul geste qui le permet (plan de
 * désinscription, règle 13, C3). L'adresse et sa preuve viennent du
 * principal, jamais du corps.
 */
export class SubscribeMyMarketingCommand {
  constructor(
    readonly userId: string,
    readonly address: string,
    readonly addressProven: boolean,
    readonly space: MarketingConsentSpace,
    readonly textVersion: string,
    readonly locale: MailLocale,
  ) {}
}
