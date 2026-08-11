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

    if (await this.companies.existsBySiret(company.siret.value)) {
      throw new SiretAlreadyRegisteredError(company.siret.value);
    }

    const companyId = await this.companies.declareUnowned(company);
    // Déclarée par le staff (démarchage) : signal `staff`.
    this.events.publish(new CompanyDeclaredEvent(companyId, "staff", null));

    return { id: companyId, ...(await this.openAccess(command, companyId)) };
  }

  /** Rattache le détenteur, ou dit pourquoi il n'a pas pu l'être. */
  private async openAccess(
    command: CreateCompanyByStaffCommand,
    companyId: string,
  ): Promise<Omit<CompanyOpened, "id">> {
    try {
      const granted = await this.access.grant({
        companyId,
        companyName: command.raisonSociale,
        email: command.contact.email,
        firstName: command.contact.firstName,
        lastName: command.contact.lastName,
        phone: command.contact.phone,
        // Détenteur : il administre son espace, c'est le sens du rattachement.
        role: "company_admin",
        invitedBy: command.invitedBy,
      });
      return {
        accessOpened: true,
        attachedToExisting: !granted.identityCreated,
        mailSent: granted.mailSent,
      };
    } catch (error) {
      this.logger.error(`Accès non ouvert pour la société ${companyId}`, error);
      return { accessOpened: false, attachedToExisting: false, mailSent: false };
    }
  }
}
