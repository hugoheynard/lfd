import { subAccountNoticeKindSchema } from "@lfd/contracts";

import { noticeGrid, notifiedRoles } from "../notified-roles.js";
import { NOTICE_KINDS, SUB_ACCOUNT_NOTICE_DEFAULTS } from "../sub-account-notice-defaults.js";

describe("le tableau par défaut des avis au principal (§1)", () => {
  it("couvre exactement les actions de l'enum, dans l'ordre du plan", () => {
    expect(NOTICE_KINDS).toEqual(subAccountNoticeKindSchema.options);
    expect(Object.keys(SUB_ACCOUNT_NOTICE_DEFAULTS).sort()).toEqual([...NOTICE_KINDS].sort());
  });

  it.each([
    ["order_placed", ["owner", "admin", "orders"]],
    ["order_cancelled", ["owner", "admin", "orders"]],
    ["payment_failed", ["owner", "billing"]],
    ["subscription_changed", ["owner", "admin", "orders"]],
    ["delivery_address_changed", ["owner", "admin"]],
    ["contact_changed", ["owner", "admin"]],
    ["bank_account_changed", ["owner", "billing"]],
    ["order_problem_reported", ["owner", "admin", "orders"]],
  ] as const)("%s prévient par défaut %j", (kind, roles) => {
    expect(notifiedRoles(kind, [])).toEqual(roles);
  });
});

describe("notifiedRoles — dérogations du staff, sinon défaut", () => {
  it("retire un rôle coché par défaut quand le staff le décoche", () => {
    expect(
      notifiedRoles("order_placed", [{ kind: "order_placed", role: "orders", enabled: false }]),
    ).toEqual(["owner", "admin"]);
  });

  it("ajoute un rôle décoché par défaut quand le staff le coche", () => {
    expect(
      notifiedRoles("payment_failed", [{ kind: "payment_failed", role: "admin", enabled: true }]),
    ).toEqual(["owner", "admin", "billing"]);
  });

  it("ignore les dérogations d'une autre action", () => {
    expect(
      notifiedRoles("contact_changed", [{ kind: "order_placed", role: "owner", enabled: false }]),
    ).toEqual(["owner", "admin"]);
  });

  it("peut ne prévenir personne", () => {
    const off = (["owner", "admin"] as const).map((role) => ({
      kind: "contact_changed" as const,
      role,
      enabled: false,
    }));
    expect(notifiedRoles("contact_changed", off)).toEqual([]);
  });
});

describe("noticeGrid — chaque cellule dit si elle est au défaut", () => {
  it("rend 8 × 4 cellules, toutes au défaut sans dérogation", () => {
    const grid = noticeGrid([]);
    expect(grid).toHaveLength(32);
    expect(grid.every((cell) => cell.atDefault)).toBe(true);
  });

  it("marque la cellule dérogée, et elle seule", () => {
    const grid = noticeGrid([{ kind: "order_placed", role: "billing", enabled: true }]);
    const moved = grid.filter((cell) => !cell.atDefault);
    expect(moved).toEqual([
      { kind: "order_placed", role: "billing", enabled: true, atDefault: false },
    ]);
  });

  it("tient pour défaut une dérogation qui redit le défaut", () => {
    const grid = noticeGrid([{ kind: "order_placed", role: "owner", enabled: true }]);
    expect(grid.find((c) => c.kind === "order_placed" && c.role === "owner")?.atDefault).toBe(true);
  });
});
