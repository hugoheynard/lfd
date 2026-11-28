import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { Company } from "../../domain/entities/company.js";
import { CompanyDeclaredEvent } from "../../domain/events/company-declared.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { CounterOpeningAttestations } from "../../domain/ports/counter-opening-attestations.js";
import { CounterPayerOpening } from "../../domain/ports/counter-payer-opening.js";
import { StaffDirectory } from "../../domain/ports/staff-directory.js";
import { CompanyOpening } from "../../domain/value-objects/company-opening.js";
import { ContactDetails, contactSnapshotOf } from "../../domain/value-objects/contact-details.js";
import { IdentityAttestation } from "../../domain/value-objects/identity-attestation.js";
import { OpenCounterAccountCommand } from "./open-counter-account.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const OPEN_COUNTER_ACCOUNT_GESTURE = "account.open-counter-account";
/** La cible de l'intention : un compte qui n'existe pas encore, donc sans identifiant. */
const NEW_COUNTER_ACCOUNT_TARGET = "new-counter-account";

/**
 * Ouvre un **compte pro au comptoir** (`plan-comptes-du-comptoir.md`, § 3) :
 * dans UNE transaction, la société `counter_opened` au mensuel
 * (`Company.openAtCounter`), son virement chez chaque entité en service
 * (`CounterPayerOpening`) et la trace « pièce d'identité vue ou non » au nom
 * de l'agent. Le compte s'ouvre entier, ou rien ne s'écrit.
 *
 * Aucun accès client n'est ouvert : le compte n'a pas de membre avant
 * conversion. Le contact devient l'acheteur au nom de qui l'équipe commande —
 * une fiche invité, sans identité de connexion ni rattachement (§ 3.1).
 * Pas de contrôle de SIRET : il n'y en a pas.
 *
 * **Une fois par intention** : l'identifiant est scellé dans la transaction
 * qui l'écrit ; un rejeu de même clé rend le compte déjà ouvert.
 *
 * `@sans-journal` `company.declared` (via `staff`) est écrit par son abonné,
 * comme pour l'ouverture par le commercial, et le virement posé l'est par la
 * comptabilité dans la transaction (`payer_collection_means.changed`).
 *
 * @throws {CounterAccountUnreachableError} le contact n'a pas de téléphone.
 * @throws {InvalidCompanyIdentityError} le nom d'usage est vide.
 */
@CommandHandler(OpenCounterAccountCommand)
export class OpenCounterAccountHandler implements ICommandHandler<
  OpenCounterAccountCommand,
  string
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly attestations: CounterOpeningAttestations,
    private readonly payers: CounterPayerOpening,
    private readonly staff: StaffDirectory,
    private readonly events: DomainEventPublisher,
    private readonly intents: OncePerIntent,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(command: OpenCounterAccountCommand): Promise<string> {
    const contact = ContactDetails.create(command.contact);
    const author = await this.staff.identify(command.staffUserId);
    const company = Company.openAtCounter(
      command.enseigne,
      contact,
      CompanyOpening.openedBy({ staffUserId: command.staffUserId, name: author?.name ?? null }),
    );
    const at = this.clock.now();
    const attestation = IdentityAttestation.attest(command.identitySeen, command.staffUserId, at);
    const fresh: { id?: string } = {};
    const companyId = await this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: OPEN_COUNTER_ACCOUNT_GESTURE,
        subject: intentSubject(NEW_COUNTER_ACCOUNT_TARGET, {
          enseigne: company.enseigne,
          contact: command.contact,
          identitySeen: command.identitySeen,
        }),
      },
      CREATED_ID_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const id = await this.companies.declareUnowned(company);
          await this.attestations.record(id, attestation, contactSnapshotOf(contact));
          await this.payers.open({ id, name: company.displayName() }, at, command.staffUserId);
          await seal(id);
          fresh.id = id;
          return id;
        }),
    );
    // Publié APRÈS la validation, hors de l'unité, et seulement au premier
    // passage : un rejeu ne redéclare rien.
    if (fresh.id !== undefined) {
      this.events.publish(
        new CompanyDeclaredEvent(companyId, company.displayName(), "staff", null),
      );
    }
    return companyId;
  }
}
