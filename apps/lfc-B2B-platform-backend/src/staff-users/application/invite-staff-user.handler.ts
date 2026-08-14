import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { Inject, Logger } from "@nestjs/common";

import { Clock } from "../../infra/time/clock.js";
import { MAILER, type B2bMailer } from "../../infra/mailer/mailer.module.js";
import { StaffIdentityPort } from "../domain/staff-identity.port.js";
import { SuspendedStaffInviteError } from "../domain/staff-user-errors.js";
import { StaffUserRepository, type StaffIdentityFacts } from "../domain/staff-user.repository.js";
import { InviteStaffUserCommand } from "./staff-user.commands.js";

/** Ce que l'invitation rapporte : seulement ce que l'écran ne peut pas deviner. */
export interface StaffInvited {
  /** Faux si l'e-mail n'est pas parti — le lien se remet alors à la main. */
  readonly mailSent: boolean;
}

/**
 * Invite un membre de l'équipe — ou lui **renvoie** un lien, c'est le même
 * geste.
 *
 * Une seule commande pour les deux, et ce n'est pas de la paresse : « inviter »
 * et « renvoyer » ne diffèrent que par l'existence préalable d'une identité, ce
 * que le serveur sait déjà. En faire deux endpoints obligerait l'écran à
 * deviner lequel appeler, et il se tromperait le jour où quelqu'un ouvre deux
 * onglets.
 *
 * L'ordre des opérations compte : on frappe le lien **d'abord**, on écrit
 * ensuite. Écrire « invitée » puis échouer à envoyer laisserait une fiche qui
 * annonce un lien que personne n'a reçu.
 *
 * Rend `mailSent`, comme son homologue client. Il rendait `void` : le mailer à
 * blanc ne lève pas — il rend le gabarit, le journalise et n'envoie rien — donc
 * le handler n'avait rien à signaler, le contrôleur répondait 204, et l'écran
 * annonçait une invitation partie à quelqu'un qui n'attendrait jamais rien.
 */
@CommandHandler(InviteStaffUserCommand)
export class InviteStaffUserHandler implements ICommandHandler<
  InviteStaffUserCommand,
  StaffInvited
> {
  constructor(
    private readonly staff: StaffUserRepository,
    private readonly identities: StaffIdentityPort,
    private readonly clock: Clock,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  private readonly logger = new Logger(InviteStaffUserHandler.name);

  async execute(command: InviteStaffUserCommand): Promise<StaffInvited> {
    const target = await this.staff.identityOf(command.id);
    if (target.status === "suspended") {
      throw new SuspendedStaffInviteError();
    }

    const { subject, passwordSetupUrl } = await this.openAccess(target);
    await this.staff.markInvited(target.id, subject, this.clock.now());

    // Le lien ne sort d'ici que par cette adresse-là. Il vaut prise de contrôle
    // du compte : ni journal, ni réponse HTTP, ni écran de celui qui invite.
    // Quand le canal est muet, c'est la FILE des accès à remettre qui prend le
    // relais — elle en fabrique un neuf à la demande, sans jamais le stocker.
    return { mailSent: await this.deliver(target.email, passwordSetupUrl, target.firstName) };
  }

  /**
   * Envoie, et dit si c'est **vraiment** parti.
   *
   * Sans clé de fournisseur, le mailer tourne « à blanc » : il rend le gabarit,
   * le journalise, et résout sans erreur. Répondre `true` ici ferait annoncer
   * une invitation envoyée à quelqu'un qui n'attendra jamais rien — c'est
   * exactement ce que faisait le `void` d'avant.
   */
  private async deliver(to: string, passwordSetupUrl: string, firstName: string): Promise<boolean> {
    try {
      await this.mailer.send({
        to,
        template: "staff.invited",
        data: { firstName, passwordSetupUrl },
      });
      return this.mailer.enabled;
    } catch (error) {
      this.logger.error(`Invitation non envoyée à ${to}`, error);
      return false;
    }
  }

  /**
   * Première invitation ou renvoi : on ouvre l'identité si elle n'existe pas,
   * sinon on se contente d'un lien neuf.
   *
   * `provision` est de toute façon idempotent sur l'adresse — ce test évite
   * surtout un aller-retour réseau inutile sur le cas courant du renvoi.
   */
  private async openAccess(
    target: StaffIdentityFacts,
  ): Promise<{ subject: string; passwordSetupUrl: string }> {
    if (target.auth0Id !== null) {
      return {
        subject: target.auth0Id,
        passwordSetupUrl: await this.identities.issuePasswordLink(target.auth0Id),
      };
    }
    return await this.identities.provision({
      email: target.email,
      firstName: target.firstName,
      lastName: target.lastName,
    });
  }
}
