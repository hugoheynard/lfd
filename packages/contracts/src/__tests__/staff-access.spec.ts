import {
  ALL_STAFF_PERMISSIONS,
  dedupeStaffOverrides,
  hasStaffPermission,
  resolveStaffPermissions,
  ROLE_GRANTS,
  staffActionSchema,
  staffResourceSchema,
  staffRoleSchema,
  type StaffOverride,
  type StaffPermission,
} from "../staff-access.js";

describe("resolveStaffPermissions — le rôle seul", () => {
  it("donne TOUS les pouvoirs à l'administrateur", () => {
    // L'invariant le plus important du modèle : si `admin` cesse de tout
    // couvrir, quelqu'un se retrouve enfermé dehors sans recours.
    expect(resolveStaffPermissions("admin")).toEqual(ALL_STAFF_PERMISSIONS);
  });

  it("traîne la lecture avec l'écriture", () => {
    // `commercial` n'a que `companies: "write"` dans la matrice ; la lecture
    // n'est écrite nulle part et doit pourtant être là.
    const permissions = resolveStaffPermissions("commercial");

    expect(hasStaffPermission(permissions, "companies:write")).toBe(true);
    expect(hasStaffPermission(permissions, "companies:read")).toBe(true);
  });

  it("n'accorde pas l'écriture pour une lecture", () => {
    const permissions = resolveStaffPermissions("comptabilite");

    expect(hasStaffPermission(permissions, "companies:read")).toBe(true);
    expect(hasStaffPermission(permissions, "companies:write")).toBe(false);
  });

  it("ne laisse l'annuaire staff qu'à l'administrateur", () => {
    // Accorder des droits est le seul geste qui permet de s'en accorder :
    // un 2e rôle sur `staff` serait un 2e admin qui n'ose pas dire son nom.
    const holders = staffRoleSchema.options.filter((role) =>
      hasStaffPermission(resolveStaffPermissions(role), "staff:write"),
    );

    expect(holders).toEqual(["admin"]);
  });

  it("garde le rôle technique hors des données clients", () => {
    const permissions = resolveStaffPermissions("dev");

    expect(hasStaffPermission(permissions, "tech:write")).toBe(true);
    expect(hasStaffPermission(permissions, "companies:read")).toBe(false);
    expect(hasStaffPermission(permissions, "orders:read")).toBe(false);
  });

  it("rend un ordre stable, quelle que soit la matrice", () => {
    // L'effectif se compare et se sérialise tel quel : deux résolutions du même
    // rôle doivent produire le même tableau, pas le même ensemble.
    const permissions = resolveStaffPermissions("support");

    expect(permissions).toEqual([...permissions].sort(byCatalogueOrder));
  });
});

describe("resolveStaffPermissions — les dérogations", () => {
  const allow = (resource: StaffOverride["resource"], action: StaffOverride["action"]) => ({
    resource,
    action,
    effect: "allow" as const,
  });
  const deny = (resource: StaffOverride["resource"], action: StaffOverride["action"]) => ({
    resource,
    action,
    effect: "deny" as const,
  });

  it("ajoute ce que le rôle ne donne pas", () => {
    // « Marc est commercial MAIS il a aussi la main sur l'outillage. »
    // `tech` et non `orders` : depuis que le commercial écrit les commandes, une
    // dérogation dessus n'ajouterait rien — le test passerait sans rien prouver.
    const permissions = resolveStaffPermissions("commercial", [allow("tech", "write")]);

    expect(hasStaffPermission(permissions, "tech:write")).toBe(true);
  });

  it("retire ce que le rôle donne", () => {
    // « Léa est commerciale SAUF qu'elle ne touche pas aux prospects. »
    const permissions = resolveStaffPermissions("commercial", [deny("growth", "write")]);

    expect(hasStaffPermission(permissions, "growth:write")).toBe(false);
    expect(hasStaffPermission(permissions, "growth:read")).toBe(true);
  });

  it("refuse l'écriture quand elle refuse la lecture", () => {
    // La dualité de « écrire implique lire » : garder le droit de modifier une
    // page qu'on n'a pas le droit d'ouvrir n'a aucun sens.
    const permissions = resolveStaffPermissions("commercial", [deny("companies", "read")]);

    expect(hasStaffPermission(permissions, "companies:read")).toBe(false);
    expect(hasStaffPermission(permissions, "companies:write")).toBe(false);
  });

  it("fait gagner le refus, même contre une autorisation explicite", () => {
    const permissions = resolveStaffPermissions("support", [
      allow("settings", "write"),
      deny("settings", "write"),
    ]);

    expect(hasStaffPermission(permissions, "settings:write")).toBe(false);
  });

  it("ne rend pas un administrateur amputable par mégarde", () => {
    // Le domaine interdira la dérogation qui coupe `staff:write` à un admin ;
    // la fonction pure, elle, l'applique. Ce test fige l'endroit où vit la
    // règle — dans l'agrégat, pas ici.
    const permissions = resolveStaffPermissions("admin", [deny("staff", "write")]);

    expect(hasStaffPermission(permissions, "staff:write")).toBe(false);
  });

  it("ignore une dérogation qui ne change rien", () => {
    const withNoop = resolveStaffPermissions("comptabilite", [allow("orders", "read")]);

    expect(withNoop).toEqual(resolveStaffPermissions("comptabilite"));
  });
});

