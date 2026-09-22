import { Inject, Injectable, Logger } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { MAILER, type B2bMailer } from "../../../platform/mailer/mailer.tokens.js";
import {
  CustomerIdentityPort,
  type IdentityToProvision,
  type LoginMethod,
  type ProvisionedIdentity,
} from "../domain/ports/customer-identity.port.js";

/** La stratégie que porte un sujet fabriqué ici (`dev|…`). */
const DEV_PROVIDER = "dev";

/**
 * La stratégie d'une identité à MOT DE PASSE chez Auth0 — ce que l'écran sait
 * nommer « E-mail ». L'adaptateur de développement l'emprunte pour ses propres
 * sujets, cf. {@link primaryOf}.
 */
const DATABASE_PROVIDER = "auth0";

/**
 * Fournisseur d'identité de **DÉVELOPPEMENT** — aucun appel réseau.
 *
 * Sans application M2M configurée, toute ouverture d'accès échoue : le
 * rattachement d'un détenteur remonte un `500`, et l'ouverture d'un compte avale
 * l'erreur en laissant une société sans accès. Le parcours complet — ouvrir,
 * rattacher, voir le contact apparaître avec son état — était donc **injouable
 * en local**, ce qui est exactement le parcours qu'on a le plus besoin de
 * rejouer.
 *
 * Il ne simule rien de subtil : un `sub` **déterministe** dérivé de l'adresse,
 * pour que rejouer le même scénario retombe sur la même personne, et un lien de
 * mot de passe visiblement factice. Ce qui est réel, c'est tout le reste —
 * membership, contacts, projections, e-mails à blanc journalisés.
 *
 * **Fail-closed** : il n'est monté qu'à deux conditions (cf. le provider de
 * `AccountModule`) — pas de M2M configuré **et** pas en production. En prod sans
 * M2M, c'est l'adaptateur Auth0 qui reste en place et refuse clairement ; on ne
 * fabrique pas d'identités fantômes chez un vrai client.
 */
@Injectable()
export class DevCustomerIdentity extends CustomerIdentityPort {
  private readonly logger = new Logger(DevCustomerIdentity.name);

