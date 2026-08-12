import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../infra/time/clock.js";
import { CompanyNotFoundError, KbisNotFoundError } from "../../domain/errors/account-errors.js";
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

    await this.liftKbisSuspension(command.companyId);
  }

  /**
   * **Relève** la suspension que le retrait de vérification avait provoquée.
   *
   * La symétrie est le point : si couper l'accès est automatique, le rendre doit
   * l'être aussi. Faire cliquer une seconde fois « Réactiver » n'ajouterait
   * aucune décision — la décision était de vérifier l'extrait — mais ajouterait
   * une occasion de l'oublier, et un client resterait bloqué sur un dossier
   * complet.
   *
   * `kbis_revoked` **seulement** : une suspension décidée par un humain (impayé,
   * litige) ne se lève pas parce qu'un document a été validé.
   */
  private async liftKbisSuspension(companyId: string): Promise<void> {
    const company = await this.companies.load(companyId);
    if (company === null || company.suspensionCause !== "kbis_revoked") {
      return;
    }
    company.reactivate();
    await this.companies.save(company);
  }
}

/**
 * Retire la certification — **et suspend le compte s'il était actif**.
 *
 * Ce n'est pas un effet de bord discret, c'est la même règle lue dans l'autre
 * sens : un compte est activable parce que son identité a été vérifiée. Retirer
 * la vérification et laisser le compte commander reviendrait à faire de la
 * certification une formalité d'entrée qu'on peut retirer sans conséquence.
 *
 * La suspension passe par l'agrégat (`suspend()`), qui sait d'où l'on a le droit
 * de venir : un compte `pending` ou déjà suspendu n'est pas touché.
 * Idempotent : décertifier ce qui ne l'est pas ne fait rien.
 *
 * Elle porte sa **cause** (`kbis_revoked`), et c'est elle qui rend la reprise
 * automatique possible sans rouvrir par erreur un compte suspendu pour impayé.
 */
@CommandHandler(RevokeKbisCertificationCommand)
export class RevokeKbisCertificationHandler implements ICommandHandler<
  RevokeKbisCertificationCommand,
  void
> {
  constructor(private readonly companies: CompanyRepository) {}

  async execute(command: RevokeKbisCertificationCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    await this.companies.saveKbisCertification(command.companyId, null);

    if (company.status === "active") {
      company.suspend("kbis_revoked");
      await this.companies.save(company);
    }
  }
}
