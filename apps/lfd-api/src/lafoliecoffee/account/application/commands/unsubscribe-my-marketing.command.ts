import type { MarketingConsentSpace } from "@lfd/contracts";

/**
 * « Mes préférences » : se désinscrire des offres d'une société (plan de
 * désinscription, C3). L'adresse vient du principal.
 */
export class UnsubscribeMyMarketingCommand {
  constructor(
    readonly address: string,
    readonly space: MarketingConsentSpace,
  ) {}
}
