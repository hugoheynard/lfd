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
    // `commercial` n'a que `b2b_companies: "write"` dans la matrice ; la lecture
    // n'est écrite nulle part et doit pourtant être là.
    const permissions = resolveStaffPermissions("commercial");

    expect(hasStaffPermission(permissions, "b2b_companies:write")).toBe(true);
    expect(hasStaffPermission(permissions, "b2b_companies:read")).toBe(true);
  });

  it("n'accorde pas l'écriture pour une lecture", () => {
    const permissions = resolveStaffPermissions("comptabilite");

    expect(hasStaffPermission(permissions, "b2b_companies:read")).toBe(true);
    expect(hasStaffPermission(permissions, "b2b_companies:write")).toBe(false);
  });

  it("ne laisse l'annuaire staff qu'à l'administrateur", () => {
    // Accorder des droits est le seul geste qui permet de s'en accorder :
    // un 2e rôle sur `staff_access` serait un 2e admin qui n'ose pas dire son nom.
    const holders = staffRoleSchema.options.filter((role) =>
      hasStaffPermission(resolveStaffPermissions(role), "staff_access:write"),
    );

    expect(holders).toEqual(["admin"]);
  });

  it("ouvre la fiscalité à la comptabilité, et à elle seule hors admin", () => {
    // La seule découpe du catalogue qu'un non-admin peut écrire. Si un autre
    // rôle apparaît ici, c'est qu'on a élargi par habitude : un taux de TVA
    // n'est pas un choix d'assortiment.
    const writers = staffRoleSchema.options.filter((role) =>
      hasStaffPermission(resolveStaffPermissions(role), "pim_tax:write"),
    );

    expect(writers).toEqual(["admin", "comptabilite"]);
  });

  it("ne retire la lecture des taux à personne en détachant `pim_tax` de `pim_catalog`", () => {
    // Les régimes se lisaient sous le droit du référentiel. La ressource change,
    // pas l'audience — sinon le découpage coûte un accès à quelqu'un, en silence.
    //
    // 🔴 **Les rôles du 2026-09-01, et eux seuls.** Ce cas itérait tout
    // `staffRoleSchema.options`, ce qui en faisait une règle permanente : « qui
    // lit le catalogue lit les taux ». Ce n'est pas ce qu'il garde. Il garde
    // une garantie de BASCULE — personne n'a perdu ce jour-là ce qu'il avait la
    // veille — et un rôle ouvert après coup n'avait rien à perdre.
    //
    // La preuve par l'usage : `communication`, ouvert le 2026-09-23, lit le
    // référentiel pour suivre une image jusqu'à son porteur. Lui donner la
    // fiscalité pour satisfaire ce cas aurait été accorder un droit à un test,
    // ce qui est exactement l'inverse de ce qu'un test sert à faire.
    const atDetachment = ["admin", "commercial", "comptabilite", "dev"] as const;
    const readers = atDetachment.filter((role) =>
      hasStaffPermission(resolveStaffPermissions(role), "pim_catalog:read"),
    );

    expect(readers.length).toBeGreaterThan(0);
    for (const role of readers) {
      expect(hasStaffPermission(resolveStaffPermissions(role), "pim_tax:read")).toBe(true);
    }
  });

  it("réserve le journal d’activité à l’administrateur", () => {
    // Il traverse tous les modules : l'ouvrir à un rôle métier lui donnerait
    // l'activité des autres par la bande. Élargir plus tard reste possible.
    const readers = staffRoleSchema.options.filter((role) =>
      hasStaffPermission(resolveStaffPermissions(role), "activity:read"),
    );

    expect(readers).toEqual(["admin"]);
  });

  it("garde le rôle technique hors des données clients", () => {
    // ⚠️ La ressource `tech` a DISPARU au découpage par outil (2026-09-01) :
    // aucune route ne la vérifiait, et un droit que personne ne lit est un droit
    // qui ment. Ce que `dev` possède désormais est nommé — la santé de
    // l'écosystème — et ce qu'il n'a pas l'est tout autant.
    const permissions = resolveStaffPermissions("dev");

    expect(hasStaffPermission(permissions, "ops_health:read")).toBe(true);
    expect(hasStaffPermission(permissions, "b2b_companies:read")).toBe(false);
    expect(hasStaffPermission(permissions, "b2b_orders:read")).toBe(false);
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
    // `ops_health` et non `b2b_orders` : depuis que le commercial écrit les
    // commandes, une dérogation dessus n'ajouterait rien — le test passerait
    // sans rien prouver.
    const permissions = resolveStaffPermissions("commercial", [allow("ops_health", "write")]);

    expect(hasStaffPermission(permissions, "ops_health:write")).toBe(true);
  });

  it("retire ce que le rôle donne", () => {
    // « Léa est commerciale SAUF qu'elle ne touche pas aux prospects. »
    const permissions = resolveStaffPermissions("commercial", [deny("b2b_growth", "write")]);

    expect(hasStaffPermission(permissions, "b2b_growth:write")).toBe(false);
    expect(hasStaffPermission(permissions, "b2b_growth:read")).toBe(true);
  });

  it("refuse l'écriture quand elle refuse la lecture", () => {
    // La dualité de « écrire implique lire » : garder le droit de modifier une
    // page qu'on n'a pas le droit d'ouvrir n'a aucun sens.
    const permissions = resolveStaffPermissions("commercial", [deny("b2b_companies", "read")]);

    expect(hasStaffPermission(permissions, "b2b_companies:read")).toBe(false);
    expect(hasStaffPermission(permissions, "b2b_companies:write")).toBe(false);
  });

  it("fait gagner le refus, même contre une autorisation explicite", () => {
    const permissions = resolveStaffPermissions("support", [
      allow("b2b_settings", "write"),
      deny("b2b_settings", "write"),
    ]);

    expect(hasStaffPermission(permissions, "b2b_settings:write")).toBe(false);
  });

  it("ne rend pas un administrateur amputable par mégarde", () => {
    // Le domaine interdira la dérogation qui coupe `staff_access:write` à un
    // admin ; la fonction pure, elle, l'applique. Ce test fige l'endroit où vit
    // la règle — dans l'agrégat, pas ici.
    const permissions = resolveStaffPermissions("admin", [deny("staff_access", "write")]);

    expect(hasStaffPermission(permissions, "staff_access:write")).toBe(false);
  });

  it("ignore une dérogation qui ne change rien", () => {
    const withNoop = resolveStaffPermissions("comptabilite", [allow("b2b_orders", "read")]);

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
    expect(dedupeStaffOverrides([allow("b2b_orders"), deny("b2b_orders")])).toHaveLength(1);
  });

  it("fait gagner le refus, quel que soit l'ordre d'arrivée", () => {
    expect(dedupeStaffOverrides([allow("b2b_orders"), deny("b2b_orders")])[0]?.effect).toBe("deny");
    expect(dedupeStaffOverrides([deny("b2b_orders"), allow("b2b_orders")])[0]?.effect).toBe("deny");
  });

  it("donne le même effectif que la formule, sur la liste brute comme sur la réduite", () => {
    // C'est LA propriété qui compte : normaliser ne doit rien changer au
    // résultat, sinon on aurait déplacé le problème au lieu de le fermer.
    const raw = [allow("b2b_orders"), deny("b2b_orders"), allow("b2b_growth")];

    expect(resolveStaffPermissions("support", dedupeStaffOverrides(raw))).toEqual(
      resolveStaffPermissions("support", raw),
    );
  });

  it("laisse tranquilles des permissions distinctes", () => {
    const distinct = [allow("b2b_orders"), allow("b2b_growth")];

    expect(dedupeStaffOverrides(distinct)).toHaveLength(2);
  });
});

