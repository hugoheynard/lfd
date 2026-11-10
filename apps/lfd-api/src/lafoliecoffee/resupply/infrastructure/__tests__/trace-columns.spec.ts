import { UnreadableResupplyRowError } from "../../domain/resupply-unreadable-row-error.js";
import { stockAlertSnapshotOf, type StockAlertRow } from "../stock-alert.row.js";
import { placedSnapshotOf, snapshotOf, type SiteResupplyRow } from "../site-resupply.row.js";
import { wholeTraceOf } from "../trace-columns.js";

/** Instants comparés entre eux seulement, jamais à l'horloge. */
const AT = new Date(1_000);
const ORIGIN = { table: "site_resupply", rowId: "rs_1", gesture: "envoi" };

describe("wholeTraceOf", () => {
  it("sans instant, pas de geste", () => {
    expect(
      wholeTraceOf({ at: null, staffUserId: null, name: null, role: null }, ORIGIN),
    ).toBeNull();
  });

  it("relit un geste entier", () => {
    expect(
      wholeTraceOf({ at: AT, staffUserId: "staff_1", name: "Lou", role: "counter" }, ORIGIN),
    ).toEqual({ at: AT, author: { staffUserId: "staff_1", name: "Lou", role: "counter" } });
  });

  /** Régression : un auteur absent était relu en chaînes vides — « par  » au comptoir. */
  it("refuse un instant sans auteur entier au lieu d'inventer un nom vide", () => {
    expect(() =>
      wholeTraceOf({ at: AT, staffUserId: "staff_1", name: null, role: "counter" }, ORIGIN),
    ).toThrow(UnreadableResupplyRowError);
  });
});

describe("snapshotOf (site_resupply)", () => {
  const ROW: SiteResupplyRow = {
    id: "rs_1",
    siteId: "site_1",
    target: "asap",
    serviceDay: new Date(Date.UTC(2026, 0, 2)),
    version: 1,
    origin: "counter",
    name: null,
    placedAt: AT,
    placedByStaffId: null,
    placedByName: null,
    placedByRole: null,
    cancelledAt: null,
    cancelledByStaffId: null,
    cancelledByName: null,
    cancelledByRole: null,
    arrivedAt: null,
    arrivedByStaffId: null,
    arrivedByName: null,
    arrivedByRole: null,
    launchedAt: null,
    launchedByName: null,
    departedAt: null,
    departedByName: null,
    lines: [],
  };

  /** Régression : un envoi sans auteur relu passait pour envoyé « par  ». */
  it("refuse un envoi daté sans auteur", () => {
    expect(() => snapshotOf(ROW)).toThrow(UnreadableResupplyRowError);
  });

  /** Régression : un brouillon dans une lecture « envoyés » était écarté en silence par un filtre. */
  it("une lecture des envoyés refuse un brouillon au lieu de le taire", () => {
    expect(() => placedSnapshotOf({ ...ROW, placedAt: null })).toThrow(UnreadableResupplyRowError);
  });
});

describe("stockAlertSnapshotOf", () => {
  const ROW: StockAlertRow = {
    id: "alert_1",
    siteId: "site_1",
    sku: "CRO",
    label: "Croissant",
    level: "low",
    version: 2,
    declaredAt: AT,
    declaredByStaffId: "staff_1",
    declaredByName: "Lou",
    declaredByRole: "counter",
    liftedAt: AT,
    liftedByStaffId: "staff_1",
    liftedByName: "Lou",
    liftedByRole: "counter",
    liftReason: null,
  };

  /** Régression : une levée sans raison était relue avec une raison vide. */
  it("refuse une levée datée sans raison", () => {
    expect(() => stockAlertSnapshotOf(ROW)).toThrow(UnreadableResupplyRowError);
  });

  it("relit une levée entière", () => {
    const reason = "manual";
    const snapshot = stockAlertSnapshotOf({ ...ROW, liftReason: reason });
    expect(snapshot.lifted).toMatchObject({ at: AT, reason });
  });
});