describe("le catalogue", () => {
  it("couvre chaque rôle", () => {
    // Un rôle ajouté à l'enum sans ligne dans la matrice résoudrait en silence
    // vers « aucun droit » — une panne qui ressemble à une décision.
    expect(Object.keys(ROLE_GRANTS).sort()).toEqual([...staffRoleSchema.options].sort());
  });

  it("énumère chaque ressource dans les deux actions", () => {
    // Le produit cartésien complet, dérivé des deux enums plutôt que d'un
    // nombre écrit à la main : une 10e ressource ne doit pas rendre ce test
    // rouge, elle doit être couverte. C'est l'absence de trou qu'on teste.
    const expected = staffResourceSchema.options.length * staffActionSchema.options.length;

    expect(ALL_STAFF_PERMISSIONS).toHaveLength(expected);
    expect(new Set(ALL_STAFF_PERMISSIONS).size).toBe(ALL_STAFF_PERMISSIONS.length);
  });
});

/** L'ordre du catalogue, seule référence de tri de l'effectif. */
function byCatalogueOrder(left: StaffPermission, right: StaffPermission): number {
  return ALL_STAFF_PERMISSIONS.indexOf(left) - ALL_STAFF_PERMISSIONS.indexOf(right);
}

describe("dedupeStaffOverrides", () => {
  const allow = (resource: StaffOverride["resource"]): StaffOverride => ({
    resource,
    action: "write",
    effect: "allow",
  });
  const deny = (resource: StaffOverride["resource"]): StaffOverride => ({
    resource,
    action: "write",
    effect: "deny",
  });

  it("ne garde qu'une ligne par permission", () => {
    // La base ne peut en stocker qu'une (contrainte d'unicité) : si on n'arbitre
    // pas ici, on valide un état et on en écrit un autre.
    expect(dedupeStaffOverrides([allow("orders"), deny("orders")])).toHaveLength(1);
  });

  it("fait gagner le refus, quel que soit l'ordre d'arrivée", () => {
    expect(dedupeStaffOverrides([allow("orders"), deny("orders")])[0]?.effect).toBe("deny");
    expect(dedupeStaffOverrides([deny("orders"), allow("orders")])[0]?.effect).toBe("deny");
  });

  it("donne le même effectif que la formule, sur la liste brute comme sur la réduite", () => {
    // C'est LA propriété qui compte : normaliser ne doit rien changer au
    // résultat, sinon on aurait déplacé le problème au lieu de le fermer.
    const raw = [allow("orders"), deny("orders"), allow("growth")];

    expect(resolveStaffPermissions("support", dedupeStaffOverrides(raw))).toEqual(
      resolveStaffPermissions("support", raw),
    );
  });

  it("laisse tranquilles des permissions distinctes", () => {
    const distinct = [allow("orders"), allow("growth")];

    expect(dedupeStaffOverrides(distinct)).toHaveLength(2);
  });
});
