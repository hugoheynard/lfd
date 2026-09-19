import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { KbisCertificationRevokedEvent } from "../../domain/events/kbis-certification.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { RevokeKbisCertificationCommand } from "./revoke-kbis-certification.command.js";

/**
 * Retire la certification — **et ne touche pas au compte**.
 *
 * Elle suspendait, autrefois : « un compte est activable parce que son identité
 * a été vérifiée ». La règle a changé, et c'est une décision commerciale
 * assumée — la vérification du KBIS est une **convention interne**, pas une
 * condition d'exercice. Couper la commande d'une boulangerie pour un PDF, c'est
 * payer une perte certaine (la commande de demain matin) contre un risque qui
 * ne se matérialise qu'à la facturation, sur des clients que le commercial a
 * vus. Le manque se voit ailleurs — dans la file de vérification — au lieu de
 * se venger sur le chiffre.
 *
 * Ce chemin rejoint donc celui du **remplacement** d'extrait, qui décertifiait
 * déjà sans suspendre : deux gestes menant au même état ne peuvent pas avoir
 * deux conséquences. C'était l'incohérence, pas la règle.
 *
 * Idempotent : décertifier ce qui ne l'est pas ne fait rien.
 */
@CommandHandler(RevokeKbisCertificationCommand)
export class RevokeKbisCertificationHandler implements ICommandHandler<
  RevokeKbisCertificationCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RevokeKbisCertificationCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    // Sans cette trace, le retrait serait INTROUVABLE le lendemain : l'état
    // courant redevient « déposé, pas vérifié », comme si rien ne s'était passé.
    // `suspended` reste à faux — plus aucun retrait ne coupe l'accès.
    company.revokeKbisCertification();
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new KbisCertificationRevokedEvent(command.companyId, this.clock.now(), false),
      );
    });
  }
}