  constructor(
    private readonly config: AppConfig,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {
    super();
  }

  /**
   * Les méthodes **secondaires** rattachées, par sujet. En mémoire, donc
   * perdues au redémarrage : elles n'existent que le temps de rejouer le
   * parcours.
   *
   * ⚠️ Le sujet secondaire est ici le **jeton lui-même** : cet adaptateur ne
   * voit pas la preuve, qui a été vérifiée en amont par son propre port. Avec
   * un vrai `id_token` sous la main, l'entrée fabriquée est donc cosmétique —
   * ce qui est jouable en local reste le cycle « ajouter, voir, retirer ».
   */
  private readonly linked = new Map<string, readonly LoginMethod[]>();

  changeEmail(subject: string, email: string): Promise<void> {
    this.logger.warn(`[dev] changement d'adresse non propagé : ${subject} → ${email}`);
    return Promise.resolve();
  }

  provision(input: IdentityToProvision): Promise<ProvisionedIdentity> {
    const subject = devSubject(input.email);
    this.logger.warn(`[dev] identité fabriquée localement pour ${input.email} (${subject})`);
    return Promise.resolve({ subject, passwordSetupUrl: devPasswordUrl(subject) });
  }

  issuePasswordLink(subject: string): Promise<string> {
    this.logger.warn(`[dev] lien de mot de passe factice pour ${subject}`);
    return Promise.resolve(devPasswordUrl(subject));
  }

  /**
   * **Le courriel passe quand même par le mailer**, et c'est le sujet.
   *
   * 🔴 Cette méthode se contentait de journaliser (relevé par Hugo le
   * 2026-09-22 : l'écran disait « Un lien vous a été envoyé » alors que RIEN
   * n'était parti, ni même rendu). Elle court-circuitait une pièce qui existe :
   * sans clé Resend, le mailer est le `DryRunMailer`, qui **rend** le gabarit,
   * le journalise, et n'envoie pas. Le chemin local a donc désormais la même
   * FORME que la production — et une faute dans le gabarit se voit ici, au lieu
   * d'attendre le jour où la clé arrive.
   *
   * ⚠️ Le mailer à blanc journalise l'en-tête, pas le corps : le lien n'y
   * figure pas. On le journalise donc à part, parce que c'est la seule façon de
   * suivre le parcours en local. Il ne mène nulle part (`dev.invalid`) — c'est
   * ce qui rend l'exception à « le lien ne sort que par la boîte » acceptable.
   */
  async sendPasswordResetLink(subject: string, email: string): Promise<void> {
    const passwordSetupUrl = devPasswordUrl(subject);
    await this.mailer.send({
      to: email,
      template: "customer.password-reset",
      data: { passwordSetupUrl },
    });
    this.logger.warn(`[dev] lien de mot de passe factice pour ${email} : ${passwordSetupUrl}`);
  }

  listLoginMethods(subject: string): Promise<readonly LoginMethod[]> {
    return Promise.resolve([
      primaryOf(subject, this.config.auth0DatabaseConnection()),
      ...(this.linked.get(subject) ?? []),
    ]);
  }

  /**
   * Rattache **en mémoire**, sans rien vérifier : la preuve a déjà été vérifiée
   * en amont par le port de preuve, et il n'y a pas de tenant ici pour absorber
   * quoi que ce soit.
   *
   * La mémoire n'est pas une coquetterie : sans elle, la liste ne bougerait
   * jamais et le parcours « ajouter, voir apparaître, retirer » serait injouable
   * en local — précisément le parcours que cet adaptateur existe pour rendre
   * jouable. Elle meurt avec le processus, comme tout ce que le dev fabrique.
   */
  linkLoginMethod(subject: string, idToken: string): Promise<readonly LoginMethod[]> {
    const added = devSecondary(idToken);
    const current = this.linked.get(subject) ?? [];
    const kept = current.filter((method) => method.secondaryUserId !== added.secondaryUserId);
    this.linked.set(subject, [...kept, added]);
    this.logger.warn(`[dev] méthode de connexion « ${added.provider} » rattachée localement`);
    return this.listLoginMethods(subject);
  }

  unlinkLoginMethod(
    subject: string,
    provider: string,
    secondaryUserId: string,
  ): Promise<readonly LoginMethod[]> {
    const current = this.linked.get(subject) ?? [];
    this.linked.set(
      subject,
      current.filter(
        (method) => method.provider !== provider || method.secondaryUserId !== secondaryUserId,
      ),
    );
    return this.listLoginMethods(subject);
  }
}

/**
 * L'identité **porteuse** du compte, déduite du sujet : c'est ce que le
 * fournisseur rend toujours en premier, et elle ne se détache jamais.
 *
 * 🔴 **Elle déclare la connexion CLIENT, et c'est ce qui rend le parcours
 * jouable** (2026-09-22). Elle rendait `connection: null` — techniquement
 * honnête, puisqu'aucun tenant n'est derrière — mais le serveur refuse le lien
 * de mot de passe à qui n'a aucune identité sur la connexion à mot de passe
 * (`request-password-reset.handler.ts`). En local, le refus tombait donc
 * TOUJOURS, et le seul geste qu'on voulait essayer était le seul injouable.
 *
 * Le `provider` suit la même logique : un sujet `dev|…` annoncerait `dev`, que
 * l'écran ne sait pas nommer — il afficherait le mot technique au lieu de
 * « E-mail », et la ligne perdrait ses gestes. On émule donc ce que le vrai
 * fournisseur rendrait, ce qui est exactement le métier de cet adaptateur.
 *
 * ⚠️ Un sujet qui vient VRAIMENT d'un fournisseur (`google-oauth2|…`) garde sa
 * stratégie : on n'émule que ce qu'on a fabriqué.
 */
function primaryOf(subject: string, customerConnection: string): LoginMethod {
  const cut = subject.indexOf("|");
  const strategy = cut < 0 ? DEV_PROVIDER : subject.slice(0, cut);
  const fabricated = strategy === DEV_PROVIDER;
  return {
    provider: fabricated ? DATABASE_PROVIDER : strategy,
    secondaryUserId: cut < 0 ? subject : subject.slice(cut + 1),
    connection: fabricated ? customerConnection : null,
    isPrimary: true,
  };
}

/**
 * Ce qu'un jeton de preuve « rattache » en développement : le port de preuve
 * doublé rend un sujet, et c'est ce sujet-là qu'on ajoute.
 *
 * ⚠️ Elle ne passe **plus** par {@link primaryOf} : celle-ci emprunte la
 * connexion à mot de passe pour les sujets fabriqués ici, ce qui ferait passer
 * une méthode SECONDAIRE pour une identité à mot de passe — et le lien de
 * réinitialisation serait alors offert à un compte qui n'en a pas.
 */
function devSecondary(provenSubject: string): LoginMethod {
  const cut = provenSubject.indexOf("|");
  return {
    provider: cut < 0 ? DEV_PROVIDER : provenSubject.slice(0, cut),
    secondaryUserId: cut < 0 ? provenSubject : provenSubject.slice(cut + 1),
    connection: null,
    isPrimary: false,
  };
}

/**
 * Un `sub` **déterministe** : la même adresse rend le même sujet, d'un
 * redémarrage à l'autre. Un identifiant tiré au hasard ferait de chaque rejeu un
 * inconnu de plus, et « cette personne est-elle déjà cliente ? » ne se testerait
 * jamais en local.
 */
function devSubject(email: string): string {
  return `dev|${email.trim().toLowerCase()}`;
}

/** Visiblement faux : personne ne doit croire que ce lien ouvre quoi que ce soit. */
function devPasswordUrl(subject: string): string {
  return `https://dev.invalid/mot-de-passe/${encodeURIComponent(subject)}`;
}
