import { DuplicateLinkableSubjectError } from "../../../link/domain/errors/pay-link-errors.js";
import { ScriptedLinkable } from "../../../link/application/__tests__/pay-link-doubles.js";
import { RegisteredLinkableSubjects } from "../linkable-subjects.js";

describe("RegisteredLinkableSubjects", () => {
  it("rend l'implémenteur de son type, et null pour un type que personne ne sert", () => {
    const freeCharge = new ScriptedLinkable("free_charge");
    const registry = new RegisteredLinkableSubjects([freeCharge]);
    expect(registry.forType("free_charge")).toBe(freeCharge);
    expect(registry.forType("order")).toBeNull();
  });

  it("refuse deux implémenteurs pour un même type", () => {
    expect(
      () =>
        new RegisteredLinkableSubjects([
          new ScriptedLinkable("invoice"),
          new ScriptedLinkable("invoice"),
        ]),
    ).toThrow(DuplicateLinkableSubjectError);
  });
});
