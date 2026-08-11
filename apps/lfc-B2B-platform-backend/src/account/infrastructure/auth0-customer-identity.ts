import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../infra/config/app-config.js";
import { IdentityProviderUnavailableError } from "../domain/errors/account-errors.js";
import {
  CustomerIdentityPort,
  type IdentityToProvision,
  type ProvisionedIdentity,
} from "../domain/ports/customer-identity.port.js";
import { Auth0ManagementClient, CONFLICT } from "./auth0-management.client.js";

/**
 * Durée de vie du lien de mot de passe : **7 jours**.
 *
 * Assez long pour survivre à une semaine de congés ou à un e-mail lu tard ;
 * assez court pour qu'un lien oublié dans une boîte partagée finisse par ne plus
 * rien ouvrir. Le renvoyer coûte un clic au commercial.
 */
const PASSWORD_TICKET_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Adaptateur **Management API Auth0** du port d'identité.
 *
 * Le changement d'e-mail repart **non vérifié**, avec un e-mail de vérification
 * déclenché par Auth0 : sans cela, n'importe qui pourrait s'attribuer une
 * adresse qu'il ne contrôle pas, et l'e-mail est ici un facteur
 * d'authentification.
 */
@Injectable()
export class Auth0CustomerIdentity extends CustomerIdentityPort {
  constructor(
    private readonly api: Auth0ManagementClient,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async changeEmail(subject: string, email: string): Promise<void> {
    await this.api.call("PATCH", `/api/v2/users/${encodeURIComponent(subject)}`, {
      email,
      email_verified: false,
      verify_email: true,
    });
  }

  async provision(input: IdentityToProvision): Promise<ProvisionedIdentity> {
    const subject = (await this.createUser(input)) ?? (await this.findSubjectByEmail(input.email));
    if (subject === null) {
      // Auth0 a dit « déjà pris » puis « je ne trouve rien » : deux réponses
      // incompatibles. Mieux vaut s'arrêter que provisionner un doublon.
      throw new IdentityProviderUnavailableError(
        "Cette adresse est déjà connue du fournisseur d'identité, mais son compte est introuvable.",
      );
    }
    return { subject, passwordSetupUrl: await this.issuePasswordLink(subject) };
  }

  /**
   * Un **nouveau** lien pour une identité qui existe déjà.
   *
   * Le précédent n'est pas récupérable — un ticket est à usage unique et daté —
   * et c'est très bien ainsi : émettre le second invalide de fait la copie qui
   * traînait dans une boîte partagée.
   */
  async issuePasswordLink(subject: string): Promise<string> {
    return await this.passwordTicket(subject);
  }

  /**
   * Crée l'utilisateur ; rend `null` si l'adresse est **déjà prise** (409).
   *
   * Le mot de passe posé ici est jeté : il n'est ni conservé, ni transmis, ni
   * utilisable — il n'existe que parce qu'Auth0 en exige un à la création. Le
   * vrai mot de passe sera choisi par la personne, via le lien.
   */
  private async createUser(input: IdentityToProvision): Promise<string | null> {
    const created = await this.api.call("POST", "/api/v2/users", {
      connection: this.config.auth0DatabaseConnection(),
      email: input.email,
      password: throwawayPassword(),
      given_name: input.firstName,
      family_name: input.lastName,
      name: `${input.firstName} ${input.lastName}`.trim(),
      email_verified: false,
      verify_email: false,
    });
    return created === CONFLICT ? null : readUserId(created);
  }

  /**
   * Le `sub` derrière une adresse, `null` si le fournisseur n'en connaît aucune.
   *
   * On retient l'identité de **notre connexion base de données**, pas la
   * première venue : une même adresse peut porter plusieurs identités (une
   * connexion sociale, par exemple), et un lien de mot de passe n'a de sens que
   * sur une connexion à mot de passe. Émettre un ticket sur une identité Google
   * produirait un lien que le client ne pourrait pas suivre.
   */
  private async findSubjectByEmail(email: string): Promise<string | null> {
    const found = await this.api.call(
      "GET",
      `/api/v2/users-by-email?email=${encodeURIComponent(email.toLowerCase())}`,
    );
    if (!Array.isArray(found)) {
      return null;
    }
    const connection = this.config.auth0DatabaseConnection();
    const ours = found.filter((user) => usesConnection(user, connection));
    return ours.length === 0 ? null : readUserId(ours[0]);
  }

  /**
   * Un lien de création de mot de passe.
   *
   * `mark_email_as_verified` : suivre ce lien **prouve** l'accès à la boîte, ce
   * qui est exactement ce qu'un e-mail de vérification demanderait ensuite. En
   * envoyer un second serait redondant, et le premier réflexe du client serait
   * de le prendre pour un doublon suspect.
   */
  private async passwordTicket(subject: string): Promise<string> {
    const ticket = await this.api.call("POST", "/api/v2/tickets/password-change", {
      user_id: subject,
      ttl_sec: PASSWORD_TICKET_TTL_SECONDS,
      mark_email_as_verified: true,
      ...resultUrl(this.config.clientBaseUrl()),
    });
    const url = readString(ticket, "ticket");
    if (url === null) {
      throw new IdentityProviderUnavailableError(
        "Le fournisseur d'identité n'a pas rendu de lien de création de mot de passe.",
      );
    }
    return url;
  }
}

/** Où atterrir après avoir posé son mot de passe — omis si on ne sait pas. */
function resultUrl(clientBaseUrl: string | null): Readonly<Record<string, string>> {
  return clientBaseUrl === null ? {} : { result_url: `${clientBaseUrl}/login` };
}

/**
 * Un mot de passe aléatoire assez fort pour passer n'importe quelle politique de
 * tenant : 32 octets en base64url, plus un caractère de chaque classe exigée.
 */
function throwawayPassword(): string {
  return `Aa1!${randomBytes(32).toString("base64url")}`;
}

/**
 * Cet utilisateur Auth0 a-t-il une identité sur **cette** connexion ?
 *
 * Forme lue de façon défensive : elle vient du réseau, et une réponse qui
 * surprend doit exclure l'utilisateur plutôt que de le retenir à tort.
 */
function usesConnection(raw: unknown, connection: string): boolean {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }
  const identities: unknown = readProperty(raw, "identities");
  if (!Array.isArray(identities)) {
    return false;
  }
  return identities.some((identity) => readString(identity, "connection") === connection);
}

/** `user_id` d'un objet utilisateur Auth0, ou `null` si la forme surprend. */
function readUserId(raw: unknown): string | null {
  return readString(raw, "user_id");
}

/** Une propriété chaîne non vide d'un objet venu du réseau. */
function readString(raw: unknown, key: string): string | null {
  const value = readProperty(raw, key);
  return typeof value === "string" && value !== "" ? value : null;
}

/** Une propriété quelconque d'un objet venu du réseau — `undefined` sinon. */
function readProperty(raw: unknown, key: string): unknown {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const record: Record<string, unknown> = { ...raw };
  return record[key];
}
