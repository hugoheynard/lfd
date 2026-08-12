import { Injectable } from "@nestjs/common";

import {
  CompanyNotFoundError,
  ContactAlreadyExistsError,
} from "../../domain/errors/account-errors.js";
import { CompanyContactRepository } from "../../domain/ports/company-contact.repository.js";
import { CompanyMemberRepository } from "../../domain/ports/company-member.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import type { AssignableRole } from "../../domain/value-objects/company-role.js";
import type { ContactDetails } from "../../domain/value-objects/contact-details.js";

/**
 * Le **carnet d'interlocuteurs** d'une société, et les deux règles qui le
 * tiennent — partagées par les deux portes (le client gère les siens, le
 * commercial complète à sa place).
 *
 * **Une adresse, un interlocuteur.** Deux lignes pour la même boîte donneraient
 * deux rôles à la même personne dans la même société, et l'accès ouvert depuis
 * l'une contredirait celui affiché sur l'autre. L'unicité entre lignes du carnet
 * est tenue par la base (index unique) ; celle avec le **détenteur** se vérifie
 * ici, parce qu'il vit aplati sur la société et non dans le carnet.
 *
 * **Un rôle, pas deux.** Le rôle affiché sur la fiche est celui du contact ; les
 * droits réels vivent sur le rattachement. Les laisser diverger, c'est montrer
 * « Facturation » à quelqu'un qui administre l'espace. Toute écriture du carnet
 * aligne donc le rattachement — quand il y en a un.
 */
@Injectable()
export class CompanyContactBook {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly contacts: CompanyContactRepository,
    private readonly members: CompanyMemberRepository,
  ) {}

  /** Ajoute un interlocuteur, et rend son identifiant. */
  async add(companyId: string, details: ContactDetails, role: AssignableRole): Promise<string> {
    await this.ensureNotTheHolder(companyId, details.email.value);
    const contactId = await this.contacts.add(companyId, details, role);
    await this.alignAccess(companyId, details.email.value, role);
    return contactId;
  }

  /** Remplace un interlocuteur — coordonnées **et** rôle. */
  async replace(
    companyId: string,
    contactId: string,
    details: ContactDetails,
    role: AssignableRole,
  ): Promise<void> {
    await this.ensureNotTheHolder(companyId, details.email.value);
    await this.contacts.update(companyId, contactId, details, role);
    await this.alignAccess(companyId, details.email.value, role);
  }

  /**
   * L'adresse du **détenteur** n'entre pas dans le carnet.
   *
   * Il y figure déjà — la fiche le rend en tête de liste. L'y ajouter une
   * seconde fois créerait deux cartes pour une personne, avec deux rôles dont
   * un seul serait appliqué.
   */
  private async ensureNotTheHolder(companyId: string, email: string): Promise<void> {
    const company = await this.companies.load(companyId);
    if (company === null) {
      throw new CompanyNotFoundError(companyId);
    }
    // Pas encore de détenteur ⇒ aucune adresse à protéger : le carnet accepte.
    if (sameAddress(company.contact?.email.value ?? "", email)) {
      throw new ContactAlreadyExistsError(email);
    }
  }

  /**
   * Aligne les droits réels sur le rôle affiché — **sans jamais créer d'accès**.
   *
   * Noter un interlocuteur et lui donner les clés de l'espace restent deux
   * décisions : `alignRole` ne fait rien si la personne n'a pas de rattachement,
   * et c'est exactement ce qu'on veut du responsable réception qu'on vient
   * d'ajouter au carnet.
   */
  private async alignAccess(companyId: string, email: string, role: AssignableRole): Promise<void> {
    const account = await this.members.findAccountByEmail(email);
    if (account === null) {
      return;
    }
    await this.members.alignRole(account.userId, companyId, role);
  }
}

/** Deux adresses sont la même boîte, quelle qu'en soit la casse. */
function sameAddress(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
