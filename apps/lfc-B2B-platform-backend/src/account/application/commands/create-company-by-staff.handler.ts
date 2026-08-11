import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../infra/events/domain-event-publisher.js";
import { Company } from "../../domain/entities/company.js";
import { SiretAlreadyRegisteredError } from "../../domain/errors/account-errors.js";
import { CompanyDeclaredEvent } from "../../domain/events/company-declared.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { AccountAccessGranter } from "../services/grant-account-access.service.js";
import { CreateCompanyByStaffCommand } from "./create-company-by-staff.command.js";

/**
 * Ce qu'une ouverture de compte rapporte : l'identifiant, et **ce qui est
 * réellement arrivé à l'accès**.
 *
 * Pas un modèle de lecture (le front relit la fiche ensuite) — trois faits que
 * lui seul ne peut pas déduire : le compte a-t-il un détenteur, était-ce un
 * client déjà connu, et l'e-mail est-il parti. Sans eux, l'écran devrait
 * inventer un message.
 */
export interface CompanyOpened {
  readonly id: string;
  /** Faux si le canal d'identité est indisponible : la société existe, l'accès non. */
  readonly accessOpened: boolean;
  /** Vrai si la société a rejoint l'espace d'un client **déjà** connu. */
  readonly attachedToExisting: boolean;
  readonly mailSent: boolean;
}

/**
 * Ouvre le **dossier société** d'un compte client depuis l'admin, et rattache
 * son **détenteur** — la personne qui se connectera.
 *
 * Contact principal et détenteur sont la **même** personne : celui qu'on
 * rappelle est celui qui commande. Les séparer était une distinction de modèle
 * sans réalité commerciale ; un interlocuteur qui ne se connecte pas reste un
 * `CompanyContact`.
 *
 * L'ordre compte : la société d'abord, l'accès ensuite. Provisionner une
 * identité avant le contrôle d'unicité du SIRET laisserait un utilisateur
 * orphelin chez le fournisseur à chaque doublon de saisie.
 *
 * **Un accès qui échoue ne perd pas le dossier.** Sans canal d'identité
 * configuré (dev, CI), la société est créée et l'écran le dit : refuser la
 * création entière ferait perdre une saisie faite au téléphone pour une raison
 * qui ne regarde pas le commercial.
 */
@CommandHandler(CreateCompanyByStaffCommand)
export class CreateCompanyByStaffHandler implements ICommandHandler<
  CreateCompanyByStaffCommand,
  CompanyOpened
> {
  private readonly logger = new Logger(CreateCompanyByStaffHandler.name);

  constructor(
    private readonly companies: CompanyRepository,
    private readonly access: AccountAccessGranter,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: CreateCompanyByStaffCommand): Promise<CompanyOpened> {
    // Contact saisi par le staff : on le fait passer par le value object, qui en
    // tient les règles (prénom/nom présents, e-mail valide, fonction bornée).
    const company = Company.declare(command, ContactDetails.create(command.contact));

    // Le contrôle d'unicité ne vaut que si on a un SIRET : sans lui, il n'y a
    // rien à dédupliquer, et comparer des chaînes vides ferait de la deuxième
    // société sans papiers un doublon de la première.
    const siret = company.siret;
    if (siret !== null && (await this.companies.existsBySiret(siret.value))) {
      throw new SiretAlreadyRegisteredError(siret.value);
    }

    const companyId = await this.companies.declareUnowned(company);
    // Déclarée par le staff (démarchage) : signal `staff`.
    this.events.publish(new CompanyDeclaredEvent(companyId, "staff", null));

    return { id: companyId, ...(await this.openAccess(command, company, companyId)) };
  }

  /** Rattache le détenteur, ou dit pourquoi il n'a pas pu l'être. */
  private async openAccess(
    command: CreateCompanyByStaffCommand,
    company: Company,
    companyId: string,
  ): Promise<Omit<CompanyOpened, "id">> {
    try {
      const granted = await this.access.grant({
        companyId,
        // Le nom d'USAGE : la raison sociale est facultative à l'ouverture (les
        // papiers arrivent après), et un e-mail intitulé « Votre accès à
        // l'espace pro  » n'aide personne.
        companyName: company.displayName(),
        email: command.contact.email,
        firstName: command.contact.firstName,
        lastName: command.contact.lastName,
        phone: command.contact.phone,
        // DÉTENTEUR : celui dont l'adresse ouvre le compte. Ce rôle ne
        // s'attribue pas — il se constate, ici et nulle part ailleurs.
        role: "owner",
        invitedBy: command.invitedBy,
      });
      return {
        accessOpened: true,
        // Seul le client **actif** rejoint un espace existant. Celui qui n'avait
        // jamais posé de mot de passe vient d'en recevoir le lien : le dire
        // « rattaché » ferait croire au commercial qu'il n'a rien à attendre.
        attachedToExisting: granted.outcome === "attached",
        mailSent: granted.mailSent,
      };
    } catch (error) {
      this.logger.error(`Accès non ouvert pour la société ${companyId}`, error);
      return { accessOpened: false, attachedToExisting: false, mailSent: false };
    }
  }
}
