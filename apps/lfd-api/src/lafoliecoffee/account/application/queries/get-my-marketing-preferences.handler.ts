import {
  MARKETING_CONSENT_SPACES,
  type MarketingConsentSpace,
  type MarketingPreferenceState,
  type MyMarketingPreferencesView,
  type MyMarketingSpaceView,
} from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import {
  MarketingConsent,
  type MarketingStatus,
} from "../../../../mail/channels/marketing/marketing-consent.js";
import { GetMyMarketingPreferencesQuery } from "./get-my-marketing-preferences.query.js";

/** L'état du registre, dit comme l'écran le montre. */
const STATE_OF: Readonly<Record<MarketingStatus, MarketingPreferenceState>> = {
  accepted: "subscribed",
  pending: "pending",
  unsubscribed: "unsubscribed",
};

/**
 * L'état de l'adresse du compte pour chaque société de la boutique. `askable`
 * ne vaut que sans ligne : une désinscription éteint la question pour
 * toujours, une demande en attente aussi (le lien envoyé vaut encore).
 */
@QueryHandler(GetMyMarketingPreferencesQuery)
export class GetMyMarketingPreferencesHandler implements IQueryHandler<
  GetMyMarketingPreferencesQuery,
  MyMarketingPreferencesView
> {
  constructor(private readonly marketing: MarketingConsent) {}

  async execute({ address }: GetMyMarketingPreferencesQuery): Promise<MyMarketingPreferencesView> {
    const spaces = await Promise.all(
      MARKETING_CONSENT_SPACES.map((space) => this.spaceView(space, address)),
    );
    return { spaces, partnersOffered: this.marketing.partnersOffered() };
  }

  private async spaceView(
    space: MarketingConsentSpace,
    address: string,
  ): Promise<MyMarketingSpaceView> {
    // Un compte sans adresse n'a rien au registre, et rien à qui écrire.
    if (address === "") {
      return { space, state: "not_subscribed", askable: false };
    }
    const status = await this.marketing.preferenceOf(space, address);
    return status === null
      ? { space, state: "not_subscribed", askable: true }
      : { space, state: STATE_OF[status], askable: false };
  }
}
