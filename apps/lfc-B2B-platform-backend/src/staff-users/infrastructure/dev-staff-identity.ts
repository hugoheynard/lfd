import { Injectable, Logger } from "@nestjs/common";

import {
  StaffIdentityPort,
  type IdentityToProvision,
  type ProvisionedIdentity,
} from "../domain/staff-identity.port.js";

/**
 * Fournisseur d'identité staff de **DÉVELOPPEMENT** — aucun appel réseau.
 *
 * Sans M2M configuré, inviter un collègue remonterait une erreur, et le
 * parcours « je crée une fiche, je l'invite, je la vois passer à *Invitée* »
 * serait injouable en local. C'est pourtant celui qu'on a le plus besoin de
 * rejouer, puisqu'il n'existe que depuis aujourd'hui.
 *
 * Le `sub` est **déterministe** : rejouer le même scénario retombe sur la même
 * personne, sinon « cette adresse est-elle déjà connue ? » ne se testerait
 * jamais. Le préfixe le distingue du double client : deux connexions, deux
 * identités, y compris dans la simulation.
 *
 * **Fail-closed** : monté à deux conditions seulement (cf. `StaffUsersModule`) —
 * pas de M2M **et** pas en production. En prod sans M2M, c'est l'adaptateur
 * Auth0 qui reste en place et refuse clairement ; on ne fabrique pas d'accès
 * fantôme au back-office.
 */
@Injectable()
export class DevStaffIdentity extends StaffIdentityPort {
  private readonly logger = new Logger(DevStaffIdentity.name);

  provision(input: IdentityToProvision): Promise<ProvisionedIdentity> {
    const subject = devSubject(input.email);
    this.logger.warn(`[dev] identité staff fabriquée localement pour ${input.email} (${subject})`);
    return Promise.resolve({ subject, passwordSetupUrl: devPasswordUrl(subject) });
  }

  issuePasswordLink(subject: string): Promise<string> {
    this.logger.warn(`[dev] lien de mot de passe staff factice pour ${subject}`);
    return Promise.resolve(devPasswordUrl(subject));
  }
}

/** Déterministe, et **préfixé staff** : le double d'un client n'est pas le sien. */
function devSubject(email: string): string {
  return `dev-staff|${email.trim().toLowerCase()}`;
}

/** Visiblement faux : personne ne doit croire que ce lien ouvre quoi que ce soit. */
function devPasswordUrl(subject: string): string {
  return `https://dev.invalid/staff/mot-de-passe/${encodeURIComponent(subject)}`;
}
