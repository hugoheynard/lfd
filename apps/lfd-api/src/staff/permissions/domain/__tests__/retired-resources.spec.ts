import type { RoleGrant } from "@lfd/contracts";

import {
  RetiredStaffResourceGrantedError,
  assertRetiredLinesUnchanged,
} from "../retired-resources.js";
import { StaffRoleDefinition, type DirectoryKeepersSnapshot } from "../staff-role-definition.js";

/** `plan-droit-lfc-catalog.md`, lot L2 : `b2b_catalog` reste lisible, ne s'accorde plus. */
const NOBODY_KEEPS: DirectoryKeepersSnapshot = { actorId: "auteur", keepers: [] };
const LEGACY_WRITE: RoleGrant = { resource: "b2b_catalog", action: "write" };
const ORDERS_READ: RoleGrant = { resource: "b2b_orders", action: "read" };

function storedVente(grants: readonly RoleGrant[]): StaffRoleDefinition {
  return StaffRoleDefinition.reconstitute({
    key: "vente",
    label: "Vente",
    grants,
    archivedAt: null,
  });
}

const key = (grant: RoleGrant): string => `${grant.resource}:${grant.action}`;

describe("assertRetiredLinesUnchanged", () => {
  it("laisse passer une ligne retirée gardée à l'identique", () => {
    expect(() => assertRetiredLinesUnchanged([LEGACY_WRITE], [LEGACY_WRITE], key)).not.toThrow();
  });

  it("refuse une ligne retirée nouvelle", () => {
    expect(() => assertRetiredLinesUnchanged([], [LEGACY_WRITE], key)).toThrow(
      RetiredStaffResourceGrantedError,
    );
  });

  it("ne regarde pas les ressources vivantes", () => {
    expect(() => assertRetiredLinesUnchanged([], [ORDERS_READ], key)).not.toThrow();
  });
});

describe("StaffRoleDefinition face à une ressource retirée", () => {
  it("refuse un rôle neuf qui la porte", () => {
    expect(() =>
      StaffRoleDefinition.define({ key: "neuf", label: "Neuf", grants: [LEGACY_WRITE] }),
    ).toThrow(RetiredStaffResourceGrantedError);
  });

  it("garde à l'identique un rôle qui la porte encore, enregistré entier", () => {
    const role = storedVente([LEGACY_WRITE, ORDERS_READ]);
    role.redefine({ label: "Vente pro", grants: [LEGACY_WRITE, ORDERS_READ] }, NOBODY_KEEPS);
    expect(role.toPersistence().grants).toEqual([LEGACY_WRITE, ORDERS_READ]);
  });

  it("la laisse partir — le seul geste qu'elle offre", () => {
    const role = storedVente([LEGACY_WRITE, ORDERS_READ]);
    role.redefine({ label: "Vente", grants: [ORDERS_READ] }, NOBODY_KEEPS);
    expect(role.toPersistence().grants).toEqual([ORDERS_READ]);
  });

  it("refuse d'en changer le niveau : ce serait un nouvel accord", () => {
    const role = storedVente([{ resource: "b2b_catalog", action: "read" }, ORDERS_READ]);
    expect(() =>
      role.redefine({ label: "Vente", grants: [LEGACY_WRITE, ORDERS_READ] }, NOBODY_KEEPS),
    ).toThrow(RetiredStaffResourceGrantedError);
  });

  it("ne la résout pas, et garde les autres droits", () => {
    expect(storedVente([LEGACY_WRITE, ORDERS_READ]).permissions()).toEqual(["b2b_orders:read"]);
  });
});
