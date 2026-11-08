import type { MailLocale } from "@lfd/mail-blocks";
import { Injectable } from "@nestjs/common";

import { Mail } from "../../../channels/requests/mail.js";
import { mailSpaceOf } from "../../../templates/sections/mail-block-declarations.js";
import type { MarketingPreference } from "../../domain/entities/marketing-preference.js";
import { MarketingConfirmationUnavailableError } from "../../domain/errors/marketing-preference.errors.js";
import type { MarketingAddress } from "../../domain/value-objects/marketing-address.js";
import { ConsentConfirmLinks } from "./consent-confirm-links.js";

/** Le modèle de la double confirmation : transactionnel, espace `lfc`. */
const CONFIRM_TEMPLATE = "customer.marketing-confirm";

/**
 * **L'e-mail « Confirmez votre inscription »** d'une demande `pending`
 * (plan de désinscription, règle 18), demandé par la porte du bloc dans la
 * transaction de l'appelant : la ligne et l'e-mail tombent ensemble.
 *
 * La clé d'idempotence est l'identifiant de la LIGNE et l'instant de la
 * demande : une demande rejouée retrouve sa ligne et ne renvoie rien ; une
 * réinscription de la même ligne (C3) est une demande de plus, et son
 * e-mail part. Aucune adresse dans la clé.
 */
@Injectable()
export class ConsentConfirmationMailer {
  constructor(
    private readonly mail: Mail,
    private readonly links: ConsentConfirmLinks,
  ) {}

  /**
   * Vérifie AVANT toute écriture que l'espace sait confirmer : un seul
   * modèle de confirmation (celui de `lfc`), et une origine publique.
   *
   * @throws {MarketingConfirmationUnavailableError}
   */
  assertAvailable(preference: Pick<MarketingPreference, "space">): void {
    if (mailSpaceOf(CONFIRM_TEMPLATE) !== preference.space) {
      throw new MarketingConfirmationUnavailableError(preference.space);
    }
  }

  /** @throws {MarketingConfirmationUnavailableError} l'origine de l'espace manque. */
  async send(
    preference: MarketingPreference,
    address: MarketingAddress,
    issuedAt: Date,
    locale: MailLocale,
  ): Promise<void> {
    this.assertAvailable(preference);
    const confirmUrl = this.links.urlFor(preference.space, address.key, issuedAt);
    if (confirmUrl === null) {
      throw new MarketingConfirmationUnavailableError(preference.space);
    }
    await this.mail.send({
      template: CONFIRM_TEMPLATE,
      to: address.key,
      data: { confirmUrl, locale },
      idempotencyKey: `marketing.confirm:${preference.id}:${String(issuedAt.getTime())}`,
      // Aucun objet métier : la référence de l'acte est opaque et sans type.
      subjects: [],
    });
  }
}
