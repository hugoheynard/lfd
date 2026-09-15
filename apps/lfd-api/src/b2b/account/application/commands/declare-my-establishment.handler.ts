import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Company, type CompanyContact } from "../../domain/entities/company.js";
import { UserProfile } from "../../domain/entities/user-profile.js";
import {
  PersonAlreadyAttachedError,
  UserProfileNotFoundError,
} from "../../domain/errors/account-errors.js";
import { CompanyDeclaredEvent } from "../../domain/events/company-declared.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { PersonAttachmentLock } from "../../domain/ports/person-attachment.lock.js";
import { UserProfileRepository } from "../../domain/ports/user-profile.repository.js";
import { DeclareMyEstablishmentCommand } from "./declare-my-establishment.command.js";

/**
 * La porte pro : profil, puis société `pending` dont la personne devient le
 * détenteur — tout ou rien.
 *
 * **Tout se valide avant la transaction.** Profil et société sont construits
 * par leurs value objects d'abord : une saisie refusée ne touche pas la base,
 * pas même pour un verrou, et chaque refus remonte tel que le value object l'a
 * formulé.
 *
 * **Une seule unité de travail** pour le verrou, le profil et la société :
 * `declareOwnedBy` y entre par `transactionalPrisma` (vérifié le 2026-09-14 :
 * son `$transaction` en callback rejoint la transaction ambiante). Un profil
 * posé sans société laisserait la carte « Compléter mon dossier » redemander ce
 * que la personne vient de saisir.
 *
 * **Aucun appel à Auth0** : l'adresse reste celle du compte, le profil révisé
 * n'annonce donc aucun changement d'adresse, et la preuve n'est pas touchée.
 *
 * Journal : même traitement que `CreateCompanyHandler`, l'autre déclaration par
 * le client lui-même — un `CompanyDeclaredEvent` best-effort, publié APRÈS le
 * commit pour qu'aucun abonné ne lise une société qui n'existe pas encore.
 */
@CommandHandler(DeclareMyEstablishmentCommand)
export class DeclareMyEstablishmentHandler implements ICommandHandler<
  DeclareMyEstablishmentCommand,
  string
> {
  constructor(
    private readonly profiles: UserProfileRepository,
    private readonly companies: CompanyRepository,
    private readonly attachments: PersonAttachmentLock,
    private readonly uow: UnitOfWork,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: DeclareMyEstablishmentCommand): Promise<string> {
    const current = await this.profiles.findById(command.userId);
    if (current === null) {
      throw new UserProfileNotFoundError(command.userId);
    }

    const profile = UserProfile.revise(current.email, { ...command, email: current.email });
    const company = Company.declare(
      {
        raisonSociale: "",
        enseigne: command.enseigne,
        formeJuridique: "",
        siret: "",
        siren: "",
        vatNumber: "",
      },
      contactFrom(profile),
    );

    const companyId = await this.uow.run(async () => {
      if (await this.attachments.acquireAndCheckAttached(command.userId)) {
        throw new PersonAlreadyAttachedError(command.userId);
      }
      await this.profiles.save(command.userId, profile);
      return this.companies.declareOwnedBy(company, command.userId);
    });

    this.events.publish(new CompanyDeclaredEvent(companyId, "self", command.userId));
    return companyId;
  }
}

/** Le contact de la société EST la personne qui la déclare, sans fonction saisie. */
function contactFrom(profile: UserProfile): CompanyContact {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    fonction: "",
    email: profile.email,
    phone: profile.phone,
  };
}
