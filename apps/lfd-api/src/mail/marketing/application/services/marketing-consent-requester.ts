import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { MarketingConsentRequest } from "../../../channels/marketing/marketing-consent.js";
import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import { MarketingPreference } from "../../domain/entities/marketing-preference.js";
import type { ConsentDraft } from "../../domain/entities/marketing-preference-state.js";
import { MarketingPreferenceRepository } from "../../domain/ports/marketing-preference.repository.js";
import type { MarketingAddress } from "../../domain/value-objects/marketing-address.js";
import { ConsentConfirmationMailer } from "./consent-confirmation-mailer.js";

/**
 * **La demande d'accord, une fois écrite** (plan de désinscription, règles
 * 17, 18, 20) — à appeler dans une unité de travail : la ligne et l'e-mail
 * de confirmation tombent ensemble.
 *
 * L'origine est `direct` : la case « partenaires » (C3) n'existe pas encore,
 * et le mécanisme du groupe est éteint (règle 19).
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
  ): Promise<void> {
    const draft: ConsentDraft = {
      proof: {
        textVersion: consent.textVersion,
        locale: consent.locale,
        place: consent.where,
        ref: consent.ref,
      },
      origin: "direct",
      at,
    };
    const known = await this.preferences.load(space, address.print);
    if (known === null) {
      await this.first(space, address, draft, consent);
      return;
    }
    // Accepté, désinscrit, ou en attente d'une adresse non vérifiée : rien.
    // Une désinscription éteint la question pour toujours (règle 17).
    if (known.isPending() && consent.verified) {
      known.confirm(at);
      await this.preferences.save(known);
    }
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
