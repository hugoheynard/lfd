import { Injectable, Logger } from "@nestjs/common";

import {
  CustomerIdentityPort,
  type IdentityToProvision,
  type LoginMethod,
  type ProvisionedIdentity,
} from "../domain/ports/customer-identity.port.js";

/** La stratégie que porte un sujet fabriqué ici (`dev|…`). */
const DEV_PROVIDER = "dev";

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

  listLoginMethods(subject: string): Promise<readonly LoginMethod[]> {
    return Promise.resolve([primaryOf(subject), ...(this.linked.get(subject) ?? [])]);
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
 */
function primaryOf(subject: string): LoginMethod {
  const cut = subject.indexOf("|");
  return {
    provider: cut < 0 ? DEV_PROVIDER : subject.slice(0, cut),
    secondaryUserId: cut < 0 ? subject : subject.slice(cut + 1),
    connection: null,
    isPrimary: true,
  };
}

/**
 * Ce qu'un jeton de preuve « rattache » en développement : le port de preuve
 * doublé rend un sujet, et c'est ce sujet-là qu'on ajoute.
 */
function devSecondary(provenSubject: string): LoginMethod {
  return { ...primaryOf(provenSubject), isPrimary: false };
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
