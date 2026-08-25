import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import {
  CompanyIdentityCorrectedEvent,
  KbisUploadedByStaffEvent,
  PaymentTermsGrantedEvent,
} from "../../domain/events/staff-acts.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import {
  GrantTermsCommand,
  UpdateIdentityByStaffCommand,
  UploadKbisByStaffCommand,
} from "./admin-company-commands.js";
import { ingestKbis } from "./ingest-kbis.js";

/**
 * Handlers **staff** (Porte B) des pièces d'activation. Ils ne rejouent **aucun
 * mur membership** — l'auth staff (`AdminAuthGuard`) garde la route en amont, et
 * le staff n'est membre d'aucune société. Chacun délègue directement au même
 * port d'écriture que son homologue client : la logique de persistance n'est
 * écrite qu'une fois, seul le mur diffère.
 */

/**
 * Dépôt de l'extrait par un agent, à la place du client.
 *
 * `@hors-transaction` le fichier part d'abord au stockage objet, qui n'a pas de
 * transaction. Enfermer cet aller-retour réseau dans celle de la base coûterait
 * plus que le trou qu'il refermerait : une panne de journal échoue la requête
 * sans annuler le dépôt — l'agent le voit, et le fichier se redépose à la même
 * clé.
 */
@CommandHandler(UploadKbisByStaffCommand)
export class UploadKbisByStaffHandler implements ICommandHandler<UploadKbisByStaffCommand, void> {
  constructor(
    private readonly store: DocumentStore,
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: UploadKbisByStaffCommand): Promise<void> {
    await ingestKbis(
      command.companyId,
      command.fileName,
      command.bytes,
      this.store,
      this.companies,
      this.events,
    );
    // Tracé APRÈS, et hors transaction — seul acte du lot dans ce cas. Le dépôt
    // range d'abord le fichier au stockage objet, qui n'a pas de transaction :
    // enfermer cet aller-retour réseau dans celle de la base serait pire que le
    // trou qu'on refermerait. Une panne de journal échoue donc la requête sans
    // annuler le dépôt — l'agent le voit, et le fichier se redépose.
    await this.events.publishTraced(
      new KbisUploadedByStaffEvent(command.companyId, command.fileName),
    );
  }
}

@CommandHandler(UpdateIdentityByStaffCommand)
export class UpdateIdentityByStaffHandler implements ICommandHandler<
  UpdateIdentityByStaffCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateIdentityByStaffCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.editSoftIdentity(command.payload);
    // Le back-office **corrige** là où le client ne fait que compléter : une
    // faute de frappe saisie au comptoir restait gravée, et le compte portait
    // une identité fausse sans recours. Un champ vide ne réécrit rien.
    const identity = {
      raisonSociale: command.payload.raisonSociale,
      formeJuridique: command.payload.formeJuridique,
      siret: command.payload.siret,
    };
    company.correctLegalIdentity(identity);
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new CompanyIdentityCorrectedEvent(command.companyId, identity),
      );
    });

    // Pièce « TVA » franchie dès qu'un numéro est présent (idempotent par étape).
    if (command.payload.vatNumber.trim() !== "") {
      this.events.publish(new CompanyStepReachedEvent(command.companyId, "vat"));
    }
  }
}

@CommandHandler(GrantTermsCommand)
export class GrantTermsHandler implements ICommandHandler<GrantTermsCommand, void> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: GrantTermsCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.grantTerms(command.grantedTerms);
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new PaymentTermsGrantedEvent(command.companyId, command.grantedTerms),
      );
    });
  }
}
