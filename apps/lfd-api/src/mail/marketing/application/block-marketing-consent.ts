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
import { MarketingPartnersNotOfferedError } from "../domain/errors/marketing-preference.errors.js";
import { MarketingGroup } from "../domain/services/marketing-group.js";
import { MarketingAddressMover } from "./services/marketing-address-mover.js";
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
    private readonly mover: MarketingAddressMover,
    private readonly group: MarketingGroup,
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

  async resubscribe(
    space: MailSpace,
    address: string,
    consent: MarketingConsentRequest,
  ): Promise<void> {
    const at = this.clock.now();
    const target = this.addresses.of(address);
    await this.uow.run(() => this.requester.resubscribe(space, target, consent, at));
  }

  async requestPartners(
    from: MailSpace,
    address: string,
    consent: MarketingConsentRequest,
  ): Promise<void> {
    if (!this.group.isOffered()) {
      throw new MarketingPartnersNotOfferedError();
    }
    const at = this.clock.now();
    const target = this.addresses.of(address);
    const partners = this.group.partnersOf(from);
    await this.uow.run(async () => {
      for (const space of partners) {
        await this.requester.request(space, target, consent, at, "partners");
      }
    });
  }

  partnersOffered(): boolean {
    return this.group.isOffered();
  }

  async askable(space: MailSpace, address: string): Promise<boolean> {
    return (await this.preferenceOf(space, address)) === null;
  }

  async moveAddress(space: MailSpace | null, from: string, to: string): Promise<void> {
    const at = this.clock.now();
    const [old, next] = [this.addresses.of(from), this.addresses.of(to)];
    await this.uow.run(() => this.mover.move(space, old, next, at));
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