describe("la médiathèque", () => {
  /**
   * 🔴 Ce cas garde une décision qui RETIRE un accès, et c'est le seul du
   * fichier dans ce sens. `media_library` a été détachée de `pim_catalog` le
   * 2026-09-23 : la bibliothèque n'appartient à aucun référentiel, et
   * alimenter le fonds n'est pas rédiger une fiche.
   *
   * ⚠️ Conséquence assumée (Hugo) : un commercial qui édite une fiche ne peut
   * plus y choisir d'image. Si ce cas rougit parce qu'on a rouvert le droit à
   * un autre rôle, ce n'est pas le test qu'il faut corriger — c'est la
   * décision qu'il faut reprendre.
   */
  it("n'ouvre le fonds qu'à l'administration et à la communication", () => {
    const readers = staffRoleSchema.options.filter((role) =>
      hasStaffPermission(resolveStaffPermissions(role), "media_library:read"),
    );

    expect(readers).toEqual(["admin", "communication"]);
  });

  it("laisse la communication ÉCRIRE — c'est sa raison d'être", () => {
    // Déposer, taguer, décrire, retirer. Un rôle qui ne ferait que lire le
    // fonds ne porterait pas le métier que la médiathèque a rendu visible.
    expect(
      hasStaffPermission(resolveStaffPermissions("communication"), "media_library:write"),
    ).toBe(true);
  });

  it("donne à la communication de quoi SUIVRE une image jusqu'à son porteur", () => {
    // Le panneau « voir où sert cette image » liste les fiches qui la portent,
    // et ses liens y mènent. Sans `pim_catalog:read`, on saurait qu'une image
    // sert sans pouvoir aller voir — donc sans pouvoir décider de la
    // remplacer.
    const granted = resolveStaffPermissions("communication");

    expect(hasStaffPermission(granted, "pim_catalog:read")).toBe(true);
    // Mais elle ne MODIFIE aucune fiche, et ne diffuse rien : voir le
    // référentiel n'est pas le publier.
    expect(hasStaffPermission(granted, "pim_catalog:write")).toBe(false);
    expect(hasStaffPermission(granted, "pim_channels:read")).toBe(false);
  });
});

describe("le comptoir", () => {
  /**
   * Le rôle pour lequel `plan-commande-au-comptoir.md` existe : prendre la
   * commande d'un pro sans lire sa fiche. Si ce cas rougit parce qu'on a donné
   * `b2b_companies` au comptoir, c'est la décision qu'il faut reprendre, pas le
   * test.
   */
  it("donne au vendeur de comptoir le Comptoir et la passation, et pas la fiche client", () => {
    const granted = resolveStaffPermissions("comptoir");

    expect(hasStaffPermission(granted, "b2b_counter:read")).toBe(true);
    expect(hasStaffPermission(granted, "b2b_orders:write")).toBe(true);
    expect(hasStaffPermission(granted, "b2b_companies:read")).toBe(false);
    expect(hasStaffPermission(granted, "b2b_settings:read")).toBe(false);
  });

  it("n'ôte la saisie au comptoir à personne : qui commande pour un pro lit le Comptoir", () => {
    // Reconduction du 2026-09-25 — la migration l'applique aux rôles par leur
    // CONTENU, le contrat doit dire la même chose.
    const orderWriters = staffRoleSchema.options.filter((role) =>
      hasStaffPermission(resolveStaffPermissions(role), "b2b_orders:write"),
    );

    expect(orderWriters.length).toBeGreaterThan(0);
    for (const role of orderWriters) {
      expect({
        role,
        counter: hasStaffPermission(resolveStaffPermissions(role), "b2b_counter:read"),
      }).toEqual({
        role,
        counter: true,
      });
    }
  });
});
