import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Company } from "../../domain/entities/company.js";
import {
  SiretAlreadyRegisteredError,
  UserProfileNotFoundError,
} from "../../domain/errors/account-errors.js";
import { CompanyDeclaredEvent } from "../../domain/events/company-declared.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { UserProfileRepository } from "../../domain/ports/user-profile.repository.js";
import { EmailAddress } from "../../domain/value-objects/email-address.js";
import { PersonName } from "../../domain/value-objects/person-name.js";
import { PhoneNumber } from "../../domain/value-objects/phone-number.js";
import { CreateCompanyCommand } from "./create-company.command.js";
import { personName, personRef } from "../../domain/events/journal-names.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { customerIntentActor } from "../../../shared/intent/customer-intent-actor.js";

/** Le nom stable du geste, dans le registre des intentions. */
const CREATE_COMPANY_GESTURE = "account.create-company";

/**
 * Déclare l'entreprise et en fait, d'un même geste, celle de son créateur.
 *
 * Retourne l'**identifiant** et rien d'autre : une commande ne renvoie pas de
 * modèle de lecture, le client relit son compte ensuite (cf. CLAUDE.md §4).
 *
 * `@sans-journal` le fait existe déjà, et il n'a qu'un seul auteur :
 * `company.declared` (`via: "self"`), écrit par son abonné — même motif que
 * `CreateCompanyByStaffHandler`. Le tracer ici en ferait un fait à deux
 * écrivains, que les lecteurs d'entonnoir compteraient deux fois.
 * Ce fait-là reste best-effort, hors de la transaction, comme les faits de
 * commande (plan du journal, lot 1 ; décidé le 2026-09-19).
 *
 * **Une fois par intention** : la clé de l'écran est réclamée avant tout et
 * scellée dans la transaction de l'écriture ; un double envoi rend la société déjà déclarée,
 * sans en déclarer une seconde. L'acteur est le client (`customer:<id>`).
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour une autre saisie.
 */
@CommandHandler(CreateCompanyCommand)
export class CreateCompanyHandler implements ICommandHandler<CreateCompanyCommand, string> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly profiles: UserProfileRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: CreateCompanyCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: customerIntentActor(command.ownerUserId),
        key: command.intentKey,
        gesture: CREATE_COMPANY_GESTURE,
        subject: intentSubject("company", {
          raisonSociale: command.raisonSociale,
          enseigne: command.enseigne,
          formeJuridique: command.formeJuridique,
          siret: command.siret,
          siren: command.siren,
          vatNumber: command.vatNumber,
        }),
      },
      CREATED_ID_REPLAY,
      (seal) => this.create(command, seal),
    );
  }

  private async create(
    command: CreateCompanyCommand,
    seal: (companyId: string) => Promise<void>,
  ): Promise<string> {
    const owner = await this.profiles.findById(command.ownerUserId);
    if (owner === null) {
      throw new UserProfileNotFoundError(command.ownerUserId);
    }

    // Le contact de la société = son créateur. Le profil est déjà en base, donc
    // déjà valide ; on le repasse par les value objects parce qu'un enregistrement
    // ancien peut être incomplet (les colonnes de profil sont arrivées avec des
    // défauts vides) — mieux vaut un refus explicite qu'une société au contact vide.
    const company = Company.declare(
      command,
      {
        firstName: PersonName.create(owner.firstName, "Prénom du contact"),
        lastName: PersonName.create(owner.lastName, "Nom du contact"),
        // Le contact dérivé d'un profil n'a pas de fonction ; le staff, lui, en
        // fournit une à la création admin (cf. CreateCompanyByStaffHandler).
        fonction: "",
        email: EmailAddress.create(owner.email),
        phone: PhoneNumber.create(owner.phone),
      },
      "self",
    );

    // Le contrôle d'unicité ne vaut que si on a un SIRET : sans lui, il n'y a
    // rien à dédupliquer, et comparer des chaînes vides ferait de la deuxième
    // société sans papiers un doublon de la première.
    const siret = company.siret;
    if (siret !== null && (await this.companies.existsBySiret(siret.value))) {
      throw new SiretAlreadyRegisteredError(siret.value);
    }

    const companyId = await this.uow.run(async () => {
      const declared = await this.companies.declareOwnedBy(company, command.ownerUserId);
      await seal(declared);
      return declared;
    });
    // Déclarée par le client lui-même : signal `self` (candidat adoption+).
    this.events.publish(
      new CompanyDeclaredEvent(
        companyId,
        company.displayName(),
        "self",
        personRef(command.ownerUserId, personName(owner.firstName, owner.lastName)),
      ),
    );
    return companyId;
  }
}
