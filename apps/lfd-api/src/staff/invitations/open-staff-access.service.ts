import { Inject, Injectable, Logger } from "@nestjs/common";

import { isOutsideDatabaseConnection } from "../../platform/auth/auth0-claims.js";
import { IdentitySubjectUnknownError } from "../../platform/shared/errors/identity-errors.js";
import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { Journal } from "../../platform/journal/journal.js";
import { Clock } from "../../platform/time/clock.js";
import { MAILER, type B2bMailer } from "../../platform/mailer/mailer.tokens.js";
import { StaffIdentityPort } from "./staff-identity.port.js";
import { StaffAccessCache } from "../permissions/staff-access-cache.port.js";
import { staffUserInvitedFact } from "../directory/domain/staff-facts.js";
import { SuspendedStaffInviteError } from "../directory/domain/staff-user-errors.js";
import {
  StaffUserRepository,
  type StaffIdentityFacts,
} from "../directory/domain/staff-user.repository.js";

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
 * L'ordre compte, et il a trois temps (plan `plan-journal-de-l-annuaire.md`
 * §5) :
 *
 * 1. on frappe le lien chez le fournisseur **d'abord** — un appel réseau, donc
 *    hors transaction ;
 * 2. `markInvited` et le fait `staff_user.invited` partent **ensemble** ;
 * 3. **puis** l'e-mail.
 *
 * Si le journal tombe, rien n'est écrit et **aucun e-mail ne part** : l'écran
 * dit l'échec, et un nouvel essai frappe un lien neuf. Jamais un e-mail envoyé
 * derrière un 500. Le cache d'accès est oublié après le commit, jamais dedans.
 */
@Injectable()
export class OpenStaffAccess {
  private readonly logger = new Logger(OpenStaffAccess.name);

  constructor(
    private readonly staff: StaffUserRepository,
    private readonly identities: StaffIdentityPort,
    private readonly clock: Clock,
    @Inject(MAILER) private readonly mailer: B2bMailer,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
    private readonly cache: StaffAccessCache,
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
    const kind = target.status === "active" ? "password_reset" : "invitation";
    const template = kind === "password_reset" ? "staff.password-reset" : "staff.invited";
    await this.uow.run(async () => {
      await this.staff.markInvited(target.id, subject, this.clock.now());
      await this.journal.append(staffUserInvitedFact(target.id, target, kind));
    });
    this.cache.forgetAll();

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
   *
   * 🔴 C'est aussi **la sortie** d'une fiche liée à un `sub` que l'accès staff
   * refuse désormais (2026-09-17) : un `sub` mort — identité supprimée puis
   * recréée — ou hors connexion base de données — un membre entré par Google.
   * L'accès ne relie plus une fiche liée par son adresse ; sans ce rattrapage,
   * le renvoi réclamait un lien pour ce `sub` et rendait un 500 à chaque clic.
   * On rouvre donc par l'adresse, et `markInvited` relie la fiche au `sub`
   * rendu. Le lien part à l'adresse de la fiche : le suivre prouve la boîte.
   */
  private async openIdentity(
    target: StaffIdentityFacts,
  ): Promise<{ subject: string; passwordSetupUrl: string }> {
    if (target.auth0Id === null || isOutsideDatabaseConnection(target.auth0Id)) {
      return await this.reopen(target);
    }
    try {
      return {
        subject: target.auth0Id,
        passwordSetupUrl: await this.identities.issuePasswordLink(target.auth0Id),
      };
    } catch (error) {
      if (!(error instanceof IdentitySubjectUnknownError)) {
        throw error;
      }
      this.logger.warn(`Sujet d'identité périmé pour la fiche ${target.id} — réouverture.`);
      return await this.reopen(target);
    }
  }

  private async reopen(
    target: StaffIdentityFacts,
  ): Promise<{ subject: string; passwordSetupUrl: string }> {
    return await this.identities.provision({
      email: target.email,
      firstName: target.firstName,
      lastName: target.lastName,
    });
  }
}
