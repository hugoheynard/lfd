import { silentLogger } from "./types.js";
import type {
  Mailer,
  MailerLogger,
  MailReceipt,
  SendMailArgs,
  TemplateMap,
  TemplateRegistry,
} from "./types.js";

/**
 * Adaptateur **à blanc** : il rend l'e-mail, le journalise, et ne l'envoie pas.
 *
 * Actif dès qu'aucune clé de fournisseur n'est configurée — développement local,
 * CI, tout environnement où un envoi sortant serait du bruit. `enabled` vaut
 * `false`, ce qui permet à un appelant de le savoir.
 *
 * Il **rend quand même** le gabarit : c'est ce qui fait qu'une erreur de gabarit
 * se voit en local, et pas le jour où la clé arrive.
 */
export class DryRunMailer<M extends TemplateMap> implements Mailer<M> {
  readonly enabled = false;

  constructor(
    private readonly registry: TemplateRegistry<M>,
    private readonly log: MailerLogger = silentLogger,
  ) {
    this.log.warn(
      "Aucune clé Resend configurée — le mailer tourne à blanc : les e-mails sont journalisés, jamais envoyés.",
    );
  }

  send<K extends keyof M>(args: SendMailArgs<M, K>): Promise<MailReceipt> {
    const { subject, attachments } = this.registry[args.template](args.data);
    this.log.info("E-mail à blanc", {
      template: String(args.template),
      to: args.to,
      subject,
      // Le NOMBRE, pas le contenu : une image en base64 dans un journal le rend
      // illisible, et c'est sa présence qu'on veut pouvoir vérifier — un
      // gabarit qui cesse de joindre son QR ne lève aucune erreur.
      attachments: attachments?.length ?? 0,
    });
    // Aucun identifiant : rien n'est parti. En inventer un donnerait une clé
    // qui ne correspondra jamais à un événement de webhook.
    return Promise.resolve({ providerId: null });
  }
}
