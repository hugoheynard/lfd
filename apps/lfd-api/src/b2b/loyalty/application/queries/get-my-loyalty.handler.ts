import type { MyLoyaltyEntryView, MyLoyaltyView, MyLoyaltyVoucherView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { OrderNumberReader } from "../../../orders/domain/ports/order-number.reader.js";
import { VoucherOrderReader } from "../../../orders/domain/ports/voucher-order.reader.js";
import { voucherStatusAt } from "../../domain/entities/loyalty-voucher.js";
import {
  HolderLoyaltyReader,
  type HolderEntryRow,
  type HolderVoucherRow,
} from "../../domain/ports/holder-loyalty.reader.js";
import { LoyaltySettingsReader } from "../../domain/ports/loyalty-settings.store.js";
import { LoyaltyHolder } from "../../domain/value-objects/loyalty-holder.js";
import { GetMyLoyaltyQuery } from "./get-my-loyalty.query.js";

/** Les dernières lignes de l'historique, et les derniers bons clos (plan E1.1). */
const RECENT_LIMIT = 20;

const CLOSED: MyLoyaltyView = { open: false };

/**
 * **Ma fidélité** — le solde, le ratio d'aujourd'hui, les bons et l'historique
 * d'un particulier (plan des points, E1.1).
 *
 * Fermée (`open: false`) sans réglage, quand le public n'est pas ouvert, ou
 * depuis un espace société : la boutique ne montre alors rien. Les lignes du
 * livre sortent dans les mots du client — une sorte et un numéro de commande,
 * jamais le motif qu'un staff a écrit pour le staff.
 *
 * Un bon disponible passé sa date limite se lit `expired` et rejoint les bons
 * clos, même avant que le passage de nuit l'ait écrit.
 */
@QueryHandler(GetMyLoyaltyQuery)
export class GetMyLoyaltyHandler implements IQueryHandler<GetMyLoyaltyQuery, MyLoyaltyView> {
  constructor(
    private readonly settings: LoyaltySettingsReader,
    private readonly reader: HolderLoyaltyReader,
    private readonly carriers: VoucherOrderReader,
    private readonly orderNumbers: OrderNumberReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetMyLoyaltyQuery): Promise<MyLoyaltyView> {
    if (query.actingCompanyId !== null) {
      return CLOSED;
    }
    const holder = LoyaltyHolder.of("user", query.userId);
    const settings = await this.settings.read();
    if (settings === null || !settings.isOpenTo(holder)) {
      return CLOSED;
    }
    const [balancePoints, vouchers, entries] = await Promise.all([
      this.reader.balanceOf(holder),
      this.vouchersOf(holder),
      this.entriesOf(holder),
    ]);
    const { ratio } = settings;
    return {
      open: true,
      balancePoints,
      pointsPerStep: ratio.pointsPerStep,
      stepValueCents: ratio.stepValueCents,
      convertibleSteps: ratio.stepsCoveredBy(balancePoints),
      vouchers,
      entries,
    };
  }

  /** Les bons vivants d'abord, du plus proche de sa date limite ; puis les 20 derniers clos. */
  private async vouchersOf(holder: LoyaltyHolder): Promise<readonly MyLoyaltyVoucherView[]> {
    const now = this.clock.now();
    const [live, closed] = await Promise.all([
      this.reader.liveVouchers(holder),
      this.reader.recentClosedVouchers(holder, RECENT_LIMIT),
    ]);
    const carriers = await this.carriers.liveOrdersCarrying(
      live.filter((row) => row.status === "reserved").map((row) => row.id),
    );
    const views = [...live, ...closed].map((row) => toVoucherView(row, now, carriers));
    const open = views.filter((view) => view.status === "available" || view.status === "reserved");
    const lapsed = views
      .filter((view) => view.status === "expired" || view.status === "cancelled")
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      .slice(0, RECENT_LIMIT);
    return [...open, ...lapsed];
  }

  private async entriesOf(holder: LoyaltyHolder): Promise<readonly MyLoyaltyEntryView[]> {
    const rows = await this.reader.recentEntries(holder, RECENT_LIMIT);
    const numbers = await this.orderNumbers.numbersOf(
      rows.flatMap((row) => (row.kind === "earned" && row.orderId !== null ? [row.orderId] : [])),
    );
    return rows.map((row) => toEntryView(row, numbers));
  }
}

function toVoucherView(
  row: HolderVoucherRow,
  now: Date,
  carriers: ReadonlyMap<string, { readonly orderId: string; readonly orderNumber: string }>,
): MyLoyaltyVoucherView {
  const carrier = row.status === "reserved" ? carriers.get(row.id) : undefined;
  return {
    id: row.id,
    valueCents: row.valueCents,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    status: voucherStatusAt(row.status, row.expiresAt, now),
    usedOn:
      carrier === undefined ? null : { orderId: carrier.orderId, orderNumber: carrier.orderNumber },
  };
}

function toEntryView(
  row: HolderEntryRow,
  numbers: ReadonlyMap<string, string>,
): MyLoyaltyEntryView {
  return {
    id: row.id,
    kind: row.kind,
    points: row.points,
    occurredAt: row.occurredAt.toISOString(),
    orderNumber:
      row.kind === "earned" && row.orderId !== null ? (numbers.get(row.orderId) ?? null) : null,
  };
}
