import {
  ALL_STAFF_PERMISSIONS,
  ROLE_GRANTS,
  resolveStaffPermissions,
  staffResourceSchema,
} from "../staff-access.js";
import {
  fromRoleGrants,
  isSuperAdminRoleKey,
  legacyRoleSeeds,
  resolveRolePermissions,
  roleGrantsSchema,
  staffRoleKeySchema,
  SUPER_ADMIN_ROLE_KEY,
  toRoleGrants,
} from "../staff-role.js";

describe("le sommet", () => {
  it("accorde TOUTES les permissions du catalogue", () => {
    expect(resolveRolePermissions(SUPER_ADMIN_ROLE_KEY, {})).toEqual(ALL_STAFF_PERMISSIONS);
  });

  it("couvre une ressource ajoutée au catalogue sans qu'on y touche", () => {
    // Le court-circuit est là pour ça : une matrice énumérée aurait un trou
    // jusqu'à ce que quelqu'un pense à la compléter — sur le compte censé
    // pouvoir tout réparer.
    const everyResourceCovered = staffResourceSchema.options.every((resource) =>
      resolveRolePermissions(SUPER_ADMIN_ROLE_KEY, {}).includes(`${resource}:write`),
    );
    expect(everyResourceCovered).toBe(true);
  });

  it("ne se referme par AUCUNE dérogation — c'est l'issue de secours", () => {
    // Sinon quelqu'un qui tient `staff:write` retire `staff:write` au sommet et
    // verrouille tout le monde dehors.
    const denied = resolveRolePermissions(SUPER_ADMIN_ROLE_KEY, {}, [
      { resource: "staff_access", action: "write", effect: "deny" },
      { resource: "staff_access", action: "read", effect: "deny" },
    ]);
    expect(denied).toEqual(ALL_STAFF_PERMISSIONS);
  });

  it("se reconnaît à sa clé, et lui seul", () => {
    expect(isSuperAdminRoleKey("superadmin")).toBe(true);
    expect(isSuperAdminRoleKey("admin")).toBe(false);
    expect(isSuperAdminRoleKey("super-admin")).toBe(false);
  });
});

describe("un rôle défini", () => {
  it("se résout exactement comme un rôle du catalogue", () => {
    // Le pivot de toute la bascule : même fonction, même résultat.
    const grants = toRoleGrants(fromRoleGrants(ROLE_GRANTS.commercial));
    expect(resolveRolePermissions("commercial", grants)).toEqual(
      resolveStaffPermissions("commercial"),
    );
  });

  it("subit les dérogations, lui", () => {
    const grants = toRoleGrants([{ resource: "b2b_orders", action: "write" }]);
    const effective = resolveRolePermissions("fournil", grants, [
      { resource: "b2b_orders", action: "write", effect: "deny" },
    ]);
    expect(effective).toEqual(["b2b_orders:read"]);
  });
});

describe("les graines", () => {
  it("recopient les cinq rôles du catalogue à l'identique", () => {
    // La migration les insère depuis CETTE fonction : si elle dérivait de
    // `ROLE_GRANTS`, la base semée ne dirait plus ce que le code dit.
    for (const seed of legacyRoleSeeds()) {
      expect(resolveRolePermissions(seed.key, toRoleGrants(seed.grants))).toEqual(
        resolveStaffPermissions(seed.key),
      );
    }
  });

  it("ne sèment pas le sommet", () => {
    expect(legacyRoleSeeds().map((seed) => seed.key)).not.toContain(SUPER_ADMIN_ROLE_KEY);
  });
});

describe("la clé", () => {
  it("accepte un slug", () => {
    expect(staffRoleKeySchema.parse(" Fournil-Nuit ")).toBe("fournil-nuit");
  });

  it("refuse ce qui ne tiendrait pas dans une URL ou un journal", () => {
    expect(staffRoleKeySchema.safeParse("Fournil de nuit").success).toBe(false);
    expect(staffRoleKeySchema.safeParse("2fournil").success).toBe(false);
    expect(staffRoleKeySchema.safeParse("f").success).toBe(false);
  });
});

describe("les droits", () => {
  it("refusent deux niveaux sur la même ressource", () => {
    const twice = [
      { resource: "b2b_orders", action: "read" },
      { resource: "b2b_orders", action: "write" },
    ];
    expect(roleGrantsSchema.safeParse(twice).success).toBe(false);
  });

  it("font l'aller-retour entre la forme transportée et la forme résolue", () => {
    const grants = [
      { resource: "b2b_companies", action: "read" },
      { resource: "b2b_orders", action: "write" },
    ] as const;
    expect(fromRoleGrants(toRoleGrants(grants))).toEqual([...grants]);
  });
});
