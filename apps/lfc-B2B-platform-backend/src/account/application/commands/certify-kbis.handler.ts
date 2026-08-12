import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../infra/time/clock.js";
import { KbisNotFoundError } from "../../domain/errors/account-errors.js";
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
  ) {}

  async execute(command: CertifyKbisCommand): Promise<void> {
    const kbis = await this.companies.kbisLocation(command.companyId);
    if (kbis === null) {
      throw new KbisNotFoundError(command.companyId);
    }

    const agent = await this.staff.identify(command.staffSub);
    await this.companies.saveKbisCertification(command.companyId, {
      at: this.clock.now(),
      bySub: command.staffSub,
      byName: agent?.name ?? "",
      byRole: agent?.role ?? "",
    });
  }
}

/** Retire la certification. Idempotent : décertifier ce qui ne l'est pas ne fait rien. */
@CommandHandler(RevokeKbisCertificationCommand)
export class RevokeKbisCertificationHandler implements ICommandHandler<
  RevokeKbisCertificationCommand,
  void
> {
  constructor(private readonly companies: CompanyRepository) {}

  async execute(command: RevokeKbisCertificationCommand): Promise<void> {
    await this.companies.saveKbisCertification(command.companyId, null);
  }
}
