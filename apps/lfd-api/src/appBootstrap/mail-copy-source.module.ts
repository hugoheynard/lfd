import { Global, Module } from "@nestjs/common";

import { MailCopyModule } from "../b2b/mail-copy/mail-copy.module.js";
import { CachedPublishedMailCopyReader } from "../b2b/mail-copy/infrastructure/cached-published-mail-copy.reader.js";
import { PublishedMailCopyReader } from "../platform/mailer/effective-copy/published-mail-copy.reader.js";

/**
 * **Les textes d'e-mails publiés, reliés au mailer** (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, E2). Un
 * module dont c'est le seul objet : brancher le port que le mailer déclare
 * (`platform/`) sur le cache que le contexte des textes tient (`b2b/mail-copy`).
 *
 * Même forme que `StaffAccessModule` : seule la racine de composition a le
 * droit de voir les deux côtés. `@Global` parce que le mailer est global et
 * se résout dans son propre module, qui ne peut importer aucun contexte.
 *
 * `useExisting`, JAMAIS `useClass` : « Publier » oublie le cache de CETTE
 * instance ; deux instanciations donneraient deux caches, et le mailer
 * enverrait l'ancien texte jusqu'à la relecture de la version.
 */
@Global()
@Module({
  imports: [MailCopyModule],
  providers: [{ provide: PublishedMailCopyReader, useExisting: CachedPublishedMailCopyReader }],
  exports: [PublishedMailCopyReader],
})
export class MailCopySourceModule {}
