import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { OrderRecipientReader } from "../../../domain/ports/order-recipient.reader.js";
import { AppConfig } from "../../../../../platform/config/app-config.js";
import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../../platform/id/id-generator.js";
import { OncePerIntent } from "../../../../../platform/intent/once-per-intent.js";
import { Journal } from "../../../../../platform/journal/journal.js";
import { DurablePublisher } from "../../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../../platform/time/clock.js";
import { CardPayments } from "../../../../../payment/channels/requests/index.js";
import type { PlaceOrderForCustomerResult } from "../../../application/commands/place-order-for-customer.command.js";
import { STAFF_PLACEMENT_REPLAY } from "../../../application/commands/staff-placement-intent.js";
import { ensureMayOffer } from "../../../application/services/order-offering.js";
import { OrderDrafting } from "../../../application/services/order-drafting.service.js";
import { ShelfCircuit } from "../../../application/services/shelf-circuit.service.js";
import { StaffOrderPlacement } from "../../../application/services/staff-order-placement.js";
import { ItemLimitOverrideRecorder } from "../../../domain/ports/item-limit-override.recorder.js";
import { OrderCutoffWaiverGate } from "../../../domain/ports/order-cutoff-waiver.gate.js";
import { OrderGuardReader } from "../../../domain/ports/order-guard.reader.js";
import { OrderRepository } from "../../../domain/ports/order.repository.js";
import { PayerCommitmentRequirements } from "../../../domain/ports/payer-commitment-requirements.js";
import { BackorderRepository } from "../../domain/ports/backorder.repository.js";
import { BackorderReplayReader } from "../../domain/ports/backorder-replay.reader.js";
import { backorderClosing } from "../backorder-closing.js";
import { backorderEntryOf, backorderPricingOf, loadBackorder } from "../backorder-placement.js";
import { backorderConversionIntent } from "./backorder-conversion-intent.js";
import { ConvertBackorderCommand } from "./convert-backorder.command.js";

/**
 * **Transforme un reliquat en commande ordinaire** (`documentation/commandes/reliquat/reliquat.md`, § 6.3) : la
 * saisie de l'équipe ({@link StaffOrderPlacement}) garnie des lignes du
 * reliquat, sous la politique du reliquat — prix de l'origine rejoué, port
 * offert, aucune surtaxe —, puis le reliquat fermé sur la commande créée.
 *
 * Dans la transaction de la commande : le verrou du reliquat d'abord (une
 * transformation concurrente attend et lit l'état fermé), la commande, la
 * dérogation consommée, le règlement, puis `backorder.convert`, `save` et le
 * fait `backorder.converted`. Un refus annule le tout ; la clé d'intention se
 * scelle avec, et un double clic rend la même commande.
 */
@CommandHandler(ConvertBackorderCommand)
export class ConvertBackorderHandler implements ICommandHandler<
  ConvertBackorderCommand,
  PlaceOrderForCustomerResult
> {
  private readonly placement: StaffOrderPlacement;

  constructor(
    guard: OrderGuardReader,
    drafting: OrderDrafting,
    orders: OrderRepository,
    payments: CardPayments,
    events: DomainEventPublisher,
    config: AppConfig,
    waivers: OrderCutoffWaiverGate,
    private readonly clock: Clock,
    unitOfWork: UnitOfWork,
    durable: DurablePublisher,
    shelf: ShelfCircuit,
    private readonly intents: OncePerIntent,
    commitments: PayerCommitmentRequirements,
    overrides: ItemLimitOverrideRecorder,
    ids: IdGenerator,
    private readonly backorders: BackorderRepository,
    private readonly replays: BackorderReplayReader,
    private readonly journal: Journal,
    recipients: OrderRecipientReader,
  ) {
    this.placement = new StaffOrderPlacement({
      guard,
      drafting,
      orders,
      payments,
      events,
      config,
      waivers,
      clock,
      unitOfWork,
      durable,
      shelf,
      commitments,
      overrides,
      ids,
      recipients,
    });
  }

  /**
   * @throws {BackorderNotFoundError} reliquat inconnu.
   * @throws {ParticularBackorderNotConvertibleError} reliquat de particulier : ses gestes sont la caisse de la boutique ou l'offerte.
   * @throws {BackorderClosedError} déjà transformé ou abandonné, sous une autre clé.
   * @throws {OfferNotPermittedError} une commande offerte sans le droit `b2b_offer_order`.
   * @throws {IntentKeyReusedError} la clé a déjà transformé une autre saisie.
   */
  async execute(command: ConvertBackorderCommand): Promise<PlaceOrderForCustomerResult> {
    ensureMayOffer(command.payload.settlement === "offered", command.mayOffer);
    // Sans juger l'état : un double clic après le succès retrouve sa commande.
    const loaded = await loadBackorder(this.backorders, command.backorderId);
    const entry = backorderEntryOf(loaded.backorder, loaded.companyId, command.payload);
    return await this.intents.runSealed(
      backorderConversionIntent(command.staffUserId, command.intentKey, command.backorderId, entry),
      STAFF_PLACEMENT_REPLAY,
      async (seal) => {
        const { origin, policy } = await backorderPricingOf(this.replays, loaded.backorder);
        return this.placement.place(
          {
            staffUserId: command.staffUserId,
            payload: entry,
            exceedItemLimits: command.exceedItemLimits,
          },
          policy,
          backorderClosing(
            { backorders: this.backorders, clock: this.clock, journal: this.journal },
            loaded.backorder,
            origin.originOrderNumber,
            command.staffUserId,
          ),
          seal,
        );
      },
    );
  }
}
