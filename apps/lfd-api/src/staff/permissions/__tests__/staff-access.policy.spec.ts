import { ROLE_GRANTS, type RoleGrants, type StaffOverride, type StaffRole } from "@lfd/contracts";

import {
  assertEditAllowed,
  assertStatusChangeAllowed,
  type StaffMutationTarget,
} from "../staff-access.policy.js";
import {
  AdminOverrideRefusedError,
  LastStaffAdminError,
  ProtectedStaffUserError,
  RescueOverridesLockedError,
  SelfDemotionError,
  StaffGrantByOverrideError,
} from "../../directory/domain/staff-user-errors.js";

/**
 * Une personne qui tient l'annuaire par son rôle, avec un collègue qui le tient
 * aussi. Depuis la bascule (plan `plan-roles-lus-en-base.md` §3.3), la politique
 * ne lit plus le NOM du rôle : `keepsDirectory` est ce qui compte.
 */
function admin(overrides: Partial<StaffMutationTarget> = {}): StaffMutationTarget {
  return {
    email: "camille@lafoliedouce.com",
    isRoot: false,
    roleKey: "admin",
    currentOverrides: [],
    keepsDirectory: true,
    otherDirectoryKeepers: 1,
    isSelf: false,
    ...overrides,
  };
}

/** Une personne dont le rôle n'ouvre pas l'annuaire. */
function nonKeeper(roleKey: string): StaffMutationTarget {
  return admin({ roleKey, keepsDirectory: false });
}

/** L'intention d'écrire un rôle du contrat, droits tels que sa définition semée les porte. */
function intent(role: StaffRole, extra: { email?: string; overrides?: StaffOverride[] } = {}) {
  return intentFor(role, ROLE_GRANTS[role], extra);
}

/** L'intention d'écrire n'importe quel rôle défini — un rôle créé à l'écran compris. */
function intentFor(
  roleKey: string,
  roleGrants: RoleGrants,
  extra: { email?: string; overrides?: StaffOverride[] } = {},
) {
  return {
    email: extra.email ?? "camille@lafoliedouce.com",
    roleKey,
    roleGrants,
    overrides: extra.overrides ?? [],
  };
}

describe("l'admin racine", () => {
  const root = admin({ isRoot: true, email: "racine@lafoliedouce.com" });

  it("ne peut pas être rétrogradé", () => {
    expect(() =>
      assertEditAllowed(root, intent("commercial", { email: "racine@lafoliedouce.com" })),
    ).toThrow(ProtectedStaffUserError);
  });

  it("ne peut pas être renommé", () => {
    // Le renommage est la porte de derrière : changer l'e-mail ferait échapper la
    // ligne à sa propre garde, puisque c'est l'e-mail qui l'identifie.
    expect(() => assertEditAllowed(root, intent("admin", { email: "autre@ailleurs.fr" }))).toThrow(
      ProtectedStaffUserError,
    );
  });

  it("ne peut pas être suspendu", () => {
    expect(() => assertStatusChangeAllowed(root, "suspended")).toThrow(ProtectedStaffUserError);
  });

  it("se laisse éditer sur le reste", () => {
    expect(() =>
      assertEditAllowed(root, intent("admin", { email: "racine@lafoliedouce.com" })),
    ).not.toThrow();
  });
});

describe("le dernier administrateur", () => {
  const alone = admin({ otherDirectoryKeepers: 0 });

  it("ne peut pas être rétrogradé", () => {
    // L'admin racine protège UNE LIGNE, pas la propriété : sans cette règle, on
    // pouvait rétrograder tous les autres et se retrouver sans recours.
    expect(() => assertEditAllowed(alone, intent("support"))).toThrow(LastStaffAdminError);
  });

  it("ne peut pas être suspendu", () => {
    expect(() => assertStatusChangeAllowed(alone, "suspended")).toThrow(LastStaffAdminError);
  });

  it("s'efface dès qu'un autre existe", () => {
    expect(() => assertEditAllowed(admin(), intent("support"))).not.toThrow();
    expect(() => assertStatusChangeAllowed(admin(), "suspended")).not.toThrow();
  });

  it("ne compte pas les suspendus comme un recours", () => {
    // `otherDirectoryKeepers` compte les non-suspendus : quelqu'un qui n'a jamais
    // ouvert sa session reste un recours (il lui suffit de se connecter), un
    // suspendu non.
    expect(() =>
      assertStatusChangeAllowed(admin({ otherDirectoryKeepers: 0 }), "suspended"),
    ).toThrow(LastStaffAdminError);
  });
});

