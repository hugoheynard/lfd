import {
  LoyaltyAccount,
  type LoyaltyLedgerEntry,
} from "../../../domain/entities/loyalty-account.js";
import {
  LoyaltyVoucher,
  type LoyaltyVoucherSnapshot,
} from "../../../domain/entities/loyalty-voucher.js";
import {
  CompletedOrderReader,
  type CompletedOrder,
  type CompletedOrderPage,
} from "../../../../orders/domain/ports/completed-order.reader.js";
import { LoyaltyEarnedOrdersReader } from "../../../domain/ports/loyalty-earned-orders.reader.js";
import { LoyaltyAccountRepository } from "../../../domain/ports/loyalty-account.repository.js";
import { LoyaltyConversionGate } from "../../../domain/ports/loyalty-conversion.gate.js";
import {
  LoyaltyHolderDirectory,
  type LoyaltyHolderDescription,
} from "../../../domain/ports/loyalty-holder.directory.js";
import {
  LoyaltySettingsReader,
  LoyaltySettingsWriter,
} from "../../../domain/ports/loyalty-settings.store.js";
import { LoyaltyVoucherRepository } from "../../../domain/ports/loyalty-voucher.repository.js";
import type { LoyaltyHolder } from "../../../domain/value-objects/loyalty-holder.js";
import {
  LoyaltySettings,
  type LoyaltySettingsInput,
} from "../../../domain/value-objects/loyalty-settings.js";

/** Doubles écrits à la main, héritant des ports — jamais `jest.fn()`. */

export const OPEN_TO_PUBLIC: LoyaltySettingsInput = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
};

/** Le livre en mémoire : `loadLocked` somme, `save` ajoute. Journalise ses appels. */
export class InMemoryLedger extends LoyaltyAccountRepository {
  readonly entries: LoyaltyLedgerEntry[] = [];
  readonly calls: string[] = [];

  loadLocked(holder: LoyaltyHolder): Promise<LoyaltyAccount> {
    this.calls.push(`lock:${holder.lockKey}`);
    return Promise.resolve(LoyaltyAccount.reconstitute(holder, this.balanceOf(holder)));
  }

  save(account: LoyaltyAccount): Promise<void> {
    this.calls.push("ledger.save");
    this.entries.push(...account.pendingEntries);
    return Promise.resolve();
  }

  balanceOf(holder: LoyaltyHolder): number {
    return this.entries
      .filter((entry) => entry.holder.equals(holder))
      .reduce((sum, entry) => sum + entry.points, 0);
  }

  /** Une ligne de gain, telle que le lot D l'écrira. */
  seedEarned(holder: LoyaltyHolder, points: number): void {
    this.entries.push({
      id: `seed_${String(this.entries.length)}`,
      holder,
      kind: "earned",
      points,
      orderId: `order_${String(this.entries.length)}`,
      voucherId: null,
      occurredAt: new Date(0),
      actorUserId: null,
      staffUserId: null,
      reason: null,
    });
  }
}

export class InMemoryVouchers extends LoyaltyVoucherRepository {
  readonly rows = new Map<string, LoyaltyVoucherSnapshot>();
  readonly calls: string[] = [];

  load(id: string): Promise<LoyaltyVoucher | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row === undefined ? null : LoyaltyVoucher.reconstitute(row));
  }

  loadDueForExpiry(now: Date, limit: number): Promise<readonly LoyaltyVoucher[]> {
    const due = [...this.rows.values()]
      .filter((row) => row.status === "available" && row.expiresAt.getTime() <= now.getTime())
      .slice(0, limit);
    return Promise.resolve(due.map((row) => LoyaltyVoucher.reconstitute(row)));
  }

  save(voucher: LoyaltyVoucher): Promise<void> {
    this.calls.push("voucher.save");
    this.rows.set(voucher.id, voucher.toPersistence());
    return Promise.resolve();
  }
}

export class FixedLoyaltySettings extends LoyaltySettingsReader {
  constructor(private readonly input: LoyaltySettingsInput | null) {
    super();
  }

  read(): Promise<LoyaltySettings | null> {
    return Promise.resolve(this.input === null ? null : LoyaltySettings.of(this.input));
  }
}

export class RecordingSettingsWriter extends LoyaltySettingsWriter {
  readonly written: { settings: LoyaltySettingsInput; at: Date; by: string }[] = [];

  write(settings: LoyaltySettings, updatedAt: Date, updatedByStaffId: string): Promise<void> {
    this.written.push({ settings: settings.toInput(), at: updatedAt, by: updatedByStaffId });
    return Promise.resolve();
  }
}

/** Un annuaire : les titulaires connus, et leur nom (`null` = sans nom). */
export class FixedHolders extends LoyaltyHolderDirectory {
  constructor(private readonly known: Readonly<Record<string, string | null>>) {
    super();
  }

  describe(holder: LoyaltyHolder): Promise<LoyaltyHolderDescription | null> {
    const key = holder.lockKey;
    return Promise.resolve(key in this.known ? { label: this.known[key] ?? null } : null);
  }
}

/** Le droit de convertir : une liste de couples `titulaire → personne`. */
export class FixedGate extends LoyaltyConversionGate {
  constructor(private readonly allowed: readonly string[]) {
    super();
  }

  mayConvert(holder: LoyaltyHolder, actorUserId: string): Promise<boolean> {
    return Promise.resolve(this.allowed.includes(`${holder.lockKey}>${actorUserId}`));
  }
}

/** Les gains déjà écrits, lus dans le livre en mémoire. */
export class LedgerEarnedOrders extends LoyaltyEarnedOrdersReader {
  constructor(private readonly ledger: InMemoryLedger) {
    super();
  }

  earnedAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    return Promise.resolve(
      new Set(
        this.ledger.entries
          .filter((entry) => entry.kind === "earned" && entry.orderId !== null)
          .flatMap((entry) =>
            entry.orderId !== null && orderIds.includes(entry.orderId) ? [entry.orderId] : [],
          ),
      ),
    );
  }
}

/** Les commandes définitives connues, dans l'ordre des identifiants. */
export class FixedCompletedOrders extends CompletedOrderReader {
  readonly pages: (string | null)[] = [];

  constructor(private readonly orders: readonly CompletedOrder[]) {
    super();
  }

  findCompleted(orderId: string): Promise<CompletedOrder | null> {
    return Promise.resolve(this.orders.find((order) => order.orderId === orderId) ?? null);
  }

  listCompleted(after: string | null, limit: number): Promise<CompletedOrderPage> {
    this.pages.push(after);
    const sorted = [...this.orders].sort((a, b) => a.orderId.localeCompare(b.orderId));
    const rest = sorted.filter((order) => after === null || order.orderId > after);
    const page = rest.slice(0, limit);
    const last = page.at(-1);
    return Promise.resolve({
      orders: page,
      nextAfter: rest.length > limit && last !== undefined ? last.orderId : null,
    });
  }
}

/** Une commande publique définitive d'un compte connecté : le cas qui crédite. */
export function completedOrder(overrides: Partial<CompletedOrder> = {}): CompletedOrder {
  return {
    orderId: "o1",
    orderNumber: "CMD-1",
    clientele: "public",
    companyId: null,
    placedByUserId: "u1",
    buyerHasAccount: true,
    subtotalCents: 2_340,
    discountCents: 0,
    ...overrides,
  };
}
