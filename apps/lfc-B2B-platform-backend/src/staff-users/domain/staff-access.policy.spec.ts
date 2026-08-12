import type { StaffOverride, StaffRole } from "@lfd/contracts";

import {
  assertEditAllowed,
  assertRemovalAllowed,
  assertStatusChangeAllowed,
  type StaffMutationTarget,
} from "./staff-access.policy.js";
import {
  AdminOverrideRefusedError,
  LastStaffAdminError,
  ProtectedStaffUserError,
  SelfDemotionError,
} from "./staff-user-errors.js";

/** Un administrateur ordinaire, avec un collègue admin derrière lui. */
function admin(overrides: Partial<StaffMutationTarget> = {}): StaffMutationTarget {
  return {
    email: "camille@lafoliedouce.com",
    isRoot: false,
    role: "admin",
    otherLivingAdmins: 1,
    isSelf: false,
    ...overrides,
  };
}

function intent(role: StaffRole, extra: { email?: string; overrides?: StaffOverride[] } = {}) {
  return {
    email: extra.email ?? "camille@lafoliedouce.com",
    role,
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

  it("ne peut être ni supprimé ni suspendu", () => {
    expect(() => assertRemovalAllowed(root)).toThrow(ProtectedStaffUserError);
    expect(() => assertStatusChangeAllowed(root, "suspended")).toThrow(ProtectedStaffUserError);
  });

  it("se laisse éditer sur le reste", () => {
    expect(() =>
      assertEditAllowed(root, intent("admin", { email: "racine@lafoliedouce.com" })),
    ).not.toThrow();
  });
});

describe("le dernier administrateur", () => {
  const alone = admin({ otherLivingAdmins: 0 });

  it("ne peut pas être rétrogradé", () => {
    // L'admin racine protège UNE LIGNE, pas la propriété : sans cette règle, on
    // pouvait rétrograder tous les autres et se retrouver sans recours.
    expect(() => assertEditAllowed(alone, intent("support"))).toThrow(LastStaffAdminError);
  });

  it("ne peut être ni supprimé ni suspendu", () => {
    expect(() => assertRemovalAllowed(alone)).toThrow(LastStaffAdminError);
    expect(() => assertStatusChangeAllowed(alone, "suspended")).toThrow(LastStaffAdminError);
  });

  it("s'efface dès qu'un autre existe", () => {
    expect(() => assertEditAllowed(admin(), intent("support"))).not.toThrow();
    expect(() => assertRemovalAllowed(admin())).not.toThrow();
  });

  it("ne compte pas les suspendus comme un recours", () => {
    // `otherLivingAdmins` compte les non-suspendus : quelqu'un qui n'a jamais
    // ouvert sa session reste un recours (il lui suffit de se connecter), un
    // suspendu non.
    expect(() => assertRemovalAllowed(admin({ otherLivingAdmins: 0 }))).toThrow(
      LastStaffAdminError,
    );
  });
});

describe("l'auto-rétrogradation", () => {
  const me = admin({ isSelf: true });

  it("est refusée même s'il reste d'autres administrateurs", () => {
    // C'est le seul geste qu'on ne peut pas réparer soi-même : il faut alors
    // déranger quelqu'un d'autre.
    expect(() => assertEditAllowed(me, intent("commercial"))).toThrow(SelfDemotionError);
    expect(() => assertRemovalAllowed(me)).toThrow(SelfDemotionError);
    expect(() => assertStatusChangeAllowed(me, "suspended")).toThrow(SelfDemotionError);
  });

  it("n'empêche pas de s'éditer sans changer de rôle", () => {
    expect(() => assertEditAllowed(me, intent("admin"))).not.toThrow();
  });

  it("prime sur le compte des autres administrateurs", () => {
    // Deux causes possibles, un seul message : on dit « c'est vous », pas
    // « il n'en reste plus » — le second enverrait chercher une solution qui
    // n'est pas le problème.
    expect(() => assertRemovalAllowed(admin({ isSelf: true, otherLivingAdmins: 0 }))).toThrow(
      SelfDemotionError,
    );
  });
});

describe("les dérogations d'un administrateur", () => {
  const deny = (): StaffOverride => ({ resource: "staff", action: "write", effect: "deny" });

  it("ne peuvent pas lui couper l'accès à l'annuaire", () => {
    // Sinon le delta contourne « il reste au moins un admin » par la porte de
    // derrière : l'admin est toujours là, mais privé du seul droit qui permet
    // d'en désigner un autre.
    expect(() => assertEditAllowed(admin(), intent("admin", { overrides: [deny()] }))).toThrow(
      AdminOverrideRefusedError,
    );
  });

  it("attrapent aussi le refus de lecture, qui emporte l'écriture", () => {
    const denyRead: StaffOverride = { resource: "staff", action: "read", effect: "deny" };

    expect(() => assertEditAllowed(admin(), intent("admin", { overrides: [denyRead] }))).toThrow(
      AdminOverrideRefusedError,
    );
  });

  it("restent libres sur les autres ressources", () => {
    const denyGrowth: StaffOverride = { resource: "growth", action: "write", effect: "deny" };

    expect(() =>
      assertEditAllowed(admin(), intent("admin", { overrides: [denyGrowth] })),
    ).not.toThrow();
  });

  it("ne concernent pas les autres rôles", () => {
    const target = admin({ role: "commercial" });

    expect(() =>
      assertEditAllowed(target, intent("commercial", { overrides: [deny()] })),
    ).not.toThrow();
  });
});

describe("les mutations sans danger", () => {
  it("laissent passer une promotion", () => {
    const target = admin({ role: "support" });

    expect(() => assertEditAllowed(target, intent("admin"))).not.toThrow();
  });

  it("ne regardent pas les transitions d'état autres que la suspension", () => {
    // Inviter ou constater une entrée ne retire d'accès à personne.
    const alone = admin({ otherLivingAdmins: 0, isSelf: true });

    expect(() => assertStatusChangeAllowed(alone, "invited")).not.toThrow();
    expect(() => assertStatusChangeAllowed(alone, "active")).not.toThrow();
  });
});
