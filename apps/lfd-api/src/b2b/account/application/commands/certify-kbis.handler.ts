import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CompanyNotFoundError, KbisNotFoundError } from "../../domain/errors/account-errors.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import {
  KbisCertificationRevokedEvent,
  KbisCertifiedEvent,
} from "../../domain/events/kbis-certification.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { StaffDirectory } from "../../domain/ports/staff-directory.js";
import { CertifyKbisCommand, RevokeKbisCertificationCommand } from "./certify-kbis.command.js";

/**
 * Certifie le KBIS — le geste qui fait de l'identité une **information
 * vérifiée** plutôt qu'un formulaire rempli.
 *
 * Deux invariants, et ils tiennent tous les deux ici :
 *
 * 1. **Pas de certification sans document.** Certifier « à blanc » produirait un
 *    compte activable dont personne n'a jamais vu l'extrait — exactement ce que
 *    la certification est censée empêcher. L'absence de fichier est un 404 : il
 *    n'y a rien à certifier.
 * 2. **On garde qui.** Le `sub` toujours ; le nom et le titre quand l'annuaire
 *    les connaît. Ils sont figés ici, pas résolus à la lecture : une trace dit
 *    ce qui était vrai ce jour-là, pas ce qui est vrai aujourd'hui.
 */
@CommandHandler(CertifyKbisCommand)
export class CertifyKbisHandler implements ICommandHandler<CertifyKbisCommand, void> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CertifyKbisCommand): Promise<void> {
    const kbis = await this.companies.kbisLocation(command.companyId);
    if (kbis === null) {
      throw new KbisNotFoundError(command.companyId);
    }

    const agent = await this.staff.identify(command.staffSub);
    const at = this.clock.now();
    // Au journal, DANS la transaction : l'état courant dira « vérifié », mais
    // pas QUAND ni par qui le jour où la vérification sera retirée. Une panne
    // de journal annule donc la certification plutôt que de l'écrire en
    // aveugle — c'est ce qui rend la trace opposable.
    await this.uow.run(async () => {
      await this.companies.saveKbisCertification(command.companyId, {
        at,
        bySub: command.staffSub,
        byName: agent?.name ?? "",
        byRole: agent?.role ?? "",
      });
      await this.events.publishTraced(new KbisCertifiedEvent(command.companyId, at));
    });
  }
}

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
    await this.uow.run(async () => {
      await this.companies.saveKbisCertification(command.companyId, null);
      await this.events.publishTraced(
        new KbisCertificationRevokedEvent(command.companyId, this.clock.now(), false),
      );
    });
  }
}
