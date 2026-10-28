import { Global, Module } from "@nestjs/common";

import { ContactModule } from "../b2b/contact/contact.module.js";
import { ContactInboundMailSink } from "../b2b/contact/infrastructure/contact-inbound-mail.sink.js";
import { InboundMailSink } from "../platform/mailer/inbound/inbound-mail.sink.js";

/**
 * **Les e-mails reçus, reliés aux demandes clients** (plan
 * `documentation/demandes-client/plan-reponses-par-e-mail.md`, §3) : brancher
 * le port que le récepteur Resend déclare (`platform/`) sur l'implémentation
 * des demandes clients (`b2b/contact`).
 *
 * Même forme que `MailCopySourceModule` : seule la racine de composition voit
 * les deux côtés, et `@Global` parce que le récepteur vit dans le mailer
 * global, qui ne peut importer aucun contexte.
 */
@Global()
@Module({
  imports: [ContactModule],
  providers: [{ provide: InboundMailSink, useExisting: ContactInboundMailSink }],
  exports: [InboundMailSink],
})
export class InboundMailSinkModule {}
