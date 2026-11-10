import { Injectable } from "@nestjs/common";

import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import {
  companyNamed,
  deliveryAddressOf,
  personName,
  type DeliveryAddressRef,
  type NamedRef,
} from "../../domain/events/journal-names.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { UserProfileRepository } from "../../domain/ports/user-profile.repository.js";

/**
 * **Les noms qu'un fait des comptes fige** — la société, une adresse du
 * carnet (par son lieu), une personne —, lus au moment du geste (lot B du plan
 * `documentation/journalisation/plan-phrases-du-journal.md`, D5 et D6).
 *
 * Une seule raison d'exister : les handlers qui n'ont pas déjà chargé
 * l'agrégat. Ceux qui l'ont en main le nomment eux-mêmes (`companyNamed`) ;
 * une relecture pour un nom déjà connu serait une requête pour rien.
 *
 * Il lit par les ports d'écriture existants du contexte, et c'est voulu : le
 * nom est celui de l'agrégat, pas celui d'un modèle de lecture qui pourrait
 * dériver.
 */
@Injectable()
export class AccountJournalNames {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly addresses: CompanyAddressRepository,
    private readonly profiles: UserProfileRepository,
  ) {}

  /**
   * La société, sous le nom qu'affichent les écrans.
   *
   * @throws {CompanyNotFoundError} aucune société sous cet identifiant.
   */
  async company(companyId: string): Promise<NamedRef> {
    const company = await this.companies.load(companyId);
    if (company === null) {
      throw new CompanyNotFoundError(companyId);
    }
    return companyNamed(companyId, company);
  }

  /**
   * Une adresse de livraison encore au carnet de la société.
   *
   * @throws {CompanyAddressNotFoundError} l'adresse n'est pas à ce carnet.
   */
  async deliveryAddress(companyId: string, addressId: string): Promise<DeliveryAddressRef> {
    return deliveryAddressOf(await this.addresses.loadDeliveryBook(companyId), addressId);
  }

  /**
   * Le nom du sujet d'une demande de contact — la société s'il y en a une,
   * sinon la personne (même règle que `subjectOf`, côté croissance) —, ou
   * `null` quand le sujet n'a pas de nom. Ne lève pas : le fait qu'il nomme
   * est best-effort, et la demande est déjà écrite quand on le compose.
   */
  async supportSubject(companyId: string | null, userId: string): Promise<string | null> {
    if (companyId === null) {
      return this.person(userId);
    }
    const company = await this.companies.load(companyId);
    return company === null ? null : company.displayName();
  }

  /** « Prénom Nom » d'une personne, ou `null` : profil sans nom, ou personne inconnue. */
  async person(userId: string): Promise<string | null> {
    const profile = await this.profiles.findById(userId);
    return profile === null ? null : personName(profile.firstName, profile.lastName);
  }
}
