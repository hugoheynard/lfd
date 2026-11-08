import type { MailSpace } from "@lfd/mail-blocks";
import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { MarketingConsent } from "../../channels/marketing/marketing-consent.js";
import { MarketingPreferenceReader } from "../domain/ports/marketing-preference.reader.js";
import type {
  MarketingStatus,
  UnsubscribeSource,
} from "../domain/value-objects/marketing-vocabulary.js";
import { MarketingAddresses } from "./services/marketing-addresses.js";
import { MarketingUnsubscriber } from "./services/marketing-unsubscriber.js";

/**
 * L'implémentation du canal par le bloc : la même désinscription que la
 * page publique ({@link MarketingUnsubscriber}), la même empreinte.
 */
@Injectable()
export class BlockMarketingConsent extends MarketingConsent {
  constructor(
    private readonly addresses: MarketingAddresses,
    private readonly unsubscriber: MarketingUnsubscriber,
    private readonly reader: MarketingPreferenceReader,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {
    super();
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
