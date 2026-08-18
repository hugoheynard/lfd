import { Inject, Injectable, Logger } from "@nestjs/common";

import { Clock } from "../../infra/time/clock.js";
import { MAILER, type B2bMailer } from "../../infra/mailer/mailer.tokens.js";
import { StaffIdentityPort } from "../domain/staff-identity.port.js";
import { SuspendedStaffInviteError } from "../domain/staff-user-errors.js";
import { StaffUserRepository, type StaffIdentityFacts } from "../domain/staff-user.repository.js";

/** Ce que l'ouverture rapporte : seulement ce que l'écran ne peut pas deviner. */
export interface StaffAccessOpened {
  /** Faux si l'e-mail n'est pas parti — le lien se remet alors à la main. */
  readonly mailSent: boolean;
}

/**
 * **Ouvrir l'accès d'un membre de l'équipe** : identité chez le fournisseur,
 * lien de mot de passe, e-mail.
 *
 * Extrait du handler d'invitation le jour où la **création** a dû l'ouvrir
 * aussi. Un service plutôt qu'un handler qui en appelle un autre : c'est déjà
 * la forme retenue côté client (`AccountAccessGranter`, injecté par trois
 * handlers), et un bus qui se rappelle lui-même rend le chemin d'exécution
 * illisible dès la première panne.
 *
 * « Inviter » et « renvoyer un lien » restent le même geste : ils ne diffèrent
 * que par l'existence préalable d'une identité, ce que le serveur sait déjà.
 *
 * L'ordre compte : on frappe le lien **d'abord**, on écrit ensuite. Écrire
 * « invitée » puis échouer à envoyer laisserait une fiche qui annonce un lien
 * que personne n'a reçu.
 */
@Injectable()
export class OpenStaffAccess {
  private readonly logger = new Logger(OpenStaffAccess.name);

  constructor(
    private readonly staff: StaffUserRepository,
    private readonly identities: StaffIdentityPort,
    private readonly clock: Clock,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  async open(staffUserId: string): Promise<StaffAccessOpened> {
    const target = await this.staff.identityOf(staffUserId);
    if (target.status === "suspended") {
      throw new SuspendedStaffInviteError();
    }

    const { subject, passwordSetupUrl } = await this.openIdentity(target);
    // Le gabarit suit l'ÉTAT, pas le geste : « bienvenue dans l'équipe » à
    // quelqu'un qui travaille ici depuis six mois est au mieux troublant, au
    // pire une raison de croire à un hameçonnage et de ne pas cliquer.
    const template = target.status === "active" ? "staff.password-reset" : "staff.invited";
    await this.staff.markInvited(target.id, subject, this.clock.now());

    // Le lien ne sort d'ici que par cette adresse-là. Il vaut prise de contrôle
    // du compte : ni journal, ni réponse HTTP, ni écran de celui qui invite.
    return {
      mailSent: await this.deliver(template, target.email, passwordSetupUrl, target.firstName),
    };
  }

  /**
   * Envoie, et dit si c'est **vraiment** parti.
   *
   * Sans clé de fournisseur, le mailer tourne « à blanc » : il rend le gabarit,
   * le journalise, et résout sans erreur. Répondre `true` ici ferait annoncer
   * une invitation envoyée à quelqu'un qui n'attendra jamais rien.
   */
  private async deliver(
    template: "staff.invited" | "staff.password-reset",
    to: string,
    passwordSetupUrl: string,
    firstName: string,
  ): Promise<boolean> {
    try {
      await this.mailer.send({ to, template, data: { firstName, passwordSetupUrl } });
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
  private async openIdentity(
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
