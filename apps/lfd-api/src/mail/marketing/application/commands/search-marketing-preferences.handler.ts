import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { RecipientFingerprint } from "../../../sends/domain/ports/recipient-fingerprint.js";
import { MarketingPreferenceSearchedEvent } from "../../domain/marketing-preference.events.js";
import { MarketingPreferenceRepository } from "../../domain/ports/marketing-preference.repository.js";
import { PreferenceConsultationsRepository } from "../../domain/ports/preference-consultations.repository.js";
import { preferenceSearchAddressOf } from "../../domain/services/staff-unsubscribe-address.js";
import type { MarketingAddress } from "../../domain/value-objects/marketing-address.js";
import { MarketingAddresses } from "../services/marketing-addresses.js";
import { SearchMarketingPreferencesCommand } from "./search-marketing-preferences.command.js";

/**
 * Cherche par l'EMPREINTE du registre — une ligne effacée se retrouve aussi —
 * puis range la recherche : l'empreinte de recherche du suivi (jamais
 * l'adresse) et les lignes trouvées, figées. Même plafond horaire, partagé ;
 * le fait part au journal dans la même transaction.
 */
@CommandHandler(SearchMarketingPreferencesCommand)
export class SearchMarketingPreferencesHandler implements ICommandHandler<
  SearchMarketingPreferencesCommand,
  string
> {
  constructor(
    private readonly addresses: MarketingAddresses,
    private readonly preferences: MarketingPreferenceRepository,
    private readonly fingerprints: RecipientFingerprint,
    private readonly consultations: PreferenceConsultationsRepository,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * @throws {InvalidPreferenceSearchAddressError} l'adresse n'a pas la forme d'une adresse.
   * @throws {MailConsultationLimitReachedError} 30 consultations dans l'heure.
   */
  async execute({
    address,
    staffUserId,
    intentKey,
  }: SearchMarketingPreferencesCommand): Promise<string> {
    const target = this.addresses.of(preferenceSearchAddressOf(address));
    const fingerprint = this.fingerprints.of(target.key);
    // Le sujet est l'empreinte, jamais l'adresse : la même clé sur une autre
    // adresse est refusée (409 nommé), et un rejeu rend la même recherche.
    return await this.intents.runSealed(
      {
        actorId: staffUserId,
        key: intentKey,
        gesture: "mail.preference.search",
        subject: fingerprint,
      },
      CREATED_ID_REPLAY,
      (seal) => this.search(target, fingerprint, staffUserId, seal),
    );
  }

  private async search(
    target: MarketingAddress,
    fingerprint: string,
    staffUserId: string,
    seal: (id: string) => Promise<void>,
  ): Promise<string> {
    const found = await this.preferences.loadAll(target.print);
    const now = this.clock.now();
    const id = this.ids.next();
    await this.uow.run(async () => {
      const consultations = await this.consultations.load(staffUserId, now);
      consultations.search(
        id,
        fingerprint,
        found.map((row) => row.id),
        now,
      );
      await this.consultations.save(consultations);
      await this.events.publishTraced(new MarketingPreferenceSearchedEvent(id, found.length));
      await seal(id);
    });
    return id;
  }
}
