import { Injectable } from "@nestjs/common";

import { isProviderSubject } from "../../../platform/identity/identity-diagnosis.js";
import {
  CustomerIdentityPort,
  type IdentityToProvision,
  type LoginMethod,
  type ProvisionedIdentity,
} from "../domain/ports/customer-identity.port.js";
import { Auth0CustomerIdentity } from "./auth0-customer-identity.js";
import { DevCustomerIdentity } from "./dev-customer-identity.js";

/**
 * **En développement seulement : chaque compte est servi par l'adaptateur qui
 * l'a ouvert.**
 *
 * ## Le piège qu'il supprime
 *
 * Le choix de l'adaptateur se faisait par **configuration** — « le M2M est-il
 * renseigné ? » — alors que l'incompatibilité est par **compte**. Un compte
 * ouvert pendant que l'adaptateur de développement fabriquait les sujets porte
 * un `dev|…`, qu'Auth0 ne peut pas connaître : le jour où l'on renseigne le
 * M2M dans son `.env`, ce compte devient **définitivement** inutilisable sur
 * les écrans d'identité, sans que rien n'explique pourquoi (relevé par Hugo le
 * 2026-09-22 sur `GET /me/identities`, après un refus qui pointait la garde
 * `isProviderSubject` et non un appel réseau).
 *
 * Renseigner un secret ne devrait pas casser un compte déjà ouvert. On route
 * donc sur ce qui décide vraiment : la **forme du sujet**.
 *
 * ## 🔴 Jamais en production, et ce n'est pas une précaution de style
 *
 * Un sujet `dev|…` **peut** atterrir en base de production — c'est écrit dans
 * `IdentitySubjectUnknownError` : il suffit qu'un compte y ait été ouvert sans
 * M2M configuré. L'y servir depuis une liste en mémoire reviendrait à monter un
 * magasin d'identités factice **dans la production**, et à laisser passer pour
 * une méthode de connexion ce qui n'en est pas une.
 *
 * En production, l'adaptateur Auth0 reste donc seul et refuse clairement. Ce
 * routeur n'est monté que hors production, et le provider d'`AccountModule` le
 * dit en une ligne.
 *
 * ## Ce qui ne se route pas
 *
 * `provision` **ouvre** une identité : elle n'a pas encore de sujet, donc rien
 * à router. Elle va au vrai fournisseur, qui est ce qu'on veut dès que le M2M
 * est là — c'est exactement le comportement d'avant ce fichier.
 */
@Injectable()
export class SubjectRoutedCustomerIdentity extends CustomerIdentityPort {
  constructor(
    private readonly auth0: Auth0CustomerIdentity,
    private readonly dev: DevCustomerIdentity,
  ) {
    super();
  }

  changeEmail(subject: string, email: string): Promise<void> {
    return this.of(subject).changeEmail(subject, email);
  }

  /** Ouvrir n'a pas de sujet à router — cf. le JSDoc de la classe. */
  provision(input: IdentityToProvision): Promise<ProvisionedIdentity> {
    return this.auth0.provision(input);
  }

  issuePasswordLink(subject: string): Promise<string> {
    return this.of(subject).issuePasswordLink(subject);
  }

  sendPasswordResetLink(subject: string, email: string): Promise<void> {
    return this.of(subject).sendPasswordResetLink(subject, email);
  }

  listLoginMethods(subject: string): Promise<readonly LoginMethod[]> {
    return this.of(subject).listLoginMethods(subject);
  }

  linkLoginMethod(subject: string, idToken: string): Promise<readonly LoginMethod[]> {
    return this.of(subject).linkLoginMethod(subject, idToken);
  }

  unlinkLoginMethod(
    subject: string,
    provider: string,
    secondaryUserId: string,
  ): Promise<readonly LoginMethod[]> {
    return this.of(subject).unlinkLoginMethod(subject, provider, secondaryUserId);
  }

  /**
   * Le fournisseur qui peut répondre de CE sujet.
   *
   * `isProviderSubject` est la même garde que la passerelle Auth0 applique
   * avant tout appel : un sujet qu'elle refuse est un sujet fabriqué ici, donc
   * un sujet que l'adaptateur de développement sait servir. Router dessus fait
   * de cette garde une **aiguille** au lieu d'un mur.
   */
  private of(subject: string): CustomerIdentityPort {
    return isProviderSubject(subject) ? this.auth0 : this.dev;
  }
}
