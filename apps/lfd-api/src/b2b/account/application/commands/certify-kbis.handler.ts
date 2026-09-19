import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { KbisCertifiedEvent } from "../../domain/events/kbis-certification.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { StaffDirectory } from "../../domain/ports/staff-directory.js";
import { CertifyKbisCommand } from "./certify-kbis.command.js";

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
 * 2. **On garde qui.** L'id de fiche toujours ; le nom et le titre quand l'annuaire
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
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }

    const agent = await this.staff.identify(command.staffUserId);
    const at = this.clock.now();
    // Au journal, DANS la transaction : l'état courant dira « vérifié », mais
    // pas QUAND ni par qui le jour où la vérification sera retirée. Une panne
    // de journal annule donc la certification plutôt que de l'écrire en
    // aveugle — c'est ce qui rend la trace opposable.
    // `certifyKbis` refuse s'il n'y a pas d'extrait — la garde était ici, sur un
    // port de LECTURE lu juste avant une écriture nue. Une vue ne garantit rien.
    company.certifyKbis({
      at,
      byStaffUserId: command.staffUserId,
      byName: agent?.name ?? "",
      byRole: agent?.role ?? "",
    });
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(new KbisCertifiedEvent(command.companyId, at));
    });
  }
}
