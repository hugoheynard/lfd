import { Inject, Injectable, Logger } from "@nestjs/common";

import { MAILER, type B2bMailer } from "../../../infra/mailer/mailer.module.js";
import { AccountDisabledError } from "../../domain/errors/account-errors.js";
import {
  CompanyMemberRepository,
  type KnownAccount,
} from "../../domain/ports/company-member.repository.js";
import { CustomerIdentityPort } from "../../domain/ports/customer-identity.port.js";
import { ensureNoRivalOwner } from "../../domain/services/company-access.js";
import type { AccessOutcome } from "../../domain/value-objects/access-outcome.js";
import type { CompanyRole } from "../../domain/value-objects/company-role.js";

/** Qui rattacher, à quelle société, avec quel rôle. */
export interface AccessToGrant {
  readonly companyId: string;
  /** Le nom d'usage de la société, pour l'e-mail — pas pour décider. */
  readonly companyName: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly role: CompanyRole;
  /** Le `sub` du staff qui provisionne — trace, pas autorisation. */
  readonly invitedBy: string;
}

/** Ce qui s'est réellement passé — dit sans arrondir. */
export interface AccessGranted {
  readonly userId: string;
  /**
   * Laquelle des trois situations. **Reste au serveur** : elle choisit l'e-mail
   * qui part, elle ne remonte pas à l'écran (cf. `AccessOutcome`).
   */
  readonly outcome: AccessOutcome;
  /** Faux si l'e-mail n'est pas parti : le staff doit l'apprendre tout de suite. */
  readonly mailSent: boolean;
}

/**
 * Port d'**ouverture d'accès**, côté application.
 *
 * Abstrait plutôt que concret pour la raison habituelle : le handler dépend de
 * l'intention, pas de l'implémentation qui parle à Auth0 et au mailer — et un
 * test peut la doubler sans monter un fournisseur d'identité.
 */
export abstract class AccountAccessGranter {
  abstract grant(input: AccessToGrant): Promise<AccessGranted>;
}

/**
 * Ouvre un **accès** à l'espace d'une société.
 *
 * Trois situations derrière un seul geste, et c'est tout l'intérêt du service —
 * l'appelant ne peut pas les distinguer au moment où il saisit une adresse :
 *
 * - **personne inconnue** → identité provisionnée, lien de mot de passe envoyé ;
 * - **connue mais sans mot de passe** (`invited`) → **nouveau lien**. C'est
 *   l'état de tout compte ouvert pendant que l'e-mail ne partait pas ; le
 *   traiter comme un client installé lui écrirait « utilisez vos identifiants
 *   habituels » alors qu'il n'en a jamais eu ;
 * - **cliente active** → on **rattache** la société à son espace existant. Lui
 *   refabriquer une identité lui donnerait deux mots de passe pour une seule
 *   adresse.
 *
 * **Un e-mail qui ne part pas ne défait pas l'accès.** Le rattachement est en
 * base ; l'annuler pour un canal indisponible ferait perdre le travail du
 * commercial. On le dit (`mailSent`), on le journalise, et on continue — le
 * renvoi est un clic, et il renvoie vraiment quelque chose.
 */
@Injectable()
export class GrantAccountAccess extends AccountAccessGranter {
  private readonly logger = new Logger(GrantAccountAccess.name);

  constructor(
    private readonly members: CompanyMemberRepository,
    private readonly identity: CustomerIdentityPort,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {
    super();
  }

  async grant(input: AccessToGrant): Promise<AccessGranted> {
    const known = await this.members.findAccountByEmail(input.email);
    if (known === null) {
      return this.openNewAccess(input);
    }
    if (known.status === "disabled") {
      // Une désactivation est une décision : un clic sur « ouvrir l'accès » ne
      // la renverse pas au passage.
      throw new AccountDisabledError(input.email);
    }
    return known.status === "invited"
      ? this.reissueLink(known, input)
      : this.attachToActive(known, input);
  }

  /** Personne inconnue : identité neuve + lien de mot de passe. */
  private async openNewAccess(input: AccessToGrant): Promise<AccessGranted> {
    const provisioned = await this.identity.provision({
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
    });
    const userId = await this.members.createInvited({
      subject: provisioned.subject,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      invitedBy: input.invitedBy,
    });
    await this.attach(userId, input);
    return this.deliverLink(userId, "identity_created", provisioned.passwordSetupUrl, input);
  }

  /**
   * Connue, mais elle n'a **jamais** posé de mot de passe : on lui en émet un
   * nouveau lien. Un lien est à usage unique et daté — on n'en retrouve pas un,
   * on en fabrique un.
   */
  private async reissueLink(known: KnownAccount, input: AccessToGrant): Promise<AccessGranted> {
    const url = await this.identity.issuePasswordLink(known.subject);
    await this.attach(known.userId, input);
    // Son prénom à ELLE : celui qu'un commercial vient de taper n'a pas à la
    // renommer dans l'e-mail qu'elle reçoit.
    return this.deliverLink(known.userId, "link_reissued", url, {
      ...input,
      firstName: known.firstName,
    });
  }

  /** Cliente active : une société de plus dans son espace, pas un second compte. */
  private async attachToActive(known: KnownAccount, input: AccessToGrant): Promise<AccessGranted> {
    await this.attach(known.userId, input);
    const mailSent = await this.send(input.email, () =>
      this.mailer.send({
        to: input.email,
        template: "customer.company-attached",
        // Son prénom à ELLE, pas celui saisi par le commercial.
        data: { firstName: known.firstName, companyName: input.companyName },
      }),
    );
    return { userId: known.userId, outcome: "attached", mailSent };
  }

  /** Rattache (ou aligne le rôle), après avoir écarté un second détenteur. */
  private async attach(userId: string, input: AccessToGrant): Promise<void> {
    const owner = await this.members.findOwner(input.companyId);
    ensureNoRivalOwner(input.companyId, input.role, owner?.userId ?? null, userId);
    await this.members.attach(userId, input.companyId, input.role);
  }

  /** Envoie le lien de mot de passe, et rend l'issue telle qu'elle est. */
  private async deliverLink(
    userId: string,
    outcome: AccessOutcome,
    passwordSetupUrl: string,
    input: AccessToGrant,
  ): Promise<AccessGranted> {
    const mailSent = await this.send(input.email, () =>
      this.mailer.send({
        to: input.email,
        template: "customer.access-opened",
        data: {
          firstName: input.firstName,
          companyName: input.companyName,
          passwordSetupUrl,
        },
      }),
    );
    return { userId, outcome, mailSent };
  }

  /**
   * Envoie, et rend si c'est **vraiment** parti. Ne relance jamais : l'accès est
   * déjà acquis, et l'échec du canal est une information, pas une raison de
   * défaire.
   *
   * Sans clé de fournisseur, le mailer tourne « à blanc » — il rend le gabarit,
   * le journalise, et n'envoie rien. Il résout donc sans erreur, et répondre
   * `true` ferait annoncer « lien envoyé » à un commercial dont le client
   * n'attendra jamais rien. On le laisse rendre le gabarit (une erreur de
   * gabarit doit se voir en local), et on dit la vérité sur l'envoi.
   */
  private async send(to: string, deliver: () => Promise<void>): Promise<boolean> {
    try {
      await deliver();
      return this.mailer.enabled;
    } catch (error) {
      this.logger.error(`E-mail d'accès non envoyé à ${to}`, error);
      return false;
    }
  }
}
