import { Inject, Injectable } from "@nestjs/common";

import {
  Auth0IdentityGateway,
  SELF_SERVICE_PASSWORD_TICKET_TTL_SECONDS,
} from "../../../platform/identity/auth0-identity.gateway.js";
import { MAILER, type B2bMailer } from "../../../platform/mailer/mailer.tokens.js";
import { IdentitySubjectUnknownError } from "../../../platform/shared/errors/identity-errors.js";
import { LoginMethodsUnknownAccountError } from "../domain/errors/account-errors.js";
import type { LinkedIdentity } from "../../../platform/identity/auth0-user-shape.js";
import { AppConfig } from "../../../platform/config/app-config.js";
import {
  CustomerIdentityPort,
  type IdentityToProvision,
  type LoginMethod,
  type ProvisionedIdentity,
} from "../domain/ports/customer-identity.port.js";

/**
 * Adaptateur **client** du port d'identité : la mécanique Auth0
 * ({@link Auth0IdentityGateway}) appliquée à la **connexion client**.
 *
 * Tout ce qu'il ajoute à la mécanique tient en trois décisions, et elles sont
 * toutes les trois propres au client : la connexion visée, l'endroit où on
 * atterrit après avoir posé son mot de passe — l'espace client, pas le
 * back-office —, et le fait qu'un lien demandé par la personne elle-même ne
 * ressorte JAMAIS d'ici autrement que par sa boîte
 * ({@link Auth0CustomerIdentity.sendPasswordResetLink}).
 */
@Injectable()
export class Auth0CustomerIdentity extends CustomerIdentityPort {
  constructor(
    private readonly identities: Auth0IdentityGateway,
    private readonly config: AppConfig,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {
    super();
  }

  changeEmail(subject: string, email: string): Promise<void> {
    return this.identities.changeEmail(subject, email);
  }

  provision(input: IdentityToProvision): Promise<ProvisionedIdentity> {
    return this.identities.provision(this.config.auth0DatabaseConnection(), input, this.loginUrl());
  }

  issuePasswordLink(subject: string): Promise<string> {
    return this.identities.issuePasswordLink(subject, this.loginUrl());
  }

  /**
   * 🔴 **Le lien naît et meurt dans cette méthode.** Il n'est pas rendu, pas
   * journalisé, pas tracé : la seule chose qui en sorte est le message parti à
   * l'adresse du compte. C'est pour ça que l'envoi est ici, dans l'adaptateur,
   * et non dans un abonné d'événement qui aurait dû se le faire passer.
   *
   * Le TTL est **passé** et non lu : ce geste est du libre-service, sa fenêtre
   * n'a rien à voir avec celle d'une invitation (cf.
   * {@link SELF_SERVICE_PASSWORD_TICKET_TTL_SECONDS}).
   *
   * L'envoi n'est pas rattrapé : la personne attend un e-mail, et un 204 posé
   * sur un envoi manqué lui ferait surveiller une boîte où rien n'arrivera.
   */
  async sendPasswordResetLink(subject: string, email: string): Promise<void> {
    const passwordSetupUrl = await this.identities.issuePasswordLink(
      subject,
      this.loginUrl(),
      SELF_SERVICE_PASSWORD_TICKET_TTL_SECONDS,
    );
    await this.mailer.send({
      to: email,
      template: "customer.password-reset",
      data: { passwordSetupUrl },
    });
  }

  async listLoginMethods(subject: string): Promise<readonly LoginMethod[]> {
    return asLoginMethods(await this.known(() => this.identities.listIdentities(subject)));
  }

  async linkLoginMethod(subject: string, idToken: string): Promise<readonly LoginMethod[]> {
    return asLoginMethods(await this.known(() => this.identities.linkIdentity(subject, idToken)));
  }

  async unlinkLoginMethod(
    subject: string,
    provider: string,
    secondaryUserId: string,
  ): Promise<readonly LoginMethod[]> {
    return asLoginMethods(
      await this.known(() => this.identities.unlinkIdentity(subject, provider, secondaryUserId)),
    );
  }

  /**
   * Traduit « le fournisseur ne connaît pas ce sujet » en un refus du CONTEXTE.
   *
   * 🔴 **Seulement pour les trois gestes de méthodes de connexion**, et c'est
   * délibéré. `IdentitySubjectUnknownError` est un `TechnicalError` (500), levé
   * exprès pour que l'appelant RÉPARE : le geste staff repart de l'adresse et
   * réaligne nos deux bases (cf. son JSDoc). `changeEmail` et
   * `issuePasswordLink` passent donc au travers **sans être traduits** — les
   * traduire tous casserait cette reprise.
   *
   * Ici, personne ne répare : la personne regarde son écran. Un 500 lui affiche
   * « une panne est survenue » et remplit le journal de production d'alarmes
   * pour un fait qui n'en est pas un (relevé en développement le 2026-09-22, sur
   * `GET /me/identities` avec un compte semé dont le sujet n'existe pas au
   * tenant).
   */
  private async known<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (error) {
      if (error instanceof IdentitySubjectUnknownError) {
        throw new LoginMethodsUnknownAccountError();
      }
      throw error;
    }
  }

  /** Où atterrir après avoir posé son mot de passe — omis si on ne sait pas. */
  private loginUrl(): string | undefined {
    const base = this.config.clientBaseUrl();
    return base === null ? undefined : `${base}/login`;
  }
}

/**
 * La forme du fournisseur devient celle du domaine. Le renommage (`userId` →
 * `secondaryUserId`) n'est pas cosmétique : il dit, du côté du domaine, ce que
 * cet identifiant est bon à faire — adresser un détachement — et pourquoi il ne
 * sort ni en vue, ni en URL, ni au journal.
 */
function asLoginMethods(identities: readonly LinkedIdentity[]): readonly LoginMethod[] {
  return identities.map((identity) => ({
    provider: identity.provider,
    secondaryUserId: identity.userId,
    connection: identity.connection,
    isPrimary: identity.isPrimary,
  }));
}
