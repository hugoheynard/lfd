import {
  planCompanyOpeners,
  staffDeclarationCoverage,
  type CompanyWithoutOpener,
  type DeclarationTrace,
} from "../company-opener-backfill-plan.js";

const company = (id: string, followedByStaffId: string | null = null): CompanyWithoutOpener => ({
  id,
  reference: `C-${id.toUpperCase()}`,
  followedByStaffId,
});

const declared = (companyId: string, over: Partial<DeclarationTrace> = {}): DeclarationTrace => ({
  companyId,
  actorType: "staff",
  actorId: "staff_lou",
  actorName: "Lou Martin",
  ...over,
});

describe("planCompanyOpeners — la reprise de l'auteur, jointe en mémoire", () => {
  it("un fait staff avec acteur donne l'auteur, son nom figé, et le suiveur", () => {
    expect(planCompanyOpeners([company("a")], [declared("a")])).toEqual([
      {
        kind: "fill",
        companyId: "a",
        reference: "C-A",
        declaredByStaffId: "staff_lou",
        declaredByName: "Lou Martin",
        followedByStaffId: "staff_lou",
      },
    ]);
  });

  it("ne remplace jamais un suiveur déjà posé", () => {
    const [line] = planCompanyOpeners([company("a", "staff_ana")], [declared("a")]);
    expect(line).toMatchObject({ kind: "fill", followedByStaffId: null });
  });

  it("un nom absent ou blanc reste inconnu, l'auteur est gardé", () => {
    const [line] = planCompanyOpeners([company("a")], [declared("a", { actorName: "  " })]);
    expect(line).toMatchObject({ kind: "fill", declaredByName: null });
  });

  it("laisse vide, avec sa raison, tout ce qui ne désigne pas un membre de l'équipe", () => {
    const lines = planCompanyOpeners(
      [company("none"), company("self"), company("anon"), company("sub")],
      [
        declared("self", { actorType: "customer", actorId: "user_1" }),
        declared("anon", { actorId: null }),
        declared("sub", { actorId: "auth0|abc" }),
      ],
    );
    expect(lines.map((line) => (line.kind === "skip" ? line.reason : line.kind))).toEqual([
      "no-declaration",
      "not-staff",
      "no-actor",
      "unresolved-sub",
    ]);
  });

  it("ne regarde que les sociétés qu'on lui donne : un fait sans société n'écrit rien", () => {
    expect(planCompanyOpeners([], [declared("orphan")])).toEqual([]);
  });

  it("compte les déclarations staff, et celles qui portent un acteur", () => {
    expect(
      staffDeclarationCoverage([
        declared("a"),
        declared("b", { actorId: null }),
        declared("c", { actorId: " " }),
        declared("d", { actorType: "customer" }),
      ]),
    ).toEqual({ staff: 3, withActor: 1 });
  });
});