describe("l'auto-rétrogradation", () => {
  const me = admin({ isSelf: true });

  it("est refusée même s'il reste d'autres administrateurs", () => {
    // C'est le seul geste qu'on ne peut pas réparer soi-même : il faut alors
    // déranger quelqu'un d'autre.
    expect(() => assertEditAllowed(me, intent("commercial"))).toThrow(SelfDemotionError);
    expect(() => assertStatusChangeAllowed(me, "suspended")).toThrow(SelfDemotionError);
  });

  it("n'empêche pas de s'éditer sans changer de rôle", () => {
    expect(() => assertEditAllowed(me, intent("admin"))).not.toThrow();
  });

  it("prime sur le compte des autres administrateurs", () => {
    // Deux causes possibles, un seul message : on dit « c'est vous », pas
    // « il n'en reste plus » — le second enverrait chercher une solution qui
    // n'est pas le problème.
    expect(() =>
      assertStatusChangeAllowed(admin({ isSelf: true, otherDirectoryKeepers: 0 }), "suspended"),
    ).toThrow(SelfDemotionError);
  });
});

describe("les dérogations d'un administrateur", () => {
  const deny = (): StaffOverride => ({ resource: "staff_access", action: "write", effect: "deny" });

  it("ne peuvent pas lui couper l'accès à l'annuaire", () => {
    // Sinon le delta contourne « il reste au moins un admin » par la porte de
    // derrière : l'admin est toujours là, mais privé du seul droit qui permet
    // d'en désigner un autre.
    expect(() => assertEditAllowed(admin(), intent("admin", { overrides: [deny()] }))).toThrow(
      AdminOverrideRefusedError,
    );
  });

  it("attrapent aussi le refus de lecture, qui emporte l'écriture", () => {
    const denyRead: StaffOverride = { resource: "staff_access", action: "read", effect: "deny" };

    expect(() => assertEditAllowed(admin(), intent("admin", { overrides: [denyRead] }))).toThrow(
      AdminOverrideRefusedError,
    );
  });

  it("restent libres sur les autres ressources", () => {
    const denyGrowth: StaffOverride = { resource: "b2b_growth", action: "write", effect: "deny" };

    expect(() =>
      assertEditAllowed(admin(), intent("admin", { overrides: [denyGrowth] })),
    ).not.toThrow();
  });

  it("ne concernent pas les autres rôles", () => {
    const target = nonKeeper("commercial");

    expect(() =>
      assertEditAllowed(target, intent("commercial", { overrides: [deny()] })),
    ).not.toThrow();
  });
});

describe("les mutations sans danger", () => {
  it("laissent passer une promotion", () => {
    const target = nonKeeper("support");

    expect(() => assertEditAllowed(target, intent("admin"))).not.toThrow();
  });

  it("ne regardent pas les transitions d'état autres que la suspension", () => {
    // Inviter ou constater une entrée ne retire d'accès à personne.
    const alone = admin({ otherDirectoryKeepers: 0, isSelf: true });

    expect(() => assertStatusChangeAllowed(alone, "invited")).not.toThrow();
    expect(() => assertStatusChangeAllowed(alone, "active")).not.toThrow();
  });
});

describe("les bords de la politique", () => {
  it("REFUSE qu'une dérogation ouvre l'annuaire à un non-admin", () => {
    // L'escalade : `support` + `allow staff:write` peut administrer l'annuaire,
    // donc s'attribuer le rôle `admin` dans la foulée. Le modèle n'aurait plus
    // de sommet.
    const target = nonKeeper("support");
    const grant: StaffOverride = { resource: "staff_access", action: "write", effect: "allow" };

    expect(() => assertEditAllowed(target, intent("support", { overrides: [grant] }))).toThrow(
      StaffGrantByOverrideError,
    );
  });

  it("refuse aussi l'ouverture en LECTURE seule", () => {
    // Lire l'annuaire, c'est déjà connaître qui peut quoi — et le refus doit
    // porter sur la ressource, pas sur une action choisie au cas par cas.
    const grant: StaffOverride = { resource: "staff_access", action: "read", effect: "allow" };

    expect(() =>
      assertEditAllowed(nonKeeper("commercial"), intent("commercial", { overrides: [grant] })),
    ).toThrow(StaffGrantByOverrideError);
  });

  it("laisse RETIRER l'annuaire à un non-admin — c'est sans danger", () => {
    // Le refus d'un droit qu'on n'a pas ne change rien ; l'interdire ferait
    // échouer un enregistrement pour rien.
    const deny: StaffOverride = { resource: "staff_access", action: "write", effect: "deny" };

    expect(() =>
      assertEditAllowed(nonKeeper("support"), intent("support", { overrides: [deny] })),
    ).not.toThrow();
  });

  it("accepte la racine renommée à la casse près", () => {
    // « Non renommable » veut dire « pas une autre adresse », pas « pas une
    // autre graphie » : les clés e-mail sont normalisées partout ailleurs.
    const root = admin({ isRoot: true, email: "racine@lafoliedouce.com" });

    expect(() =>
      assertEditAllowed(root, intent("admin", { email: "  Racine@LaFolieDouce.com " })),
    ).not.toThrow();
  });

  it("ne se laisse pas désarmer par une dérogation vide", () => {
    expect(() => assertEditAllowed(admin(), intent("admin", { overrides: [] }))).not.toThrow();
  });

  it("compte la suspension comme une perte d'accès, l'invitation non", () => {
    const alone = admin({ otherDirectoryKeepers: 0 });

    expect(() => assertStatusChangeAllowed(alone, "suspended")).toThrow(LastStaffAdminError);
    expect(() => assertStatusChangeAllowed(alone, "pending")).not.toThrow();
  });
});

