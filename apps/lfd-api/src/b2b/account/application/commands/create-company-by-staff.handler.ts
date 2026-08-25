import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Company } from "../../domain/entities/company.js";
import { SiretAlreadyRegisteredError } from "../../domain/errors/account-errors.js";
import { CompanyDeclaredEvent } from "../../domain/events/company-declared.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { AccountAccessGranter } from "../services/grant-account-access.service.js";
import { CreateCompanyByStaffCommand } from "./create-company-by-staff.command.js";

/**
 * Ce qu'il est advenu du **détenteur** à l'ouverture — trois issues, pas deux
 * booléens.
 *
 * `deferred` (aucune adresse saisie) et `failed` (le canal d'identité n'a pas
 * répondu) sont l'un un choix et l'autre une panne : les confondre sous un
 * « accès non ouvert » ferait annoncer un incident là où le commercial a
 * simplement remis le rattachement à plus tard.
 */
export type HolderOutcome = "attached" | "deferred" | "failed";

/**
 * Ce qu'une ouverture de compte rapporte : l'identifiant, et **ce qui est
 * réellement arrivé à l'accès**.
 *
 * Pas un modèle de lecture (le front relit la fiche ensuite) — deux faits que
 * lui seul ne peut pas déduire : le sort du détenteur, et si l'e-mail est parti.
 * Sans eux, l'écran devrait inventer un message.
 */
export interface CompanyOpened {
  readonly id: string;
  readonly holder: HolderOutcome;
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
/**
 * `@sans-journal` le fait existe déjà, et il n'a qu'un seul auteur.
 *
 * `company.declared` est écrit par son abonné, avec `via: "staff"` — donc « qui
 * a ouvert ce compte » a bien une réponse. Le tracer ici en ferait un fait à
 * deux écrivains : le chemin client passerait par l'abonné, le chemin staff par
 * la transaction, et les lecteurs d'entonnoir (`prisma-activation.reader`)
 * verraient deux lignes pour une même déclaration. Le passer bloquant des DEUX
 * côtés est un autre chantier — celui du chemin d'inscription client, qu'on ne
 * bloque pas sur un hoquet d'`INSERT`.
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
    // tient les règles (e-mail valide, fonction bornée). Absent, c'est `null` —
    // pas un contact aux champs vides (cf. `CompanyContact`).
    const contact = command.contact === null ? null : ContactDetails.create(command.contact);
    const company = Company.declare(command, contact);

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

  /** Rattache le détenteur, ou dit pourquoi il ne l'a pas été. */
  private async openAccess(
    command: CreateCompanyByStaffCommand,
    company: Company,
    companyId: string,
  ): Promise<Omit<CompanyOpened, "id">> {
    const contact = command.contact;
    if (contact === null) {
      // Pas d'adresse, donc rien à tenter : le dossier existe, le détenteur
      // viendra. Ce n'est pas un échec, et l'écran ne doit pas le dire comme
      // tel.
      return { holder: "deferred", mailSent: false };
    }
    try {
      const granted = await this.access.grant({
        companyId,
        // Le nom d'USAGE : la raison sociale est facultative à l'ouverture (les
        // papiers arrivent après), et un e-mail intitulé « Votre accès à
        // l'espace pro  » n'aide personne.
        companyName: company.displayName(),
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        // DÉTENTEUR : celui dont l'adresse ouvre le compte. Ce rôle ne
        // s'attribue pas — il se constate, ici et nulle part ailleurs.
        role: "owner",
        invitedBy: command.invitedBy,
      });
      // On ne dit PAS si la personne était déjà connue : ce serait apprendre au
      // commercial que cette adresse travaille avec un autre de nos clients.
      // L'issue reste au serveur, où elle choisit l'e-mail qui part.
      return { holder: "attached", mailSent: granted.mailSent };
    } catch (error) {
      this.logger.error(`Accès non ouvert pour la société ${companyId}`, error);
      return { holder: "failed", mailSent: false };
    }
  }
}
