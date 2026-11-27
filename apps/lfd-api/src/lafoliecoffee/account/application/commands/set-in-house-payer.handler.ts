import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  InHouseDeclaredEvent,
  InHouseWithdrawnEvent,
} from "../../domain/events/in-house-acts.event.js";
import { AccountHierarchyLock } from "../../domain/ports/account-hierarchy.lock.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import {
  InHouseBillingNeighboursReader,
  type InHouseBillingNeighbours,
} from "../../domain/ports/in-house-billing-neighbours.reader.js";
import { InHousePayerRepository } from "../../domain/ports/in-house-payer.repository.js";
import { loadCompany, named } from "../services/account-hierarchy-support.js";
import { SetInHousePayerCommand } from "./set-in-house-payer.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
export const SET_IN_HOUSE_PAYER_GESTURE = "account.set-in-house-payer";

/**
 * Marque une société « maison », ou retire ce marquage — immédiat, il ne vaut
 * que pour les commandes passées ensuite (`restaurants-maison.md`).
 *
 * **Un compte entraîne les sites qui suivent sa facturation** (décidé par
 * Hugo le 2026-11-27) : le marquer ou le démarquer fait de même pour eux,
 * dans la même transaction, chacun avec sa période et son fait. Sans quoi
 * aucun des deux ne pourrait bouger le premier : un suivi `billing` relie
 * deux comptes de même nature. Un site qui suit un principal ne bouge pas
 * seul ; un site qui règle seul se marque à part.
 *
 * Sous le verrou de la hiérarchie : les suivis `billing` relus sont ceux du
 * moment, et un suivi ne s'ouvre pas entre la lecture et l'écriture. Une
 * fois par intention ; rejouer l'état déjà posé n'écrit rien ni ne journalise.
 *
 * @throws {CompanyNotFoundError} la société n'existe pas.
 * @throws {InHousePublicPayerError} marquer un organisme public (le compte ou un de ses sites).
 * @throws {InHouseAcrossBillingFollowError} son principal, ou les sites d'un de ses sites, ont l'autre nature.
 */
@CommandHandler(SetInHousePayerCommand)
export class SetInHousePayerHandler implements ICommandHandler<SetInHousePayerCommand, void> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly payers: InHousePayerRepository,
    private readonly neighbours: InHouseBillingNeighboursReader,
    private readonly lock: AccountHierarchyLock,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
    private readonly ids: IdGenerator,
  ) {}

  execute(command: SetInHousePayerCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: SET_IN_HOUSE_PAYER_GESTURE,
        subject: intentSubject(command.companyId, { inHouse: command.inHouse }),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          await this.lock.acquire();
          const at = this.clock.now();
          const own = await this.neighbours.neighboursOf(command.companyId, at);
          // Les sites qui suivent prennent la nature du compte : ils ne
          // comptent plus comme des voisins de l'autre nature.
          const moved = await this.apply(command, command.companyId, at, {
            principalInHouse: own.principalInHouse,
            sites: own.sites.map((site) => ({ ...site, inHouse: command.inHouse })),
          });
          if (!moved) {
            return;
          }
          for (const site of own.sites) {
            const siteNeighbours = await this.neighbours.neighboursOf(site.companyId, at);
            await this.apply(command, site.companyId, at, {
              ...siteNeighbours,
              principalInHouse: command.inHouse,
            });
          }
          await seal(undefined);
        }),
    );
  }

  /** Marque ou démarque UNE société ; `false` : elle l'était déjà, rien n'est écrit. */
  private async apply(
    command: SetInHousePayerCommand,
    companyId: string,
    at: Date,
    neighbours: InHouseBillingNeighbours,
  ): Promise<boolean> {
    const loaded = await loadCompany(this.companies, companyId);
    const payer = await this.payers.load(loaded.id);
    const by = command.staffUserId;
    const changed = command.inHouse
      ? payer.declare({ company: loaded.company, neighbours, id: this.ids.next(), at, by })
      : payer.withdraw({ neighbours, at, by });
    if (!changed) {
      return false;
    }
    await this.payers.save(payer);
    await this.events.publishTraced(
      command.inHouse
        ? new InHouseDeclaredEvent(named(loaded))
        : new InHouseWithdrawnEvent(named(loaded)),
    );
    return true;
  }
}
