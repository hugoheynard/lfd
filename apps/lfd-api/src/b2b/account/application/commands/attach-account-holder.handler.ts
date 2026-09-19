import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CompanyAccessOpenedEvent } from "../../domain/events/person-acts.event.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { AccountAccessGranter } from "../services/grant-account-access.service.js";
import { AttachAccountHolderCommand } from "./attach-account-holder.command.js";
import { companyNamed, contactRef } from "../../domain/events/journal-names.js";

/** Ce que le rattachement rapporte : seulement ce que l'écran ne peut pas deviner. */
export interface HolderAttached {
  /** Faux si l'e-mail n'est pas parti : le staff doit l'apprendre tout de suite. */
  readonly mailSent: boolean;
}

/**
 * Rattache le détenteur d'un compte ouvert sans lui.
 *
 * **L'accès d'abord, la fiche ensuite** — l'ordre est ce qui rend le geste
 * rejouable. Écrire le contact en premier puis échouer sur le fournisseur
 * d'identité laisserait une société avec un détenteur en fiche et personne
 * derrière ; et la deuxième tentative se ferait refuser par `attachHolder`, qui
 * verrait la place déjà prise. Dans cet ordre, un échec ne laisse rien, et une
 * reprise repasse — l'ouverture d'accès est idempotente sur l'adresse.
 *
 * Un échec du fournisseur **remonte**, contrairement à l'ouverture de compte :
 * là-bas la société valait d'être gardée même sans accès, ici l'accès EST
 * l'appel. L'avaler annoncerait un rattachement qui n'a pas eu lieu.
 *
 * `@hors-transaction` l'ouverture d'accès passe par le fournisseur d'identité
 * et le mailer, hors de toute transaction. Le fait `company.access_opened`
 * (rôle `owner`) part après elle, dans la transaction qui range le détenteur
 * sur la fiche (depuis le 2026-09-19) : les deux tombent ensemble, et une
 * reprise repasse par le même chemin que ci-dessus.
 */
@CommandHandler(AttachAccountHolderCommand)
export class AttachAccountHolderHandler implements ICommandHandler<
  AttachAccountHolderCommand,
  HolderAttached
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly access: AccountAccessGranter,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AttachAccountHolderCommand): Promise<HolderAttached> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    // Refusé ICI, avant tout effet de bord : découvrir qu'un détenteur existe
    // après avoir provisionné une identité laisserait un compte de trop chez le
    // fournisseur pour une saisie que le domaine allait rejeter.
    const contact = ContactDetails.create(command.contact);
    company.attachHolder(contact);

    const granted = await this.access.grant({
      companyId: command.companyId,
      // Le nom d'USAGE : c'est sous celui-là que le client se reconnaîtra dans
      // l'e-mail qu'il va recevoir.
      companyName: company.displayName(),
      email: command.contact.email,
      firstName: command.contact.firstName,
      lastName: command.contact.lastName,
      phone: command.contact.phone,
      // DÉTENTEUR : celui dont l'adresse ouvre le compte. Le rôle se constate.
      role: "owner",
      invitedBy: command.invitedBy,
    });

    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new CompanyAccessOpenedEvent(
          companyNamed(command.companyId, company),
          contactRef(granted.userId, contact),
          "owner",
        ),
      );
    });
    return { mailSent: granted.mailSent };
  }
}
