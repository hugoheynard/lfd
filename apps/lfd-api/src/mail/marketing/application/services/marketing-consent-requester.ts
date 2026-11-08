import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { MarketingConsentRequest } from "../../../channels/marketing/marketing-consent.js";
import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import { MarketingPreference } from "../../domain/entities/marketing-preference.js";
import type { ConsentDraft } from "../../domain/entities/marketing-preference-state.js";
import type { ConsentOrigin } from "../../domain/value-objects/marketing-vocabulary.js";
import { MarketingPreferenceRepository } from "../../domain/ports/marketing-preference.repository.js";
import type { MarketingAddress } from "../../domain/value-objects/marketing-address.js";
import { ConsentConfirmationMailer } from "./consent-confirmation-mailer.js";

/**
 * **La demande d'accord, une fois écrite** (plan de désinscription, règles
 * 17, 18, 20) — à appeler dans une unité de travail : la ligne et l'e-mail
 * de confirmation tombent ensemble.
 *
 * L'origine est `direct`, sauf pour la case « partenaires » (règle 20), dont
 * le mécanisme est bâti et éteint (règle 19).
 */
@Injectable()
export class MarketingConsentRequester {
  constructor(
    private readonly preferences: MarketingPreferenceRepository,
    private readonly confirmations: ConsentConfirmationMailer,
    private readonly ids: IdGenerator,
  ) {}

  async request(
    space: MailBrandCode,
    address: MarketingAddress,
    consent: MarketingConsentRequest,
    at: Date,
    origin: ConsentOrigin = "direct",
  ): Promise<void> {
    const draft = draftOf(consent, at, origin);
    const known = await this.preferences.load(space, address.print);
    if (known === null) {
      await this.first(space, address, draft, consent);
      return;
    }
    // Accepté, désinscrit, ou en attente d'une adresse non vérifiée : rien.
    // Une désinscription éteint la question pour toujours (règle 17) — y
    // compris une réinscription en attente, que seul son lien confirme.
    if (known.isPending() && !known.awaitsResubscription() && consent.verified) {
      known.confirm(at);
      await this.preferences.save(known);
    }
  }

  /**
   * **Le geste de « Mes préférences »** (C3, règle 13) : s'inscrire, ou se
   * RÉINSCRIRE — le seul geste qui lève une désinscription. Une adresse non
   * vérifiée reçoit l'e-mail de confirmation, et reste désinscrite jusqu'au
   * clic. Sur une autre ligne, c'est la demande ordinaire.
   */
  async resubscribe(
    space: MailBrandCode,
    address: MarketingAddress,
    consent: MarketingConsentRequest,
    at: Date,
  ): Promise<void> {
    const known = await this.preferences.load(space, address.print);
    if (known === null || !known.isUnsubscribed()) {
      await this.request(space, address, consent, at);
      return;
    }
    known.resubscribe(draftOf(consent, at, "direct"), consent.verified);
    if (known.isPending()) {
      this.confirmations.assertAvailable(known);
      await this.preferences.save(known);
      await this.confirmations.send(known, address, at, consent.locale);
      return;
    }
    await this.preferences.save(known);
  }

  private async first(
    space: MailBrandCode,
    address: MarketingAddress,
    draft: ConsentDraft,
    consent: MarketingConsentRequest,
  ): Promise<void> {
    if (consent.verified) {
      await this.preferences.save(
        MarketingPreference.accepted(this.ids.next(), space, address, draft),
      );
      return;
    }
    const pending = MarketingPreference.requested(this.ids.next(), space, address, draft);
    this.confirmations.assertAvailable(pending);
    await this.preferences.save(pending);
    await this.confirmations.send(pending, address, draft.at, consent.locale);
  }
}

function draftOf(consent: MarketingConsentRequest, at: Date, origin: ConsentOrigin): ConsentDraft {
  return {
    proof: {
      textVersion: consent.textVersion,
      locale: consent.locale,
      place: consent.where,
      ref: consent.ref,
    },
    origin,
    at,
  };
}
