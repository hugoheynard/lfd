import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  CompanyActivationBlockedError,
  CompanyNotFoundError,
} from "../../domain/errors/account-errors.js";
import { CompanyActivatedEvent } from "../../domain/events/company-activated.event.js";
import { companyNamed } from "../../domain/events/journal-names.js";
import {
  AdminCompanyReader,
  type AdminCompanyDetailView,
} from "../../domain/ports/admin-company.reader.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { StaffDirectory } from "../../domain/ports/staff-directory.js";
import { AccountHierarchyLock } from "../../domain/ports/account-hierarchy.lock.js";
import { CompanyFollowsReader } from "../../domain/ports/company-follows.reader.js";
import type { Company } from "../../domain/entities/company.js";
import { activationGate } from "../../domain/services/activation-gate.js";
import { ActivateCompanyByStaffCommand } from "./activate-company.command.js";

/**
 * Active un compte client (Porte B). Deux responsabilités, séparées :
 *
 * 1. **Policy de complétude** (ici) : les pièces bloquantes doivent être là. La
 *    liste et le caractère bloquant sont écrits dans `activationGate`, en dur —
 *    plus aucun réglage ne les déplace. Elles croisent plusieurs tables : on les
 *    lit via la fiche staff (`AdminCompanyReader`), c'est une règle
 *    **cross-agrégat**, hors de `Company`.
 * 2. **Transition d'état** (l'agrégat) : `Company.activate()` porte le passage
 *    `pending → active` et **refuse** toute société qui n'est pas `pending`.
 *
 * Aucun mur membership : l'auth staff garde la route en amont.
 *
 * **Sous-comptes** (plan-sous-comptes §2.1 bis) : un sous-compte qui suit
 * `billing` d'un principal actif s'active sans SIRET, sans KBIS ni détenteur
 * propres. Le suivi et le statut du principal sont relus sous le verrou de
 * la hiérarchie, dans la transaction de la transition, et c'est l'agrégat qui
 * tranche : un « cesser de suivre » ou un « détacher » concurrent passe avant
 * ou après, jamais au milieu.
 */
@CommandHandler(ActivateCompanyByStaffCommand)
export class ActivateCompanyByStaffHandler implements ICommandHandler<
  ActivateCompanyByStaffCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly reader: AdminCompanyReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly staff: StaffDirectory,
    private readonly lock: AccountHierarchyLock,
    private readonly follows: CompanyFollowsReader,
  ) {}

  async execute(command: ActivateCompanyByStaffCommand): Promise<void> {
    // La trace suit le même patron que la certification du KBIS : l'id de
    // fiche toujours, le nom et le titre quand l'annuaire les connaît, figés ici.
    const agent = await this.staff.identify(command.staffUserId);
    const by = {
      staffUserId: command.staffUserId,
      name: agent?.name ?? "",
      role: agent?.role ?? "",
    };
    // 1) Policy : la fiche assemble les pièces (plusieurs tables) ; on bloque
    //    si une pièce requise manque. Lue HORS transaction : elle fait ses
    //    lectures en parallèle, ce qu'une connexion de transaction ne sait pas
    //    faire. Ce qu'elle dit du suivi `billing` est donc un premier filtre —
    //    la règle elle-même est retenue par l'agrégat, sous le verrou, plus bas.
    const view = await this.reader.byId(command.companyId);
    if (view === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    const gate = activationGate(view);
    if (gate.blocking.length > 0) {
      throw new CompanyActivationBlockedError(
        command.companyId,
        gate.blocking,
        `Activation impossible : ${gate.blocking.join(", ")}.`,
      );
    }
    await this.uow.run(async () => {
      await this.lock.acquire();
      // 2) Transition via l'agrégat, qui garde l'invariant « pending » — et
      //    relit lui-même ce que porte le principal suivi en `billing`.
      const company = await this.companies.load(command.companyId);
      if (company === null) {
        throw new CompanyNotFoundError(command.companyId);
      }
      const activatedAt = this.clock.now();
      const carrier = await this.billingCarrier(command.companyId, activatedAt);
      // Joignabilité : le détenteur, ou n'importe lequel de ses interlocuteurs.
      company.activate(activatedAt, isReachable(view), by, carrier);
      // Jalon de conversion — et acte d'un agent sur le compte d'un tiers : la
      // trace part dans la transaction de la transition.
      await this.companies.save(company);
      await this.events.publishTraced(
        new CompanyActivatedEvent(companyNamed(command.companyId, company), activatedAt),
      );
    });
  }

  /** Le principal dont ce compte suit `billing` à cet instant, ou `null`. */
  private async billingCarrier(companyId: string, at: Date): Promise<Company | null> {
    const period = await this.follows.followsAt(companyId, "billing", at);
    return period === null ? null : this.companies.load(period.parentId);
  }
}

/**
 * Un numéro **quelque part** : sur le détenteur, ou sur n'importe lequel de ses
 * interlocuteurs. Un livreur qui cherche une porte doit pouvoir appeler
 * quelqu'un ; peu importe qui, tant que ça décroche.
 */
function isReachable(view: AdminCompanyDetailView): boolean {
  return (
    view.primaryContact.phone.trim() !== "" ||
    view.contacts.some((contact) => contact.phone.trim() !== "")
  );
}
