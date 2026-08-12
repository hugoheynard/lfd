import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../infra/config/app-config.js";
import { Auth0IdentityGateway } from "../../infra/identity/auth0-identity.gateway.js";
import {
  StaffIdentityPort,
  type IdentityToProvision,
  type ProvisionedIdentity,
} from "../domain/staff-identity.port.js";

/**
 * Adaptateur **staff** du port d'identité : la même mécanique Auth0 que le
 * client, appliquée à la **connexion de l'équipe**.
 *
 * Deux décisions le distinguent, et elles suffisent : la connexion visée, et
 * l'endroit où l'on atterrit après avoir posé son mot de passe — le
 * back-office, pas l'espace client. Envoyer une commerciale vers la boutique
 * serait un accueil déroutant, et sur une surface interne, déroutant se lit
 * comme cassé.
 */
@Injectable()
export class Auth0StaffIdentity extends StaffIdentityPort {
  constructor(
    private readonly identities: Auth0IdentityGateway,
    private readonly config: AppConfig,
  ) {
    super();
  }

  provision(input: IdentityToProvision): Promise<ProvisionedIdentity> {
    return this.identities.provision(this.config.auth0StaffConnection(), input, this.backOffice());
  }

  issuePasswordLink(subject: string): Promise<string> {
    return this.identities.issuePasswordLink(subject, this.backOffice());
  }

  /** Où atterrir une fois le mot de passe posé — omis si on ne sait pas. */
  private backOffice(): string | undefined {
    return this.config.adminBaseUrl() ?? undefined;
  }
}
