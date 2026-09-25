import {
  catalogItem,
  saleOperationsOver,
} from "../../../../catalog/application/__tests__/sale-operations-doubles.js";
import type { SellableOperation } from "../../../../catalog/domain/ports/catalog-operations.reader.js";
import {
  OperationArticleUnavailableError,
  OperationDayRequiredError,
  OperationNotYetOpenError,
} from "../../../domain/errors/order-operation-errors.js";
import { OrderOperations } from "../order-operations.service.js";

/**
 * D6 : la clientèle vient de la COMMANDE — une société ⇒ `pro`, sinon
 * `public` —, jamais d'un `"pro"` écrit en dur. Dates comparées à l'horloge
 * figée du service.
 */

const NOW = new Date("2026-12-01T10:00:00.000Z");

const PRO_ONLY: SellableOperation = {
  key: "noel-pro",
  name: { fr: "Noël des pros" },
  lede: null,
  image: null,
  announceFrom: new Date("2026-11-01T00:00:00.000Z"),
  orderFrom: null,
  orderUntil: new Date("2026-12-21T11:00:00.000Z"),
  pickupFrom: "2026-12-20",
  pickupUntil: "2026-12-24",
  audience: "pro",
  skus: ["PAT-002-1"],
};

function operationsWith(operation: SellableOperation): OrderOperations {
  return new OrderOperations(
    saleOperationsOver({
      now: NOW,
      operations: [operation],
      items: [catalogItem("PAT-002", { name: "Bûche" }), catalogItem("VIE-001")],
      onlySkus: ["PAT-002-1"],
    }),
  );
}

const LINES = [{ sku: "VIE-001" }, { sku: "PAT-002" }];

describe("OrderOperations.ensure", () => {
  it("laisse passer une société sur une opération réservée aux professionnels", async () => {
    await expect(
      operationsWith(PRO_ONLY).ensure(LINES, "company_1", "2026-12-22"),
    ).resolves.toBeUndefined();
  });

  it("refuse la même bûche sans société : la boutique publique ne la voit pas", async () => {
    await expect(operationsWith(PRO_ONLY).ensure(LINES, null, "2026-12-22")).rejects.toBeInstanceOf(
      OperationArticleUnavailableError,
    );
  });

  it("refuse une commande sans jour de retrait", async () => {
    await expect(operationsWith(PRO_ONLY).ensure(LINES, "company_1", null)).rejects.toBeInstanceOf(
      OperationDayRequiredError,
    );
  });

  it("le devis (sans jour) passe tant que la commande est ouverte", async () => {
    await expect(operationsWith(PRO_ONLY).ensure(LINES, "company_1")).resolves.toBeUndefined();
  });

  it("le devis dit déjà qu'une opération n'est pas encore ouverte", async () => {
    const later = { ...PRO_ONLY, orderFrom: new Date("2026-12-05T00:00:00.000Z") };
    await expect(operationsWith(later).ensure(LINES, "company_1")).rejects.toBeInstanceOf(
      OperationNotYetOpenError,
    );
  });
});
