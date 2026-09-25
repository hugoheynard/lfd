import type { RoleGrant } from "@lfd/contracts";

import {
  InvalidStaffRoleError,
  ReservedStaffRoleKeyError,
  StaffRoleLastDirectoryKeeperError,
  StaffRoleSelfRevokeError,
  StaffRoleStillHeldError,
} from "../staff-role-errors.js";
import { StaffRoleDefinition, type DirectoryKeepersSnapshot } from "../staff-role-definition.js";

/** Personne ne tient l'annuaire : une redéfinition ordinaire ne regarde rien. */
const NOBODY_KEEPS: DirectoryKeepersSnapshot = { actorId: "auteur", keepers: [] };

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
    role.redefine(
      {
        label: "Fournil & labo",
        grants: [{ resource: "pim_catalog", action: "read" }],
      },
      NOBODY_KEEPS,
    );
    expect(role.toPersistence()).toMatchObject({
      key: "fournil",
      label: "Fournil & labo",
      grants: [{ resource: "pim_catalog", action: "read" }],
    });
  });

  it("refuse de se vider par réécriture, comme à la création", () => {
    const role = fournil();
    expect(() => role.redefine({ label: "Fournil", grants: [] }, NOBODY_KEEPS)).toThrow(
      InvalidStaffRoleError,
    );
  });
});

describe("StaffRoleDefinition — on ne vide pas l'annuaire en redéfinissant", () => {
  /**
   * Plan `plan-roles-lus-en-base.md` §3.3 : depuis que la définition fait foi,
   * retirer `staff_access:write` à un rôle le retire à ses porteurs.
   */
  const gatekeeper = (): StaffRoleDefinition =>
    StaffRoleDefinition.define({
      key: "gardien",
      label: "Gardien",
      grants: [
        { resource: "staff_access", action: "write" },
        { resource: "b2b_orders", action: "read" },
      ],
    });
  const stripped = {
    label: "Gardien",
    grants: [{ resource: "b2b_orders", action: "read" }],
  } as const;

  it("refuse quand ses porteurs sont les seuls à tenir l'annuaire", () => {
    const role = gatekeeper();

    expect(() =>
      role.redefine(
        { ...stripped, grants: [...stripped.grants] },
        { actorId: "auteur", keepers: [{ staffUserId: "a", roleKey: "gardien" }] },
      ),
    ).toThrow(StaffRoleLastDirectoryKeeperError);
    expect(role.permissions()).toContain("staff_access:write");
  });

  it("refuse que l'auteur se le retire à lui-même", () => {
    expect(() =>
      gatekeeper().redefine(
        { ...stripped, grants: [...stripped.grants] },
        {
          actorId: "auteur",
          keepers: [
            { staffUserId: "auteur", roleKey: "gardien" },
            { staffUserId: "b", roleKey: "admin" },
          ],
        },
      ),
    ).toThrow(StaffRoleSelfRevokeError);
  });

  it("laisse faire quand un autre rôle le tient encore", () => {
    const role = gatekeeper();

    role.redefine(
      { ...stripped, grants: [...stripped.grants] },
      {
        actorId: "auteur",
        keepers: [
          { staffUserId: "a", roleKey: "gardien" },
          { staffUserId: "b", roleKey: "admin" },
        ],
      },
    );

    expect(role.permissions()).not.toContain("staff_access:write");
  });

  it("ne regarde rien quand le droit n'est pas retiré", () => {
    const role = gatekeeper();

    expect(() =>
      role.redefine(
        { label: "Gardien de nuit", grants: [{ resource: "staff_access", action: "write" }] },
        { actorId: "auteur", keepers: [{ staffUserId: "auteur", roleKey: "gardien" }] },
      ),
    ).not.toThrow();
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
