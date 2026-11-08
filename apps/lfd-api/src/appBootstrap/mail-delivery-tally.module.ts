import { Global, Module } from "@nestjs/common";

import { BlockMailDeliveryTally } from "../mail/requests/application/block-mail-delivery-tally.js";
import { MailDeliveryTally } from "../platform/mailer/delivery-tally/mail-delivery-tally.js";

/**
 * **Le suivi des e-mails, relié à la carte de santé**
 * (`documentation/mail/le-suivi-des-e-mails.md`, T1b) : `platform` déclare
 * le port, le bloc `mail` le sert sur `mail.mail_request`, et seule la racine
 * voit les deux. `@Global` : le port est injecté par le module d'`ops`, qui
 * ne peut importer aucun bloc ; `MailModule`, global, sert l'implémentation.
 */
@Global()
@Module({
  providers: [{ provide: MailDeliveryTally, useExisting: BlockMailDeliveryTally }],
  exports: [MailDeliveryTally],
})
export class MailDeliveryTallyModule {}
