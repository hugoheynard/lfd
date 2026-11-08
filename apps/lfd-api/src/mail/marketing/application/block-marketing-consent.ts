import type { MailSpace } from "@lfd/mail-blocks";
import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  MarketingConsent,
  type MarketingConsentRequest,
} from "../../channels/marketing/marketing-consent.js";
import { MarketingPreferenceReader } from "../domain/ports/marketing-preference.reader.js";
import type {
  MarketingStatus,
  UnsubscribeSource,
} from "../domain/value-objects/marketing-vocabulary.js";
import { MarketingAddresses } from "./services/marketing-addresses.js";
import { MarketingConsentRequester } from "./services/marketing-consent-requester.js";
import { MarketingUnsubscriber } from "./services/marketing-unsubscriber.js";

/**
 * L'implémentation du canal par le bloc : la même désinscription que la
 * page publique ({@link MarketingUnsubscriber}), la même empreinte ; la
 * demande d'accord ({@link MarketingConsentRequester}) dans SA transaction
 * (règle 21) — l'e-mail de confirmation part après sa validation.
 */
@Injectable()
export class BlockMarketingConsent extends MarketingConsent {
  constructor(
    private readonly addresses: MarketingAddresses,
    private readonly unsubscriber: MarketingUnsubscriber,
    private readonly requester: MarketingConsentRequester,
    private readonly reader: MarketingPreferenceReader,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {
    super();
  }

  async request(
    space: MailSpace,
    address: string,
    consent: MarketingConsentRequest,
  ): Promise<void> {
    const at = this.clock.now();
    const target = this.addresses.of(address);
    await this.uow.run(() => this.requester.request(space, target, consent, at));
  }

  async unsubscribe(space: MailSpace, address: string, source: UnsubscribeSource): Promise<void> {
    const at = this.clock.now();
    const target = this.addresses.of(address);
    await this.uow.run(() => this.unsubscriber.unsubscribe(space, target, { at, source }));
  }

  preferenceOf(space: MailSpace, address: string): Promise<MarketingStatus | null> {
    return this.reader.statusOf(space, this.addresses.of(address).print);
  }
}
