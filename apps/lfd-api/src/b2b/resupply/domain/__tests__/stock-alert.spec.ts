import { StockAlert, stockAlertLevelOf, stockAlertLiftReasonOf } from "../stock-alert.js";
import {
  IncompleteStockAlertError,
  StockAlertAlreadyLiftedError,
  UnknownStockAlertLevelError,
  UnknownStockAlertLiftReasonError,
} from "../stock-alert-errors.js";

/** Des instants comparés entre eux seulement : l'agrégat ne lit jamais l'horloge. */
const MORNING = new Date("2026-01-02T08:00:00Z");
const NOON = new Date("2026-01-02T12:00:00Z");
const DAYS_LATER = new Date("2026-01-09T08:00:00Z");
const LOU = { staffUserId: "staff_lou", name: "Lou", role: "counter" };
const MAX = { staffUserId: "staff_max", name: "Max", role: "counter" };

function declared(level: "out_of_stock" | "low" = "out_of_stock"): StockAlert {
  return StockAlert.declare({
    id: "alert_1",
    siteId: "site_village",
    sku: "CRO",
    label: "Croissant",
    level,
    trace: { at: MORNING, author: LOU },
  });
}

describe("une alerte de stock", () => {
  it("se déclare vivante, avec son niveau, son auteur et son instant", () => {
    const alert = declared();

    expect(alert.isLive).toBe(true);
    expect(alert.level).toBe("out_of_stock");
    expect(alert.declared).toEqual({ at: MORNING, author: LOU });
    expect(alert.lifted).toBeNull();
  });

  it("refuse un article ou un libellé vide", () => {
    expect(() =>
      StockAlert.declare({
        id: "a",
        siteId: "site_village",
        sku: " ",
        label: "Croissant",
        level: "low",
        trace: { at: MORNING, author: LOU },
      }),
    ).toThrow(IncompleteStockAlertError);
  });

  it("redéclarée, change d'état, d'auteur et d'instant sans changer d'identité", () => {
    const alert = declared("low");

    alert.redeclare("out_of_stock", { at: NOON, author: MAX });

    expect(alert.id).toBe("alert_1");
    expect(alert.level).toBe("out_of_stock");
    expect(alert.declared).toEqual({ at: NOON, author: MAX });
  });

  it("se lève à la main et garde qui, quand, pourquoi", () => {
    const alert = declared();

    alert.liftByHand({ at: NOON, author: MAX });

    expect(alert.isLive).toBe(false);
    expect(alert.lifted).toEqual({ at: NOON, author: MAX, reason: "manual" });
  });

  it("se lève à la réception d'un réassort, raison « receipt »", () => {
    const alert = declared();

    alert.liftOnReceipt({ at: NOON, author: LOU });

    expect(alert.lifted).toEqual({ at: NOON, author: LOU, reason: "receipt" });
  });

  it("levée, ne se relève ni ne se redéclare", () => {
    const alert = declared();
    alert.liftByHand({ at: NOON, author: MAX });

    expect(() => alert.liftByHand({ at: NOON, author: MAX })).toThrow(StockAlertAlreadyLiftedError);
    expect(() => alert.liftOnReceipt({ at: NOON, author: MAX })).toThrow(
      StockAlertAlreadyLiftedError,
    );
    expect(() => alert.redeclare("low", { at: NOON, author: MAX })).toThrow(
      StockAlertAlreadyLiftedError,
    );
  });

  it("n'expire pas : réhydratée des jours plus tard, elle est toujours vivante", () => {
    const alert = StockAlert.restore({
      id: "alert_1",
      siteId: "site_village",
      sku: "CRO",
      label: "Croissant",
      level: "out_of_stock",
      version: 1,
      declared: { at: MORNING, author: LOU },
      lifted: null,
    });

    expect(alert.isLive).toBe(true);
    alert.liftByHand({ at: DAYS_LATER, author: MAX });
    expect(alert.lifted?.at).toBe(DAYS_LATER);
  });

  it("relit niveau et raison stockés, et refuse l'inconnu", () => {
    expect(stockAlertLevelOf("low")).toBe("low");
    expect(stockAlertLiftReasonOf("receipt")).toBe("receipt");
    expect(() => stockAlertLevelOf("empty")).toThrow(UnknownStockAlertLevelError);
    expect(() => stockAlertLiftReasonOf("")).toThrow(UnknownStockAlertLiftReasonError);
  });
});
