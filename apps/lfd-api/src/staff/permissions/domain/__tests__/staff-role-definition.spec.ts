import type { RoleGrant } from "@lfd/contracts";

import {
  InvalidStaffRoleError,
  ReservedStaffRoleKeyError,
  StaffRoleStillHeldError,
} from "../staff-role-errors.js";
import { StaffRoleDefinition } from "../staff-role-definition.js";

const GRANTS: readonly RoleGrant[] = [
  { resource: "b2b_orders", action: "write" },
  { resource: "b2b_companies", action: "read" },
];

function fournil(grants: readonly RoleGrant[] = GRANTS): StaffRoleDefinition {
  return StaffRoleDefinition.define({ key: "fournil", label: "Fournil", grants });
}

describe("StaffRoleDefinition — définition", () => {
  it("normalise la clé : elle vivra dans une colonne et dans le journal", () => {
    const role = StaffRoleDefinition.define({
      key: "  Fournil-Nuit ",
      label: " Fournil de nuit ",
      grants: GRANTS,
    });
    expect(role.toPersistence().key).toBe("fournil-nuit");
    expect(role.label).toBe("Fournil de nuit");
  });

  it("refuse la clé du sommet — il vit dans le code, pas en base", () => {
    expect(() =>
      StaffRoleDefinition.define({ key: "superadmin", label: "Bis", grants: GRANTS }),
    ).toThrow(ReservedStaffRoleKeyError);
  });

  it("refuse la clé du sommet quelle qu'en soit la casse", () => {
    expect(() =>
      StaffRoleDefinition.define({ key: "SuperAdmin", label: "Bis", grants: GRANTS }),
    ).toThrow(ReservedStaffRoleKeyError);
  });

  it("refuse un rôle qui n'ouvre aucun écran, et dit quoi faire à la place", () => {
    // Quelqu'un à qui on l'attribuerait verrait 403 partout sans qu'aucun écran
    // ne lui dise pourquoi.
    expect(() => fournil([])).toThrow(InvalidStaffRoleError);
    expect(() => fournil([])).toThrow(/suspendez la personne/u);
  });

  it("refuse deux niveaux sur la même ressource", () => {
    expect(() =>
      fournil([
        { resource: "b2b_orders", action: "read" },
        { resource: "b2b_orders", action: "write" },
      ]),
    ).toThrow(/un seul niveau/u);
  });

  it("refuse un libellé vide", () => {
    expect(() =>
      StaffRoleDefinition.define({ key: "fournil", label: "   ", grants: GRANTS }),
    ).toThrow(/Libellé/u);
  });
});

describe("StaffRoleDefinition — ce qu'il accorde", () => {
  it("fait traîner `read` derrière `write` : on ne modifie pas ce qu'on ne voit pas", () => {
    expect(fournil().permissions()).toEqual([
      "b2b_companies:read",
      "b2b_orders:read",
      "b2b_orders:write",
    ]);
  });

  it("n'accorde rien hors de ses droits", () => {
    expect(fournil().permissions()).not.toContain("staff_access:write");
  });
});

describe("StaffRoleDefinition — réécriture", () => {
  it("change le libellé et les droits, jamais la clé", () => {
    const role = fournil();
    role.redefine({
      label: "Fournil & labo",
      grants: [{ resource: "pim_catalog", action: "read" }],
    });
    expect(role.toPersistence()).toMatchObject({
      key: "fournil",
      label: "Fournil & labo",
      grants: [{ resource: "pim_catalog", action: "read" }],
    });
  });

  it("refuse de se vider par réécriture, comme à la création", () => {
    const role = fournil();
    expect(() => role.redefine({ label: "Fournil", grants: [] })).toThrow(InvalidStaffRoleError);
  });
});

describe("StaffRoleDefinition — archivage", () => {
  it("refuse d'archiver un rôle que des gens portent encore", () => {
    // Sinon ils se retrouvent avec un rôle inexistant : plus aucun droit à la
    // prochaine résolution, sans qu'aucun écran ne l'ait annoncé.
    const role = fournil();
    expect(() => role.archive(new Date("2026-09-01T10:00:00.000Z"), 3)).toThrow(
      StaffRoleStillHeldError,
    );
    expect(() => role.archive(new Date("2026-09-01T10:00:00.000Z"), 3)).toThrow(/3 personnes/u);
    expect(role.archived).toBe(false);
  });

  it("accorde le singulier à une seule personne", () => {
    expect(() => fournil().archive(new Date("2026-09-01T10:00:00.000Z"), 1)).toThrow(
      /1 personne porte/u,
    );
  });

  it("archive un rôle que plus personne ne porte, et le restaure", () => {
    const role = fournil();
    role.archive(new Date("2026-09-01T10:00:00.000Z"), 0);
    expect(role.archived).toBe(true);
    role.restore();
    expect(role.archived).toBe(false);
  });
});

describe("StaffRoleDefinition — relecture", () => {
  it("fait l'aller-retour sans rien perdre", () => {
    const written = fournil().toPersistence();
    expect(StaffRoleDefinition.reconstitute(written).toPersistence()).toEqual(written);
  });
});
