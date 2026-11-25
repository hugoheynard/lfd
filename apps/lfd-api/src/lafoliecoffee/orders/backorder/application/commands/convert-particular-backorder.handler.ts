import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../../platform/events/domain-event-publisher.js";
import { OncePerIntent } from "../../../../../platform/intent/once-per-intent.js";
import { Journal } from "../../../../../platform/journal/journal.js";
import { DurablePublisher } from "../../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../../platform/time/clock.js";
import { ParticularStandingReader } from "../../../../account/domain/ports/particular-standing.reader.js";
import { CustomerCancellationDeadline } from "../../../cancellation/application/services/customer-cancellation-deadline.js";
import { OfferedParticularPlacement } from "../../../application/services/offered-particular-placement.js";
import type { DraftPolicy } from "../../../application/services/order-drafting.service.js";
import { OrderDrafting } from "../../../application/services/order-drafting.service.js";
import { ensureMayOffer } from "../../../application/services/order-offering.js";
import { ShopTillParticularPlacement } from "../../../application/services/shop-till-particular-placement.js";
import type { StaffPlacementBinding } from "../../../application/services/staff-order-placement.js";
import { OrderRepository } from "../../../domain/ports/order.repository.js";
import { BackorderRepository } from "../../domain/ports/backorder.repository.js";
import { BackorderReplayReader } from "../../domain/ports/backorder-replay.reader.js";
import { backorderClosing } from "../backorder-closing.js";
import { backorderPricingOf } from "../backorder-placement.js";
import {
  loadParticularBackorder,
  particularBackorderConvertEntryOf,
  type ParticularBackorderConvertEntry,
} from "../particular-backorder-entry.js";
import {
  ConvertParticularBackorderCommand,
  type ConvertParticularBackorderResult,
} from "./convert-particular-backorder.command.js";
import {
  PARTICULAR_BACKORDER_CONVERSION_REPLAY,
  particularBackorderConversionIntent,
} from "./particular-backorder-conversion-intent.js";

type Seal = (result: ConvertParticularBackorderResult) => Promise<void>;
type Placed = { readonly id: string; readonly orderNumber: string; readonly totalCents: number };

/**
 * **Transforme un reliquat de particulier en commande** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5 bis,
 * décision 13) par les passations du particulier qui existent — réglée à la
 * caisse de la boutique ({@link ShopTillParticularPlacement}) ou offerte
 * ({@link OfferedParticularPlacement}, sous le droit d'offrir) —, garnies des
 * lignes du reliquat et sous sa politique : prix de l'origine rejoué, port
 * offert, aucune surtaxe. Le règlement en boutique, le délai d'annulation
 * figé et le total vu vivent dans ces passations : la transformation ne peut
 * pas les oublier.
 *
 * Aucune dérogation d'heure limite : elles sont tenues par société. Le plan
 * arrêté et le jour même passent par les règles de journée de la saisie du
 * comptoir (« hors plan », décision 15).
 *
 * Dans la transaction de la commande : le verrou du reliquat d'abord, la
 * commande, puis `backorder.convert`, `save` et `backorder.converted`. La clé
 * d'intention se scelle avec, et un double clic rend la même commande.
 */
@CommandHandler(ConvertParticularBackorderCommand)
export class ConvertParticularBackorderHandler implements ICommandHandler<
  ConvertParticularBackorderCommand,
  ConvertParticularBackorderResult
> {
  private readonly shopTill: ShopTillParticularPlacement;
  private readonly offered: OfferedParticularPlacement;

  constructor(
    particulars: ParticularStandingReader,
    drafting: OrderDrafting,
    orders: OrderRepository,
    events: DomainEventPublisher,
    unitOfWork: UnitOfWork,
    durable: DurablePublisher,
    cancellationDeadline: CustomerCancellationDeadline,
    private readonly intents: OncePerIntent,
    private readonly clock: Clock,
    private readonly backorders: BackorderRepository,
    private readonly replays: BackorderReplayReader,
    private readonly journal: Journal,
  ) {
    const ports = {
      particulars,
      drafting,
      orders,
      events,
      unitOfWork,
      durable,
      cancellationDeadline,
    };
    this.shopTill = new ShopTillParticularPlacement(ports);
    this.offered = new OfferedParticularPlacement(ports);
  }

  /**
   * @throws {OfferNotPermittedError} une offerte sans le droit `b2b_offer_order`.
   * @throws {BackorderNotFoundError} reliquat inconnu.
   * @throws {CompanyBackorderNeedsStaffEntryError} reliquat d'une société.
   * @throws {BackorderClosedError} déjà transformé ou abandonné, sous une autre clé.
   * @throws {CounterParticularNotFoundError} l'acheteur n'a pas de fiche.
   * @throws {CounterBuyerIsCompanyMemberError} l'acheteur est rattaché à une société.
   * @throws {CounterParticularDisabledError} l'acheteur est désactivé.
   * @throws {IntentKeyReusedError} la clé a déjà transformé une autre saisie.
   */
  async execute(
    command: ConvertParticularBackorderCommand,
  ): Promise<ConvertParticularBackorderResult> {
    // Avant toute intention scellée : un refus de droit ne consomme pas la clé.
    ensureMayOffer(command.payload.venue === "offered", command.mayOffer);
    // Sans juger l'état : un double clic après le succès retrouve sa commande.
    const backorder = await loadParticularBackorder(this.backorders, command.backorderId);
    const entry = particularBackorderConvertEntryOf(backorder, command.payload);
    return await this.intents.runSealed(
      particularBackorderConversionIntent(
        command.staffUserId,
        command.intentKey,
        backorder.id,
        entry,
      ),
      PARTICULAR_BACKORDER_CONVERSION_REPLAY,
      async (seal) => {
        const { origin, policy } = await backorderPricingOf(this.replays, backorder);
        const binding = backorderClosing(
          { backorders: this.backorders, clock: this.clock, journal: this.journal },
          backorder,
          origin.originOrderNumber,
          command.staffUserId,
        );
        return this.place(command.staffUserId, entry, policy, binding, seal);
      },
    );
  }

  /** La passation que le lieu de règlement désigne, et la réponse de la transformation. */
  private async place(
    staffUserId: string,
    entry: ParticularBackorderConvertEntry,
    policy: DraftPolicy,
    binding: StaffPlacementBinding,
    seal: Seal,
  ): Promise<ConvertParticularBackorderResult> {
    const { venue } = entry;
    const sealAs = (placed: Placed): Promise<void> => seal(resultOf(venue, placed));
    if (entry.venue === "shop_till") {
      const placed = await this.shopTill.place(
        { staffUserId, payload: entry.payload },
        policy,
        binding,
        sealAs,
      );
      return resultOf(venue, placed);
    }
    const placed = await this.offered.place(
      { staffUserId, payload: entry.payload },
      policy,
      binding,
      sealAs,
    );
    return resultOf(venue, placed);
  }
}

function resultOf(
  venue: ConvertParticularBackorderResult["venue"],
  placed: Placed,
): ConvertParticularBackorderResult {
  return {
    id: placed.id,
    orderNumber: placed.orderNumber,
    venue,
    totalCents: placed.totalCents,
  };
}
