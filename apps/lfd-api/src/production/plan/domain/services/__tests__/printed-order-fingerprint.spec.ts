import {
  orderLine,
  producibleOrder,
} from "../../../../channels/commerce/__tests__/producible-order.fixture.js";
import type { ProducibleOrder } from "../../../../channels/commerce/day-orders.reader.js";
import { arrestPreviewOf } from "../../../../day/index.js";
import type { ProductionOrderSnapshot } from "../../../../day/index.js";
import {
  changedSince,
  printedFingerprintsOf,
  printedOrderFingerprint,
} from "../printed-order-fingerprint.js";

/** Une commande telle que l'arrêt la figerait. */
function frozen(orderId: string, ...overrides: readonly Partial<ProducibleOrder>[]) {
  const merged = overrides.reduce<Partial<ProducibleOrder>>((all, one) => ({ ...all, ...one }), {});
  const order = producibleOrder(orderId, merged);
  const [snapshot] = arrestPreviewOf([order], new Set(), []).orders;
  if (snapshot === undefined) {
    throw new RangeError("la commande n'a pas été figée");
  }
  return snapshot;
}

const SHEET = {
  tradeName: "Les Trois Ponts",
  legalName: "SARL Trois Ponts",
  pickupLabel: null,
  address: { line1: "3 rue du Four", line2: "", postalCode: "75011", city: "Paris" },
  window: { start: "07:00", end: "08:00" },
  contact: { source: "order" as const, name: "Marie", phone: "0600000000" },
  signatureRequired: false,
  note: "Sonner deux fois",
  recurring: false,
};

describe("l'empreinte d'une commande imprimée", () => {
  it("est la même pour deux tirages des mêmes commandes", () => {
    expect(printedOrderFingerprint(frozen("ord_1", { sheetDetails: SHEET }))).toBe(
      printedOrderFingerprint(frozen("ord_1", { sheetDetails: SHEET })),
    );
  });

  it.each([
    ["la quantité d'une ligne", { lines: [orderLine("VIE-001", 41, "Croissant")] }],
    ["l'échéance", { dueAt: "07:30" }],
    ["l'adresse", { sheetDetails: { ...SHEET, address: { ...SHEET.address, city: "Lyon" } } }],
    ["la fenêtre", { sheetDetails: { ...SHEET, window: { start: null, end: "08:00" } } }],
    ["la note", { sheetDetails: { ...SHEET, note: "" } }],
  ])("change quand %s change", (_what, change) => {
    const before = frozen("ord_1", { sheetDetails: SHEET });
    const after = frozen("ord_1", { sheetDetails: SHEET }, change);
    expect(printedOrderFingerprint(after)).not.toBe(printedOrderFingerprint(before));
  });

  it("ne dépend pas de ce que la fiche n'imprime pas : l'état de colisage", () => {
    const order = frozen("ord_1");
    const packed: ProductionOrderSnapshot = {
      ...order,
      packed: { at: new Date(0), by: "staff_1" },
    };
    expect(printedOrderFingerprint(packed)).toBe(printedOrderFingerprint(order));
  });
});

describe("nouvelles ou modifiées depuis un tirage", () => {
  const kept = frozen("ord_kept");
  const edited = frozen("ord_edited");
  const printed = printedFingerprintsOf([kept, edited, frozen("ord_gone")]);

  it("garde la commande nouvelle et la commande modifiée, jamais l'inchangée", () => {
    const now = [kept, frozen("ord_edited", { dueAt: "06:00" }), frozen("ord_new")];
    expect([...changedSince(now, printed)]).toEqual(["ord_edited", "ord_new"]);
  });

  it("ne rend rien quand rien n'a bougé — une commande partie n'a pas de fiche à refaire", () => {
    expect(changedSince([kept, edited], printed).size).toBe(0);
  });
});
