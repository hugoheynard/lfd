import type { CatalogOperationOverrideState } from "../../../domain/entities/catalog-operation-override.js";
import {
  ReceivedOperationsReader,
  type ReceivedOperation,
} from "../../../domain/ports/received-operations.reader.js";
import { receivedNoel } from "../../commands/__tests__/operation-doubles.js";
import { ListReceivedOperationsHandler } from "../list-received-operations.handler.js";

class FixedReceived extends ReceivedOperationsReader {
  constructor(private readonly operations: readonly ReceivedOperation[]) {
    super();
  }

  list(): Promise<readonly ReceivedOperation[]> {
    return Promise.resolve(this.operations);
  }
}

const override = (
  restriction: Partial<CatalogOperationOverrideState["restriction"]>,
): CatalogOperationOverrideState => ({
  operationKey: "noel-2026",
  restriction: {
    isHidden: false,
    orderUntil: null,
    audience: null,
    hiddenSkus: [],
    ...restriction,
  },
  decidedBy: "staff_1",
  decidedAt: new Date("2026-09-24T10:00:00.000Z"),
});

async function view(operation: ReceivedOperation) {
  const [first] = await new ListReceivedOperationsHandler(new FixedReceived([operation])).execute();
  return first;
}

describe("ListReceivedOperationsHandler — ce que la réception voit", () => {
  it("rend le reçu, sans surcharge, et l'effectif qui l'égale", async () => {
    const shown = await view({ received: receivedNoel(), withdrawnAt: null, override: null });

    expect(shown).toMatchObject({
      key: "noel-2026",
      name: { fr: "Noël", en: "Christmas" },
      orderUntil: "2026-12-21T11:00:00.000Z",
      pickupFrom: "2026-12-20",
      withdrawn: false,
      override: null,
      effective: {
        isHidden: false,
        orderUntil: "2026-12-21T11:00:00.000Z",
        audience: "both",
        skus: ["PAT-9-1", "VIE-001-1"],
      },
    });
  });

  it("combine : clôture au plus tôt, clientèle en intersection, articles retirés", async () => {
    const shown = await view({
      received: receivedNoel(),
      withdrawnAt: null,
      override: override({
        orderUntil: new Date("2026-12-19T17:00:00.000Z"),
        audience: "pro",
        hiddenSkus: ["PAT-9-1"],
      }),
    });

    expect(shown?.effective).toEqual({
      isHidden: false,
      orderUntil: "2026-12-19T17:00:00.000Z",
      audience: "pro",
      skus: ["VIE-001-1"],
    });
    expect(shown?.override).toMatchObject({ audience: "pro", decidedBy: "staff_1" });
  });

  it("dit une opération retirée, et garde sa surcharge", async () => {
    const shown = await view({
      received: receivedNoel(),
      withdrawnAt: new Date("2026-09-20T00:00:00.000Z"),
      override: override({ isHidden: true }),
    });

    expect(shown).toMatchObject({
      withdrawn: true,
      withdrawnAt: "2026-09-20T00:00:00.000Z",
      override: { isHidden: true },
    });
  });
});
