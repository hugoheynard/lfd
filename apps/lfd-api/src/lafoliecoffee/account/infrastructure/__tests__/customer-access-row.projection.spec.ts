import { UserStatus } from "../../../../platform/database/client/client.js";
import {
  toCustomerAccessRow,
  type CustomerAccessCompanyRow,
} from "../customer-access-row.projection.js";

const NOW = new Date("2026-08-12T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysBefore = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

type Membership = CustomerAccessCompanyRow["memberships"][number];

function member(
  email: string,
  overrides: Partial<Membership["user"]> = {},
  invitation: Partial<Pick<Membership, "invitedAt" | "acceptedAt">> = {},
): Membership {
  return {
    invitedAt: invitation.invitedAt ?? daysBefore(1),
    acceptedAt: invitation.acceptedAt ?? null,
    user: {
      email,
      status: UserStatus.invited,
      emailVerified: false,
      firstLoginAt: null,
      ...overrides,
    },
  };
}

function company(overrides: Partial<CustomerAccessCompanyRow> = {}): CustomerAccessCompanyRow {
  return {
    id: "c1",
    enseigne: "",
    raisonSociale: "Café SAS",
    contactPrenom: "Camille",
    contactNom: "Durand",
    contactEmail: "camille@test.fr",
    contactTelephone: "06",
    parentCompany: null,
    memberships: [],
    contactsFollowedFrom: [],
    ...overrides,
  };
}

const ACTIVE = { status: UserStatus.active } as const;
const ENTERED = { invitedAt: daysBefore(30), acceptedAt: daysBefore(29) } as const;

describe("toCustomerAccessRow", () => {
  it("dit `no_holder` pour une société ouverte sur sa seule enseigne", () => {
    const row = toCustomerAccessRow(company({ contactEmail: " ", enseigne: "Le Comptoir" }), NOW);

    expect(row).toMatchObject({ holder: null, state: "no_holder", companyName: "Le Comptoir" });
  });

  it("dit `none` pour un détenteur à qui aucun accès n'a été ouvert", () => {
    expect(toCustomerAccessRow(company(), NOW)).toMatchObject({
      state: "none",
      lastInvitedAt: null,
    });
  });

  it("rapproche le détenteur par l'adresse, casse comprise, et rend sa dernière invitation", () => {
    const row = toCustomerAccessRow(company({ memberships: [member("Camille@TEST.fr")] }), NOW);

    expect(row).toMatchObject({ state: "invited", lastInvitedAt: daysBefore(1).toISOString() });
  });

  it("dit `expired` d'une invitation que personne n'a réclamée à temps", () => {
    const row = toCustomerAccessRow(
      company({ memberships: [member("camille@test.fr", {}, { invitedAt: daysBefore(21) })] }),
      NOW,
    );

    expect(row.state).toBe("expired");
  });

  it("rend la date de première connexion du détenteur activé", () => {
    const first = daysBefore(29);
    const row = toCustomerAccessRow(
      company({
        memberships: [member("camille@test.fr", { ...ACTIVE, firstLoginAt: first }, ENTERED)],
      }),
      NOW,
    );

    expect(row).toMatchObject({ state: "active", activatedAt: first.toISOString() });
  });

  it("laisse la date vide pour un compte entré avant qu'on la retienne", () => {
    const row = toCustomerAccessRow(
      company({ memberships: [member("camille@test.fr", ACTIVE, ENTERED)] }),
      NOW,
    );

    expect(row).toMatchObject({ state: "active", activatedAt: null });
  });

  it("distingue `disabled`, que la fiche replie sur `none`", () => {
    const row = toCustomerAccessRow(
      company({
        memberships: [member("camille@test.fr", { status: UserStatus.disabled }, ENTERED)],
      }),
      NOW,
    );

    expect(row.state).toBe("disabled");
  });

  it("compte les autres membres, détenteur exclu, et ceux qui sont entrés", () => {
    const row = toCustomerAccessRow(
      company({
        memberships: [
          member("camille@test.fr", ACTIVE, ENTERED),
          member("achats@test.fr", ACTIVE, ENTERED),
          member("compta@test.fr"),
        ],
      }),
      NOW,
    );

    expect(row).toMatchObject({ otherMembers: 2, otherMembersActive: 1 });
  });

  it("nomme le principal d'un sous-compte par son nom d'usage", () => {
    const row = toCustomerAccessRow(
      company({
        parentCompany: {
          ...company({ id: "p1", raisonSociale: "Groupe SAS" }),
          enseigne: "",
        },
      }),
      NOW,
    );

    expect(row.parent).toEqual({ companyId: "p1", companyName: "Groupe SAS" });
  });

  describe("un sous-compte", () => {
    const parent = {
      id: "p1",
      enseigne: "HIP HIDEOUTS",
      raisonSociale: "Hip SAS",
      contactPrenom: "Paul",
      contactNom: "Martin",
      contactEmail: "paul@hip.fr",
      contactTelephone: "07",
      memberships: [member("Paul@hip.fr", { ...ACTIVE, firstLoginAt: daysBefore(29) }, ENTERED)],
    };

    /**
     * Régression (2026-10-23) : « HIP HIDEOUTS CHALET RIVE GAUCHE » apparaissait
     * sans détenteur alors que son principal en a un.
     */
    it("un sous-compte sans détenteur propre montre celui du principal", () => {
      const row = toCustomerAccessRow(
        company({ contactEmail: "", parentCompany: parent, memberships: [member("x@hip.fr")] }),
        NOW,
      );

      expect(row).toMatchObject({
        holder: { firstName: "Paul", email: "paul@hip.fr" },
        holderInheritedFrom: { companyId: "p1", companyName: "HIP HIDEOUTS" },
        state: "active",
        activatedAt: daysBefore(29).toISOString(),
        otherMembers: 1,
      });
    });

    it("qui suit les contacts montre le détenteur du principal, même avec le sien", () => {
      const row = toCustomerAccessRow(
        company({ parentCompany: parent, contactsFollowedFrom: ["p1"] }),
        NOW,
      );

      expect(row).toMatchObject({
        holder: { email: "paul@hip.fr" },
        holderInheritedFrom: { companyId: "p1" },
        state: "active",
      });
    });

    it("avec son propre détenteur et sans suivi garde le sien", () => {
      const row = toCustomerAccessRow(company({ parentCompany: parent }), NOW);

      expect(row).toMatchObject({
        holder: { email: "camille@test.fr" },
        holderInheritedFrom: null,
        state: "none",
      });
    });

    it("dit `no_holder` si ni lui ni son principal n'ont de détenteur", () => {
      const row = toCustomerAccessRow(
        company({ contactEmail: "", parentCompany: { ...parent, contactEmail: "" } }),
        NOW,
      );

      expect(row).toMatchObject({ holder: null, state: "no_holder" });
    });
  });
});