describe("les invariants tiennent sur le DROIT, plus sur la chaîne « admin »", () => {
  /**
   * Plan `plan-roles-lus-en-base.md` §3.3 : `admin` s'édite désormais. Un rôle
   * créé à l'écran qui porte `staff_access:write` est un recours comme un autre,
   * et un `admin` qu'on aurait vidé de ce droit n'en est plus un.
   */
  const keeperRole: RoleGrants = { staff_access: "write", b2b_orders: "read" };
  const plainRole: RoleGrants = { b2b_orders: "read" };

  it("refuse de retirer l'annuaire au dernier qui le tient par un rôle créé à l'écran", () => {
    const alone = admin({ roleKey: "gardien", otherDirectoryKeepers: 0 });

    expect(() => assertEditAllowed(alone, intentFor("lecteur", plainRole))).toThrow(
      LastStaffAdminError,
    );
  });

  it("laisse changer de rôle quand le nouveau tient encore l'annuaire", () => {
    const alone = admin({ otherDirectoryKeepers: 0 });

    expect(() => assertEditAllowed(alone, intentFor("gardien", keeperRole))).not.toThrow();
  });

  it("refuse qu'on se retire l'annuaire à soi-même par sa fiche, quel que soit le rôle", () => {
    const me = admin({ roleKey: "gardien", isSelf: true });

    expect(() => assertEditAllowed(me, intentFor("lecteur", plainRole))).toThrow(SelfDemotionError);
  });

  it("ne protège pas un « admin » dont la définition n'ouvre plus l'annuaire", () => {
    // Il n'y a rien à perdre : ce n'est plus un recours.
    const target = admin({ keepsDirectory: false, otherDirectoryKeepers: 0 });

    expect(() => assertEditAllowed(target, intentFor("lecteur", plainRole))).not.toThrow();
  });

  it("refuse un écart qui ferme l'annuaire que le rôle créé à l'écran ouvre", () => {
    const deny: StaffOverride = { resource: "staff_access", action: "write", effect: "deny" };

    expect(() =>
      assertEditAllowed(admin(), intentFor("gardien", keeperRole, { overrides: [deny] })),
    ).toThrow(AdminOverrideRefusedError);
  });

  it("garde la racine sur son rôle, même un rôle créé à l'écran", () => {
    const root = admin({ isRoot: true, roleKey: "gardien", email: "racine@lafoliedouce.com" });

    expect(() =>
      assertEditAllowed(
        root,
        intentFor("admin", ROLE_GRANTS.admin, { email: "racine@lafoliedouce.com" }),
      ),
    ).toThrow(ProtectedStaffUserError);
  });
});

describe("la fiche de secours — ses écarts ne bougent pas", () => {
  /**
   * `superadmin` ignore les écarts : en écrire un sur la fiche de secours
   * créerait l'illusion d'une restriction. Le rôle et l'adresse étaient déjà
   * gardés ; les écarts ne l'étaient pas (2026-09-26).
   */
  const kept: StaffOverride = { resource: "b2b_growth", action: "read", effect: "deny" };
  const root = admin({
    isRoot: true,
    email: "racine@lafoliedouce.com",
    currentOverrides: [kept],
  });

  it("refuse d'en ajouter, d'en retirer ou d'en changer", () => {
    const email = "racine@lafoliedouce.com";
    expect(() => assertEditAllowed(root, intent("admin", { email, overrides: [] }))).toThrow(
      RescueOverridesLockedError,
    );
    expect(() =>
      assertEditAllowed(
        root,
        intent("admin", { email, overrides: [{ ...kept, effect: "allow" }] }),
      ),
    ).toThrow(RescueOverridesLockedError);
  });

  it("laisse passer les mêmes écarts, dans n'importe quel ordre", () => {
    expect(() =>
      assertEditAllowed(
        root,
        intent("admin", { email: "racine@lafoliedouce.com", overrides: [{ ...kept }] }),
      ),
    ).not.toThrow();
  });
});
