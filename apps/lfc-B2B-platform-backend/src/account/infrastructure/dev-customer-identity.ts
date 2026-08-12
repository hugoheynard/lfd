import { Injectable, Logger } from "@nestjs/common";

import {
  CustomerIdentityPort,
  type IdentityToProvision,
  type ProvisionedIdentity,
} from "../domain/ports/customer-identity.port.js";

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
