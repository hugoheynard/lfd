import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { Company } from "../../domain/entities/company.js";
import { SubAccountFollows } from "../../domain/entities/sub-account-follows.js";
import { SiretAlreadyRegisteredError } from "../../domain/errors/account-errors.js";
import { PricingFollowNotAllowedError } from "../../domain/errors/hierarchy-errors.js";
import { CompanyDeclaredEvent } from "../../domain/events/company-declared.event.js";
import {
  ParentAttachedEvent,
  ParentFollowedEvent,
} from "../../domain/events/hierarchy-acts.event.js";
import { companyNamed } from "../../domain/events/journal-names.js";
import { AccountHierarchyLock } from "../../domain/ports/account-hierarchy.lock.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { CompanyFollowsRepository } from "../../domain/ports/company-follows.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { InHousePayerReader } from "../../domain/ports/in-house-payer.reader.js";
import { PricingFollowJournal } from "../../domain/ports/pricing-follow.journal.js";
import { StaffDirectory } from "../../domain/ports/staff-directory.js";
import { ensureBillingFollowKeepsInHouse } from "../../domain/services/in-house-billing-follow.js";
import { CompanyOpening } from "../../domain/value-objects/company-opening.js";
import { loadCompany, named } from "../services/account-hierarchy-support.js";
import { CreateSubAccountCommand } from "./create-sub-account.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const CREATE_SUB_ACCOUNT_GESTURE = "account.create-sub-account";

/**
 * Crée un sous-compte rattaché à son principal, en UNE transaction : la
 * société, son lien, sa première adresse de livraison (si donnée) et ses suivis tombent
 * ensemble ou tiennent ensemble.
 *
 * Sous le verrou de la hiérarchie (§5) : le principal est relu après le
 * verrou, et c'est l'agrégat qui refuse un principal lui-même sous-compte.
 *
 * **Une fois par intention** : la clé de l'écran est réclamée avant tout et
 * scellée dans la transaction de la création ; un double clic rend le
 * sous-compte déjà créé, sans second compte ni second fait. Le sujet est le
 * principal et l'empreinte de la saisie.
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour une autre création.
 */
@CommandHandler(CreateSubAccountCommand)
export class CreateSubAccountHandler implements ICommandHandler<CreateSubAccountCommand, string> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly addresses: CompanyAddressRepository,
    private readonly follows: CompanyFollowsRepository,
    private readonly lock: AccountHierarchyLock,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly pricingJournal: PricingFollowJournal,
    private readonly intents: OncePerIntent,
    private readonly staff: StaffDirectory,
    private readonly inHouse: InHousePayerReader,
  ) {}

  execute(command: CreateSubAccountCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: CREATE_SUB_ACCOUNT_GESTURE,
        subject: intentSubject(command.parentId, command.payload),
      },
      CREATED_ID_REPLAY,
      (seal) => this.create(command, seal),
    );
  }

  private async create(
    command: CreateSubAccountCommand,
    seal: (companyId: string) => Promise<void>,
  ): Promise<string> {
    const aspects = [...new Set(command.payload.follows)];
    if (aspects.includes("pricing") && !command.mayDecidePricing) {
      throw new PricingFollowNotAllowedError();
    }
    const company = Company.declare(
      command.payload,
      null,
      "staff",
      await this.siteOpenedBy(command.staffUserId),
    );
    const siret = company.siret;
    if (siret !== null && (await this.companies.existsBySiret(siret.value))) {
      throw new SiretAlreadyRegisteredError(siret.value);
    }
    const now = this.clock.now();

    const companyId = await this.uow.run(async () => {
      await this.lock.acquire();
      const parent = await loadCompany(this.companies, command.parentId);
      company.attachTo(parent.company);
      const id = await this.companies.declareUnowned(company);

      await this.addFirstAddress(id, command, now);

      const follows = SubAccountFollows.none(id);
      // Un site neuf n'est jamais maison : il ne suit pas la facturation d'un principal maison (D3).
      const parentInHouse = await this.inHouse.isInHousePayer(parent.id);
      for (const aspect of aspects) {
        ensureBillingFollowKeepsInHouse({
          aspect,
          parentId: parent.id,
          childInHouse: false,
          parentInHouse,
        });
        follows.follow(aspect, company, parent.company, now);
      }
      await this.follows.save(follows);

      const child = companyNamed(id, company);
      await this.events.publishTraced(new ParentAttachedEvent(child, named(parent), "created"));
      for (const aspect of aspects) {
        // `pricing` va au journal des prix (S3) ; les autres au journal général.
        await (aspect === "pricing"
          ? this.pricingJournal.followStarted({ child, parent: named(parent), validFrom: now })
          : this.events.publishTraced(new ParentFollowedEvent(child, named(parent), aspect, now)));
      }
      await seal(id);
      return id;
    });
    // Le fait d'entonnoir, best-effort comme à toute création staff.
    this.events.publish(new CompanyDeclaredEvent(companyId, company.displayName(), "staff", null));
    return companyId;
  }

  /**
   * Un site garde son auteur, nom figé à cet instant, mais aucun suiveur : le
   * suivi commercial est celui du principal. Inconnu de l'annuaire, le nom
   * reste vide — on n'invente pas de nom.
   */
  private async siteOpenedBy(staffUserId: string): Promise<CompanyOpening> {
    const author = await this.staff.identify(staffUserId);
    return CompanyOpening.siteOpenedBy({ staffUserId, name: author?.name ?? null });
  }

  /**
   * L'adresse de livraison est facultative à la création (2026-10-05) : un
   * sous-compte au nom seul est valide en `pending`, et c'est l'activation qui
   * exige une adresse, comme pour tout compte.
   */
  private async addFirstAddress(
    id: string,
    command: CreateSubAccountCommand,
    now: Date,
  ): Promise<void> {
    const address = command.payload.deliveryAddress;
    if (address === undefined) {
      return;
    }
    const book = await this.addresses.loadDeliveryBook(id);
    book.add(this.ids.next(), address, now);
    await this.addresses.saveDeliveryBook(book);
  }
}
