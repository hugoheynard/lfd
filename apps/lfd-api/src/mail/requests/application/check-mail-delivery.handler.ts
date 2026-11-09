import {
  MAIL_SPACES,
  senderHeaderOf,
  type MailSenderIdentity,
  type MailSpace,
} from "@lfd/mail-blocks";
import { Optional } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AppConfig } from "../../../platform/config/app-config.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Mail } from "../../channels/requests/mail.js";
import { PublishedMailCopyReader } from "../../templates/effective-copy/published-mail-copy.reader.js";
import { mailSpaceOf } from "../../templates/sections/mail-block-declarations.js";
import { withMailSender } from "../../templates/sections/mail-sender-scope.js";
import { CheckMailDeliveryCommand, type MailCheckResult } from "./check-mail-delivery.command.js";
import { DeferredMailCheck } from "./deferred-mail-check.service.js";

/**
 * **La sonde de déploiement du courrier**, par la porte du bloc, en `sendAndAwaitReceipt`.
 *
 * Elle répond à un défaut structurel du mailer, décrit dans
 * `documentation/ops/mailer-resend.md` : **il ne tombe jamais en panne
 * visible**. Sans clé il journalise et rend la main ; avec une clé mais un
 * expéditeur sur un domaine non vérifié, le fournisseur refuse et personne ne
 * regarde. Un canal mal configuré ressemble exactement à un canal qui marche.
 *
 * **Pourquoi dans le bloc `mail`** (lot S2h, `plan-service-e-mails.md`, § 18).
 * Elle vivait à côté du mailer, dans `platform/`, « pour qu'on ne la déplace
 * pas sans voir ce qu'elle teste ». Depuis S2, tout e-mail passe par le bloc :
 * une sonde qui le contournerait resterait verte avec un bloc cassé (schéma
 * `mail` absent, suivi qui n'écrit plus). Par `sendAndAwaitReceipt`, elle éprouve la même
 * chaîne qu'avant — `RUNTIME_KEYS` → `envVars` → `AppConfig` → le mailer →
 * Resend — plus le bloc. Et `platform` n'a le droit d'importer aucun bloc.
 *
 * **L'expéditeur configuré, pas une adresse en dur** : une adresse codée ici
 * prouverait que le DOMAINE fonctionne, pas que `MAILER_FROM_ADDRESS` est
 * juste (le cas du 2026-08-16). **Le destinataire est l'admin de secours**
 * (`BOOTSTRAP_ADMIN_EMAIL`), déjà configuré et déjà transmis au container.
 *
 * **Les deux chemins** (lot S8, § 25) : l'immédiat éprouve la configuration,
 * le différé ({@link DeferredMailCheck}) la chaîne que suivent presque tous
 * nos e-mails — boîte d'envoi, relais, abonné. Un déploiement qui n'éprouvait
 * que le premier pouvait être vert avec un courrier client resté « demandé ».
 *
 * **L'identité de chaque espace** (plan `plan-editeur-par-blocs.md`, § 25,
 * C3) : la sonde part sous l'identité de son propre espace (`lfd`, ou celle
 * de la configuration s'il n'en a pas), puis une fois de plus, sur-le-champ,
 * sous l'identité de chaque AUTRE espace qui en a une. Un domaine retiré de
 * Resend fait donc échouer le déploiement, pas le premier e-mail client.
 *
 * L'échec **remonte**, donc l'étape de déploiement échoue : un contrôle qui
 * journalise sans rien casser est ignoré en trois semaines.
 *
 * @sans-journal geste machine du déploiement ; le suivi du bloc porte l'envoi.
 */
@CommandHandler(CheckMailDeliveryCommand)
export class CheckMailDeliveryHandler implements ICommandHandler<
  CheckMailDeliveryCommand,
  MailCheckResult
> {
  constructor(
    private readonly mail: Mail,
    private readonly config: AppConfig,
    private readonly ids: IdGenerator,
    private readonly deferred: DeferredMailCheck,
    @Optional() private readonly published?: PublishedMailCopyReader,
  ) {}

  async execute(): Promise<MailCheckResult> {
    // La révision vient de l'IMAGE, jamais de l'appelant : celle qu'on nous
    // soufflerait pourrait désigner un déploiement que ce container ne sert
    // pas, et l'e-mail attesterait alors d'une version qui ne l'a pas envoyé.
    const revision = this.config.revision();
    const to = this.config.bootstrapAdminEmail();
    const callKey = `ops.deploy-check:${revision}:${this.ids.next()}`;
    const identities = await this.identities();
    const own = identities.get(mailSpaceOf("ops.deploy-check"));
    const from = own === undefined ? this.config.mailerConfig().fromAddress : senderHeaderOf(own);

    await this.mail.sendAndAwaitReceipt({
      to,
      template: "ops.deploy-check",
      data: { revision, fromAddress: from },
      // Une clé par APPEL : deux déploiements de la même révision doivent
      // produire deux e-mails. Une clé par révision rendrait le reçu du
      // premier, et ferait passer pour un succès un courrier tombé depuis.
      idempotencyKey: callKey,
    });
    const others = [...identities].filter(([space]) => space !== mailSpaceOf("ops.deploy-check"));
    for (const [space, identity] of others) {
      await withMailSender(identity, () =>
        this.mail.sendAndAwaitReceipt({
          to,
          template: "ops.deploy-check",
          data: { revision, fromAddress: senderHeaderOf(identity) },
          idempotencyKey: `${callKey}:${space}`,
        }),
      );
    }
    await this.deferred.run({ revision, from, to, idempotencyKey: `${callKey}:deferred` });

    const senderSpaces = MAIL_SPACES.filter((space) => identities.has(space));
    return { sent: true, immediate: "sent", deferred: "sent", from, to, revision, senderSpaces };
  }

  /**
   * Les identités rangées des espaces, lues comme l'envoi les lit. Illisibles,
   * la sonde lève : un déploiement ne doit pas passer sur un espace dont on
   * ne sait pas sous quelle identité il écrit.
   */
  private async identities(): Promise<ReadonlyMap<MailSpace, MailSenderIdentity>> {
    if (this.published === undefined) {
      return new Map();
    }
    // Les identités transactionnelles seules : la sonde atteste le courrier
    // de service ; une identité marketing n'est pas éprouvée ici (lot U5).
    const senders = (await this.published.senders()).transactional;
    return new Map(
      MAIL_SPACES.flatMap((space) => {
        const entry = senders[space];
        return entry?.kind === "servable" ? [[space, entry.identity] as const] : [];
      }),
    );
  }
}
