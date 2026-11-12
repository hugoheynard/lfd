import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { KbisCertifiedEvent } from "../../domain/events/kbis-certification.event.js";
import { companyNamed } from "../../domain/events/journal-names.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { StaffDirectory } from "../../domain/ports/staff-directory.js";
import { CertifyKbisCommand } from "./certify-kbis.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const CERTIFY_KBIS_GESTURE = "account.certify-kbis";

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
 *
 * **Une fois par intention** : certifier RE-DATE la vérification (un geste
 * voulu, quand l'agent relit un extrait) et écrit un fait. Un double clic ne
 * doit donc pas certifier deux fois : la clé de l'écran est réclamée avant
 * tout et scellée dans la transaction de la certification ; le rejeu ne
 * réécrit rien. Une vraie seconde certification est une intention neuve.
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour une autre certification.
 */
@CommandHandler(CertifyKbisCommand)
export class CertifyKbisHandler implements ICommandHandler<CertifyKbisCommand, void> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: CertifyKbisCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: CERTIFY_KBIS_GESTURE,
        subject: intentSubject(command.companyId, command.issuedOn),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.certify(command, seal),
    );
  }

  private async certify(
    command: CertifyKbisCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
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
      issuedOn: command.issuedOn,
    });
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new KbisCertifiedEvent(companyNamed(command.companyId, company), at, command.issuedOn),
      );
      await seal();
    });
  }
}
