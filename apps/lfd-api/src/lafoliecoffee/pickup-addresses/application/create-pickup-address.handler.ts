import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PublicSettingsEdgeCache } from "../../shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { placeOf, writeOf } from "../../sites/application/site-place.js";
import { Site } from "../../sites/domain/site.js";
import { SiteRepository } from "../../sites/domain/site.repository.js";
import { PickupAddressCreatedEvent } from "../domain/pickup-address.events.js";
import { PickupDiscount } from "../domain/pickup-discount.js";
import { CreatePickupAddressCommand } from "./create-pickup-address.command.js";
import { refuseLegacyPromotionEditor } from "../../promotions/domain/promotions-source.js";
import { intentSubject } from "../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../platform/intent/once-per-intent.js";

/** Le nom stable du geste, dans le registre des intentions. */
const GESTURE = "sites.create";

/**
 * Handler **staff** : crée un point de retrait — un site neuf, qui remet, est
 * approvisionné sur place et n'expédie pas (lot S1 des sites, 2026-10-13).
 *
 * `PickupDiscount` refuse une remise que ses règles rendent vide. Aucun site n'est « par
 * défaut » depuis le 2026-10-15 : la présélection se décide par client. Le
 * mur est la surface staff de la route.
 *
 * La liste publique des points, gardée par Workers Cache, est purgée
 * **après** la validation : un refus ne purge rien.
 */
@CommandHandler(CreatePickupAddressCommand)
export class CreatePickupAddressHandler implements ICommandHandler<
  CreatePickupAddressCommand,
  string
> {
  constructor(
    private readonly sites: SiteRepository,
    private readonly ids: IdGenerator,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly afterCommit: AfterCommit,
    private readonly edge: PublicSettingsEdgeCache,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * **Une fois par intention** : la clé de l'écran est scellée avec le site et
   * son fait ; un double clic rend le site déjà créé, sans second site, ni
   * second fait, ni seconde purge.
   *
   * @throws {LegacyPromotionEditorClosedError} une remise posée : elle se règle dans l'écran Promotions.
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a servi pour un autre site.
   */
  execute(command: CreatePickupAddressCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: GESTURE,
        subject: intentSubject("site", command.payload),
      },
      CREATED_ID_REPLAY,
      (seal) => this.create(command, seal),
    );
  }

  private async create(
    command: CreatePickupAddressCommand,
    seal: (siteId: string) => Promise<void>,
  ): Promise<string> {
    const { discounts, gps, ...fields } = command.payload;
    if (discounts.b2b !== null || discounts.b2c !== null) {
      // Depuis la bascule (plan des promotions, L8, L12), une remise de site
      // ne s'écrit plus : elle n'agirait sur aucun prix.
      refuseLegacyPromotionEditor("site_discount");
    }
    const resolved = PickupDiscount.of(discounts);
    // Absent à la création : aucun point GPS saisi.
    const position = gps ?? null;
    return await this.uow.run(async () => {
      const site = Site.declare(`site_${this.ids.next()}`, placeOf(fields, resolved, position));
      await this.sites.save(site);
      const written = writeOf(fields, resolved, position);
      await this.events.publishTraced(new PickupAddressCreatedEvent(site.id, written));
      this.afterCommit.defer(() => this.edge.purge(), "pickup-address.created.edge-purge");
      await seal(site.id);
      return site.id;
    });
  }
}
