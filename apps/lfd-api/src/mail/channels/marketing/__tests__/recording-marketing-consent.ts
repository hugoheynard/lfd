import type { MailSpace } from "@lfd/mail-blocks";

import {
  MarketingConsent,
  type MarketingConsentRequest,
  type MarketingStatus,
  type UnsubscribeSource,
} from "../marketing-consent.js";

/** Un appel au canal, tel que le double l'a reçu. */
export type MarketingCall =
  | {
      readonly kind: "request" | "resubscribe" | "partners";
      readonly space: MailSpace;
      readonly address: string;
      readonly consent: MarketingConsentRequest;
    }
  | {
      readonly kind: "move";
      readonly space: MailSpace | null;
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly kind: "unsubscribe";
      readonly space: MailSpace;
      readonly address: string;
      readonly source: UnsubscribeSource;
    };

/**
 * Le canal du registre, doublé pour les blocs qui l'appellent : il garde
 * chaque appel, et répond l'état que le test a posé par `(espace, adresse)`.
 * Le registre lui-même s'éprouve dans le bloc `mail`.
 */
export class RecordingMarketingConsent extends MarketingConsent {
  readonly calls: MarketingCall[] = [];
  /** Ce que {@link partnersOffered} répond ; éteint, comme en production. */
  offersPartners = false;
  private readonly states = new Map<string, MarketingStatus>();

  /** Pose l'état que le canal répondra pour cette adresse. */
  given(space: MailSpace, address: string, status: MarketingStatus): this {
    this.states.set(`${space}|${address.toLowerCase()}`, status);
    return this;
  }

  request(space: MailSpace, address: string, consent: MarketingConsentRequest): Promise<void> {
    this.calls.push({ kind: "request", space, address, consent });
    return Promise.resolve();
  }

  resubscribe(space: MailSpace, address: string, consent: MarketingConsentRequest): Promise<void> {
    this.calls.push({ kind: "resubscribe", space, address, consent });
    return Promise.resolve();
  }

  requestPartners(
    from: MailSpace,
    address: string,
    consent: MarketingConsentRequest,
  ): Promise<void> {
    this.calls.push({ kind: "partners", space: from, address, consent });
    return Promise.resolve();
  }

  partnersOffered(): boolean {
    return this.offersPartners;
  }

  async askable(space: MailSpace, address: string): Promise<boolean> {
    return (await this.preferenceOf(space, address)) === null;
  }

  moveAddress(space: MailSpace | null, from: string, to: string): Promise<void> {
    this.calls.push({ kind: "move", space, from, to });
    return Promise.resolve();
  }

  unsubscribe(space: MailSpace, address: string, source: UnsubscribeSource): Promise<void> {
    this.calls.push({ kind: "unsubscribe", space, address, source });
    return Promise.resolve();
  }

  preferenceOf(space: MailSpace, address: string): Promise<MarketingStatus | null> {
    return Promise.resolve(this.states.get(`${space}|${address.toLowerCase()}`) ?? null);
  }
}
