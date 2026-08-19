import { randomBytes } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";

import {
  IdentityProviderUnavailableError,
  IdentitySubjectUnknownError,
} from "../shared/errors/identity-errors.js";
import type {
  IdentityToProvision,
  ProvisionedIdentity,
} from "../shared/identity/provisioned-identity.js";
import { Auth0ManagementClient, CONFLICT, NOT_FOUND } from "./auth0-management.client.js";
import { isProviderSubject } from "./identity-diagnosis.js";

/**
 * Durée de vie du lien de mot de passe : **7 jours**.
 *
 * Assez long pour survivre à une semaine de congés ou à un e-mail lu tard ;
 * assez court pour qu'un lien oublié dans une boîte partagée finisse par ne plus
 * rien ouvrir. Le renvoyer coûte un clic.
 */
export const PASSWORD_TICKET_TTL_SECONDS = 7 * 24 * 60 * 60;

/** L'empreinte d'une adresse chez le fournisseur — assez pour trancher, pas plus. */
export interface IdentityFootprint {
  readonly connections: readonly string[];
  /** Faux = Auth0 rend une identité dont on ne sait pas lire l'identifiant. */
  readonly hasUserId: boolean;
}

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
  private readonly logger = new Logger(Auth0IdentityGateway.name);

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
      //
      // C'était le SEUL chemin d'échec muet — les deux appels réussissent, donc
      // le tenant n'enregistre aucune anomalie, et l'appelant reçoit un `500`
      // neutre. On le journalise avec la connexion visée : sans elle, la ligne
      // n'orienterait pas plus que le silence qu'elle remplace.
      this.logger.error(
        `Adresse déjà prise sur « ${connection} », mais aucune identité ne s'y retrouve.`,
      );
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
   * @throws {IdentitySubjectUnknownError} le fournisseur ne connaît pas ce
   *   sujet. Distinct d'une panne : l'appelant qui dispose de l'e-mail peut
   *   repasser par `provision` et réaligner nos deux bases.
   */
  async issuePasswordLink(subject: string, resultUrl?: string): Promise<string> {
    // Un sujet que le fournisseur ne peut PAS connaître ne se demande pas : on
    // le déclare inconnu tout de suite, ce que l'appelant sait rattraper.
    //
    // Le seul producteur de tels sujets est l'adaptateur de développement
    // (`dev|<adresse>`), et ils peuvent atterrir en base de production dès qu'un
    // compte y a été ouvert sans M2M configuré. Les envoyer à Auth0 rend un
    // `400` — un identifiant malformé n'est pas un `404` — donc la reprise
    // automatique ne se déclenchait pas, et la personne restait DÉFINITIVEMENT
    // injoignable : chaque clic sur « ouvrir l'accès » rendait le même 500.
    if (!isProviderSubject(subject)) {
      throw new IdentitySubjectUnknownError(subject);
    }
    const ticket = await this.api.call("POST", "/api/v2/tickets/password-change", {
      user_id: subject,
      ttl_sec: PASSWORD_TICKET_TTL_SECONDS,
      // Suivre ce lien **prouve** l'accès à la boîte, ce qu'un e-mail de
      // vérification demanderait ensuite. En envoyer un second serait redondant,
      // et le premier réflexe serait de le prendre pour un doublon suspect.
      mark_email_as_verified: true,
      ...(resultUrl === undefined ? {} : { result_url: resultUrl }),
    });
    if (ticket === NOT_FOUND) {
      throw new IdentitySubjectUnknownError(subject);
    }
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
    const patched = await this.api.call("PATCH", `/api/v2/users/${encodeURIComponent(subject)}`, {
      email,
      email_verified: false,
      verify_email: true,
    });
    // Un sujet inconnu ne doit PAS passer pour un succès : l'appelant écrirait
    // ensuite la nouvelle adresse chez nous, et la personne se connecterait
    // avec l'ancienne en en voyant une autre à l'écran.
    if (patched === NOT_FOUND) {
      throw new IdentitySubjectUnknownError(subject);
    }
  }

  /**
   * **Ce que le fournisseur sait d'une adresse**, sans rien créer.
   *
   * Sert au contrôle d'exploitation, et à rien d'autre : c'est la lecture qui
   * décide du seul chemin d'échec impossible à distinguer de l'extérieur —
   * Auth0 répond « adresse déjà prise » à la création, puis ne la retrouve pas.
   * Les deux appels réussissent, donc rien n'apparaît côté tenant ; l'erreur qui
   * en sort est un `500` neutre.
   *
   * On ne publie **que les noms de connexion** et la lisibilité de l'identifiant
   * — jamais le `user_id`, ni le profil. C'est exactement ce qu'il faut pour
   * trancher, et rien de plus.
   */
  async describeEmail(email: string): Promise<readonly IdentityFootprint[]> {
    const found = await this.api.call(
      "GET",
      `/api/v2/users-by-email?email=${encodeURIComponent(email.toLowerCase())}`,
    );
    if (!Array.isArray(found)) {
      return [];
    }
    return found.map((user) => ({
      connections: connectionsOf(user),
      hasUserId: readUserId(user) !== null,
    }));
  }

  /**
   * Crée l'utilisateur ; rend `null` si l'adresse est **déjà prise** (409).
   *
   * Le mot de passe posé ici est jeté : il n'est ni conservé, ni transmis, ni
   * utilisable — il n'existe que parce qu'Auth0 en exige un à la création. Le
   * vrai mot de passe sera choisi par la personne, via le lien.
   *
   * **Le corps est minimal, et c'est une règle, pas une économie.** Le
   * fournisseur d'identité n'a besoin que de quoi authentifier : une adresse,
   * un secret, une base d'utilisateurs. Le nom et le prénom vivent dans NOTRE
   * base, qui en est la source de vérité — les recopier chez lui créait une
   * seconde vérité à tenir à jour, et exposait des données personnelles à un
   * tiers sans que rien ne le justifie.
   *
   * C'est aussi ce qui a cassé la production le 2026-08-16 : Auth0 rendait un
   * `400` sur ce corps-là, quand la même création passait sans ces trois
   * champs. Chaque champ envoyé « au cas où » est une règle de validation
   * étrangère qu'on s'impose.
   */
  private async createUser(connection: string, input: IdentityToProvision): Promise<string | null> {
    const created = await this.api.call("POST", "/api/v2/users", {
      connection,
      email: input.email,
      password: throwawayPassword(),
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

/** Les connexions d'une identité, telles qu'Auth0 les nomme. */
function connectionsOf(raw: unknown): readonly string[] {
  const identities: unknown = readProperty(raw, "identities");
  if (!Array.isArray(identities)) {
    return [];
  }
  return identities
    .map((identity) => readString(identity, "connection"))
    .filter((name): name is string => name !== null);
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
