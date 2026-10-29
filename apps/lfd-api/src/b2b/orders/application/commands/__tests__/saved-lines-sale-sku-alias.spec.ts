import {
  orderDraftPayloadSchema,
  type OrderDraftPayload,
  type OrderDraftView,
  type ShopCartPayload,
  type ShopCartView,
} from "@lfd/contracts";

import { P_X_ALIASED } from "../../../../catalog/domain/__tests__/sale-sku-alias.doubles.js";
import { intakeOver } from "../../../../catalog/application/__tests__/sale-reference-intake.doubles.js";
import { OrderDraftRepository } from "../../../domain/ports/order-draft.repository.js";
import {
  OrderGuardReader,
  type OrderCompanyStatus,
  type OrderRole,
} from "../../../domain/ports/order-guard.reader.js";
import { ShopCartRepository } from "../../../domain/ports/shop-cart.repository.js";
import { GetOrderDraftHandler } from "../../queries/get-order-draft.handler.js";
import { GetOrderDraftQuery } from "../../queries/get-order-draft.query.js";
import { GetShopCartHandler } from "../../queries/get-shop-cart.handler.js";
import { GetShopCartQuery } from "../../queries/get-shop-cart.query.js";
import { SaveOrderDraftCommand } from "../save-order-draft.command.js";
import { SaveOrderDraftHandler } from "../save-order-draft.handler.js";
import { SaveShopCartCommand } from "../save-shop-cart.command.js";
import { SaveShopCartHandler } from "../save-shop-cart.handler.js";

/**
 * **Le panier gardé et le brouillon devant une ancienne référence**
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 5) : alias à
 * la lecture, réécrits normalisés à la prochaine écriture, sans migration de
 * leur JSON.
 */

const SAVED_AT = "2026-10-29T08:00:00.000Z";

class StoredCarts extends ShopCartRepository {
  stored: ShopCartView | null = null;

  find(): Promise<ShopCartView | null> {
    return Promise.resolve(this.stored);
  }

  save(
    _userId: string,
    _companyId: string | null,
    payload: ShopCartPayload,
  ): Promise<ShopCartView> {
    this.stored = { ...payload, savedAt: SAVED_AT };
    return Promise.resolve(this.stored);
  }
}

class StoredDrafts extends OrderDraftRepository {
  stored: OrderDraftView | null = null;

  find(): Promise<OrderDraftView | null> {
    return Promise.resolve(this.stored);
  }

  save(
    companyId: string,
    payload: OrderDraftPayload,
    savedByStaffId: string | null,
  ): Promise<OrderDraftView> {
    this.stored = { ...payload, companyId, savedAt: SAVED_AT, savedByStaffId };
    return Promise.resolve(this.stored);
  }

  discard(): Promise<void> {
    return Promise.resolve();
  }
}

class ActiveCompany extends OrderGuardReader {
  roleOf(): Promise<OrderRole | null> {
    return Promise.resolve(null);
  }

  companyStatusOf(): Promise<OrderCompanyStatus | null> {
    return Promise.resolve("active");
  }

  settlesOnAccount(): Promise<"none"> {
    return Promise.resolve("none");
  }
}

const OLD_CART: ShopCartPayload = { lines: [{ sku: "P-X", quantity: 2 }] };
const OLD_DRAFT: OrderDraftPayload = orderDraftPayloadSchema.parse({
  lines: [{ sku: "P-X", productName: "", unitPriceMillicents: 0, vatRate: 0, quantity: 2 }],
});

describe("le panier gardé", () => {
  it("s'écrit sous la référence de l'article", async () => {
    const carts = new StoredCarts();

    await new SaveShopCartHandler(carts, intakeOver(P_X_ALIASED)).execute(
      new SaveShopCartCommand("u1", null, OLD_CART),
    );

    expect(carts.stored?.lines).toEqual([{ sku: "P-X-1", quantity: 2 }]);
  });

  it("se relit normalisé, sans réécrire la base", async () => {
    const carts = new StoredCarts();
    carts.stored = { ...OLD_CART, savedAt: SAVED_AT };

    const cart = await new GetShopCartHandler(carts, intakeOver(P_X_ALIASED)).execute(
      new GetShopCartQuery("u1", null),
    );

    expect(cart?.lines).toEqual([{ sku: "P-X-1", quantity: 2 }]);
    expect(carts.stored.lines).toEqual(OLD_CART.lines);
  });

  it("sans alias, rend ce qui a été écrit", async () => {
    const carts = new StoredCarts();
    carts.stored = { ...OLD_CART, savedAt: SAVED_AT };

    const cart = await new GetShopCartHandler(carts, intakeOver()).execute(
      new GetShopCartQuery("u1", null),
    );

    expect(cart?.lines).toEqual(OLD_CART.lines);
  });
});

describe("le brouillon du staff", () => {
  it("s'écrit sous la référence de l'article", async () => {
    const drafts = new StoredDrafts();

    await new SaveOrderDraftHandler(drafts, new ActiveCompany(), intakeOver(P_X_ALIASED)).execute(
      new SaveOrderDraftCommand("cmp_1", "staff_1", OLD_DRAFT),
    );

    expect(drafts.stored?.lines.map((line) => line.sku)).toEqual(["P-X-1"]);
  });

  it("se relit normalisé", async () => {
    const drafts = new StoredDrafts();
    drafts.stored = { ...OLD_DRAFT, companyId: "cmp_1", savedAt: SAVED_AT, savedByStaffId: null };

    const draft = await new GetOrderDraftHandler(drafts, intakeOver(P_X_ALIASED)).execute(
      new GetOrderDraftQuery("cmp_1"),
    );

    expect(draft?.lines.map((line) => line.sku)).toEqual(["P-X-1"]);
  });
});
