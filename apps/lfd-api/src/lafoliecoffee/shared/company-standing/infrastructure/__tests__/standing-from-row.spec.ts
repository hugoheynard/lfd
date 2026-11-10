import { type StandingRow, standingFromRow } from "../read-company-standing.js";

const PRINCIPAL = {
  id: "co_principal",
  status: "active",
  enseigne: "Hip Hideouts",
  raisonSociale: "HIP SAS",
  memberships: [{ role: "owner" }],
} as const satisfies NonNullable<StandingRow["parentCompany"]>;

/** Un site actif, sans membership propre, sous un principal actif dont on est détenteur. */
function row(over: Partial<StandingRow> = {}): StandingRow {
  return { status: "active", memberships: [], parentCompany: PRINCIPAL, ...over };
}

describe("standingFromRow — la règle de R1 sur la ligne lue", () => {
  it("l'héritier entre : le principal, son nom, son rôle", () => {
    expect(standingFromRow(row())).toEqual({
      companyStatus: "active",
      own: null,
      ownAccepted: false,
      via: { companyId: "co_principal", name: "Hip Hideouts", role: "owner" },
    });
  });

  it("ni propre ni héritée : aucune place", () => {
    expect(standingFromRow(row({ parentCompany: null }))).toBeNull();
    expect(standingFromRow(row({ parentCompany: { ...PRINCIPAL, memberships: [] } }))).toBeNull();
  });

  it.each(["pending", "suspended", "terminated"] as const)(
    "principal %s : plus rien par héritage",
    (status) => {
      expect(standingFromRow(row({ parentCompany: { ...PRINCIPAL, status } }))).toBeNull();
    },
  );

  it("🔴 site suspendu : l'héritage se ferme, la membership propre reste", () => {
    expect(standingFromRow(row({ status: "suspended" }))).toBeNull();
    expect(
      standingFromRow(
        row({ status: "suspended", memberships: [{ role: "orders", acceptedAt: new Date(0) }] }),
      ),
    ).toEqual({ companyStatus: "suspended", own: "orders", ownAccepted: true, via: null });
  });

  it("🔴 un `orders` du principal mal filtré n'ouvre rien", () => {
    const parent = { ...PRINCIPAL, memberships: [{ role: "orders" }] } as const;
    expect(standingFromRow(row({ parentCompany: parent }))).toBeNull();
  });

  it("propre et héritée : les deux, sans arbitrer ici", () => {
    expect(
      standingFromRow(row({ memberships: [{ role: "billing", acceptedAt: null }] })),
    ).toMatchObject({ own: "billing", ownAccepted: false, via: { role: "owner" } });
  });

  it("le nom du principal retombe sur la raison sociale sans enseigne", () => {
    const parent = { ...PRINCIPAL, enseigne: "" };
    expect(standingFromRow(row({ parentCompany: parent }))?.via?.name).toBe("HIP SAS");
  });
});
