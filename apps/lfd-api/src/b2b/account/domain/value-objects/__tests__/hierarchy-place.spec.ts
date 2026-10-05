import {
  AlreadySubAccountError,
  CompanyCannotParentItselfError,
  CompanyHasSubAccountsError,
  GroupAccountCannotBeSubAccountError,
  NotASubAccountError,
  ParentIsSubAccountError,
} from "../../errors/hierarchy-errors.js";
import { HierarchyPlace } from "../hierarchy-place.js";

/**
 * La place d'une société dans la hiérarchie (plan-sous-comptes §5) : la
 * profondeur 1 et l'absence de cycle sont des règles de CE value object.
 */
const principal = (): HierarchyPlace => HierarchyPlace.standalone();
const subAccountOf = (parentId: string): HierarchyPlace =>
  HierarchyPlace.reconstitute({
    parentCompanyId: parentId,
    hasSubAccounts: false,
    groupWithoutDelivery: false,
  });
const withChildren = (): HierarchyPlace =>
  HierarchyPlace.reconstitute({
    parentCompanyId: null,
    hasSubAccounts: true,
    groupWithoutDelivery: false,
  });

describe("HierarchyPlace", () => {
  it("rattache une société seule à un principal", () => {
    const place = principal().attachTo("chalet", "groupe", principal());

    expect(place.parentCompanyId).toBe("groupe");
    expect(place.isSubAccount).toBe(true);
  });

  it("refuse qu'un compte soit son propre principal", () => {
    expect(() => principal().attachTo("groupe", "groupe", principal())).toThrow(
      CompanyCannotParentItselfError,
    );
  });

  it("refuse un principal qui est lui-même un sous-compte (profondeur 2)", () => {
    expect(() => principal().attachTo("a", "b", subAccountOf("c"))).toThrow(
      ParentIsSubAccountError,
    );
  });

  it("refuse le cycle A→B quand B est déjà sous A", () => {
    // B→A est posé ; A→B ferait un cycle — c'est la même règle de profondeur.
    expect(() => withChildren().attachTo("a", "b", subAccountOf("a"))).toThrow(
      ParentIsSubAccountError,
    );
  });

  it("refuse de faire sous-compte un compte qui a des sous-comptes", () => {
    expect(() => withChildren().attachTo("a", "b", principal())).toThrow(
      CompanyHasSubAccountsError,
    );
  });

  it("refuse de rattacher ailleurs un sous-compte déjà rattaché", () => {
    expect(() => subAccountOf("b").attachTo("a", "c", principal())).toThrow(AlreadySubAccountError);
  });

  it("rattacher au même principal ne change rien", () => {
    const place = subAccountOf("b");

    expect(place.attachTo("a", "b", principal())).toBe(place);
  });

  it("refuse de rattacher un compte de groupe sans livraison", () => {
    const group = principal().markGroupWithoutDelivery("a", true);

    expect(() => group.attachTo("a", "b", principal())).toThrow(
      GroupAccountCannotBeSubAccountError,
    );
  });

  it("refuse de cocher « compte de groupe » sur un sous-compte, mais laisse décocher", () => {
    expect(() => subAccountOf("b").markGroupWithoutDelivery("a", true)).toThrow(
      GroupAccountCannotBeSubAccountError,
    );
    expect(subAccountOf("b").markGroupWithoutDelivery("a", false).groupWithoutDelivery).toBe(false);
  });

  it("détache un sous-compte, et refuse de détacher ce qui ne l'est pas", () => {
    expect(subAccountOf("b").detach("a").parentCompanyId).toBeNull();
    expect(() => principal().detach("a")).toThrow(NotASubAccountError);
  });
});
