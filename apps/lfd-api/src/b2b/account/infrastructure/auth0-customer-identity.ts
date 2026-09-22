import { Injectable } from "@nestjs/common";

import { Auth0IdentityGateway } from "../../../platform/identity/auth0-identity.gateway.js";
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
 * Tout ce qu'il ajoute à la mécanique tient en deux décisions, et elles sont
 * toutes les deux propres au client : la connexion visée, et l'endroit où on
 * atterrit après avoir posé son mot de passe — l'espace client, pas le
 * back-office.
 */
@Injectable()
export class Auth0CustomerIdentity extends CustomerIdentityPort {
  constructor(
    private readonly identities: Auth0IdentityGateway,
    private readonly config: AppConfig,
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

  async listLoginMethods(subject: string): Promise<readonly LoginMethod[]> {
    return asLoginMethods(await this.identities.listIdentities(subject));
  }

  async linkLoginMethod(subject: string, idToken: string): Promise<readonly LoginMethod[]> {
    return asLoginMethods(await this.identities.linkIdentity(subject, idToken));
  }

  async unlinkLoginMethod(
    subject: string,
    provider: string,
    secondaryUserId: string,
  ): Promise<readonly LoginMethod[]> {
    return asLoginMethods(await this.identities.unlinkIdentity(subject, provider, secondaryUserId));
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
