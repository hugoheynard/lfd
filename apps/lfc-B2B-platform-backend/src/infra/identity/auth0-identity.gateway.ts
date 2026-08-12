import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { IdentityProviderUnavailableError } from "../../shared/errors/identity-errors.js";
import type {
  IdentityToProvision,
  ProvisionedIdentity,
} from "../../shared/identity/provisioned-identity.js";
import { Auth0ManagementClient, CONFLICT } from "./auth0-management.client.js";

/**
 * Durée de vie du lien de mot de passe : **7 jours**.
 *
 * Assez long pour survivre à une semaine de congés ou à un e-mail lu tard ;
 * assez court pour qu'un lien oublié dans une boîte partagée finisse par ne plus
 * rien ouvrir. Le renvoyer coûte un clic.
 */
const PASSWORD_TICKET_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * La mécanique Auth0 d'ouverture d'identité — **la connexion est un paramètre**.
 *
 * C'est toute la différence entre « le client » et « l'équipe » : les gestes
 * sont identiques (créer, retrouver, frapper un lien), seule change la base
 * d'utilisateurs visée. En faire un paramètre plutôt que deux classes jumelles
 * garantit qu'une correction faite pour l'un profite à l'autre — l'inverse
 * produirait deux copies dont une seule serait maintenue.
 *
 * **La connexion est aussi le mur.** Le staff naît dans `lfc-staff`, le client
 * dans la connexion client ; une même adresse dans les deux donne deux identités
 * distinctes, avec deux `sub`. C'est voulu : un client ne doit pas pouvoir
 * s'authentifier contre une surface interne, et ce refus-là arrive avant tout
 * code applicatif.
 *
 * Cette classe ne connaît **aucun** domaine : ni société, ni annuaire staff. Les
 * ports, eux, vivent dans leur contexte et n'en exposent que ce qu'ils utilisent.
 */
@Injectable()
export class Auth0IdentityGateway {
  constructor(private readonly api: Auth0ManagementClient) {}

  /**
   * Ouvre une identité sur `connection` et rend de quoi en poser le mot de passe.
   *
   * **Idempotent sur l'e-mail** : si une identité existe déjà pour cette adresse
   * sur cette connexion, elle est réutilisée et un nouveau lien est émis.
   * Ré-inviter quelqu'un ne doit pas se heurter à un conflit — et surtout, ne
   * doit pas créer un doublon d'identité.
   *
   * @param resultUrl où atterrir une fois le mot de passe posé, si on le sait.
   *   Elle diffère par surface — l'espace client n'est pas le back-office — donc
   *   elle se donne ici plutôt que de se deviner.
   * @throws {IdentityProviderUnavailableError} canal non configuré ou en échec.
   */
  async provision(
    connection: string,
    input: IdentityToProvision,
    resultUrl?: string,
  ): Promise<ProvisionedIdentity> {
    const subject =
      (await this.createUser(connection, input)) ??
      (await this.findSubjectByEmail(connection, input.email));
    if (subject === null) {
      // Auth0 a dit « déjà pris » puis « je ne trouve rien » : deux réponses
      // incompatibles. Mieux vaut s'arrêter que provisionner un doublon.
      throw new IdentityProviderUnavailableError(
        "Cette adresse est déjà connue du fournisseur d'identité, mais son compte est introuvable.",
      );
    }
    return { subject, passwordSetupUrl: await this.issuePasswordLink(subject, resultUrl) };
  }

  /**
   * Un **nouveau** lien pour une identité qui existe déjà.
   *
   * Le précédent n'est pas récupérable — un ticket est à usage unique et daté —
   * et c'est très bien ainsi : émettre le second invalide de fait la copie qui
   * traînait dans une boîte partagée.
   *
   * @param resultUrl où atterrir une fois le mot de passe posé, si on le sait.
   */
  async issuePasswordLink(subject: string, resultUrl?: string): Promise<string> {
    const ticket = await this.api.call("POST", "/api/v2/tickets/password-change", {
      user_id: subject,
      ttl_sec: PASSWORD_TICKET_TTL_SECONDS,
      // Suivre ce lien **prouve** l'accès à la boîte, ce qu'un e-mail de
      // vérification demanderait ensuite. En envoyer un second serait redondant,
      // et le premier réflexe serait de le prendre pour un doublon suspect.
      mark_email_as_verified: true,
      ...(resultUrl === undefined ? {} : { result_url: resultUrl }),
    });
    const url = readString(ticket, "ticket");
    if (url === null) {
      throw new IdentityProviderUnavailableError(
        "Le fournisseur d'identité n'a pas rendu de lien de création de mot de passe.",
      );
    }
    return url;
  }

  /**
   * Propage une nouvelle adresse, **non vérifiée**, avec l'e-mail de
   * vérification d'Auth0 : sans cela n'importe qui s'attribuerait une adresse
   * qu'il ne contrôle pas, alors que l'e-mail est ici un facteur
   * d'authentification.
   */
  async changeEmail(subject: string, email: string): Promise<void> {
    await this.api.call("PATCH", `/api/v2/users/${encodeURIComponent(subject)}`, {
      email,
      email_verified: false,
      verify_email: true,
    });
  }

  /**
   * Crée l'utilisateur ; rend `null` si l'adresse est **déjà prise** (409).
   *
   * Le mot de passe posé ici est jeté : il n'est ni conservé, ni transmis, ni
   * utilisable — il n'existe que parce qu'Auth0 en exige un à la création. Le
   * vrai mot de passe sera choisi par la personne, via le lien.
   */
  private async createUser(
    connection: string,
    input: IdentityToProvision,
  ): Promise<string | null> {
    const created = await this.api.call("POST", "/api/v2/users", {
      connection,
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
   * Le `sub` derrière une adresse **sur cette connexion**, `null` sinon.
   *
   * Le filtre par connexion n'est pas un détail : une même adresse peut porter
   * plusieurs identités (une connexion sociale, une autre base), et un lien de
   * mot de passe n'a de sens que sur une connexion à mot de passe. Émettre un
   * ticket sur une identité Google produirait un lien impossible à suivre — et
   * rendre le `sub` staff d'une identité client ferait tomber le mur.
   */
  private async findSubjectByEmail(connection: string, email: string): Promise<string | null> {
    const found = await this.api.call(
      "GET",
      `/api/v2/users-by-email?email=${encodeURIComponent(email.toLowerCase())}`,
    );
    if (!Array.isArray(found)) {
      return null;
    }
    const ours = found.filter((user) => usesConnection(user, connection));
    return ours.length === 0 ? null : readUserId(ours[0]);
  }
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
