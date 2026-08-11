import { Inject, Injectable, Logger } from "@nestjs/common";

import { MAILER, type B2bMailer } from "../../../infra/mailer/mailer.module.js";
import { CompanyMemberRepository } from "../../domain/ports/company-member.repository.js";
import { CustomerIdentityPort } from "../../domain/ports/customer-identity.port.js";
import type { CompanyRole } from "../../domain/value-objects/company-role.js";

/** Qui rattacher, à quelle société, avec quel rôle. */
export interface AccessToGrant {
  readonly companyId: string;
  /** Le nom de la société, pour l'e-mail — pas pour décider quoi que ce soit. */
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
  /** Vrai si une identité a été **créée** ; faux si on a rattaché un client connu. */
  readonly identityCreated: boolean;
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
 * Deux chemins derrière un seul geste, et c'est tout l'intérêt du service :
 *
 * - **personne inconnue** → une identité est provisionnée chez le fournisseur,
 *   et un lien de création de mot de passe part vers sa boîte ;
 * - **client déjà connu** (un second établissement, une autre enseigne) → on
 *   **rattache** la société à son compte existant. Lui refabriquer une identité
 *   lui donnerait deux mots de passe pour une seule adresse, et deux espaces là
 *   où il en veut un.
 *
 * L'appelant n'a pas à savoir dans lequel il est — c'est justement ce qu'il ne
 * peut pas deviner au moment où il saisit une adresse.
 *
 * **Un e-mail qui ne part pas ne défait pas l'accès.** Le rattachement est déjà
 * en base ; l'annuler pour un canal indisponible ferait perdre le travail du
 * commercial. On le dit (`mailSent`), on le journalise, et on continue — le
 * renvoi est un clic.
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
    const known = await this.members.findUserIdByEmail(input.email);
    return known === null ? this.openNewAccess(input) : this.attachToKnown(known, input);
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
    await this.members.attach(userId, input.companyId, input.role);

    const mailSent = await this.send(input.email, () =>
      this.mailer.send({
        to: input.email,
        template: "customer.access-opened",
        data: {
          firstName: input.firstName,
          companyName: input.companyName,
          passwordSetupUrl: provisioned.passwordSetupUrl,
        },
      }),
    );
    return { userId, identityCreated: true, mailSent };
  }

  /** Client connu : une société de plus dans son espace, pas un second compte. */
  private async attachToKnown(userId: string, input: AccessToGrant): Promise<AccessGranted> {
    const existing = await this.members.findMember(userId, input.companyId);
    if (existing === null) {
      await this.members.attach(userId, input.companyId, input.role);
    }
    const mailSent = await this.send(input.email, () =>
      this.mailer.send({
        to: input.email,
        template: "customer.company-attached",
        data: { firstName: input.firstName, companyName: input.companyName },
      }),
    );
    return { userId, identityCreated: false, mailSent };
  }

  /**
   * Envoie, et rend si c'est parti. Ne relance **jamais** : l'accès est déjà
   * acquis, et l'échec du canal est une information, pas une raison de défaire.
   */
  private async send(to: string, deliver: () => Promise<void>): Promise<boolean> {
    try {
      await deliver();
      return true;
    } catch (error) {
      this.logger.error(`E-mail d'accès non envoyé à ${to}`, error);
      return false;
    }
  }
}
