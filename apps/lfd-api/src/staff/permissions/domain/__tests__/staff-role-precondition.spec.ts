import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { StaffRoleChangedSinceReadError } from "../staff-role-errors.js";
import { StaffRoleDefinition } from "../staff-role-definition.js";
import { roleUpdatedFact } from "../staff-role-facts.js";

/** La précondition des outils agent, et leur trace (plan `plan-outils-agent-droits.md`). */

function fournil(): StaffRoleDefinition {
  return StaffRoleDefinition.define({
    key: "fournil",
    label: "Fournil",
    grants: [{ resource: "b2b_orders", action: "write" }],
  });
}

describe("StaffRoleDefinition — précondition", () => {
  it("se tait quand les droits lus sont ceux du rôle, quel que soit leur ordre", () => {
    expect(() =>
      fournil().assertUnchangedSince(["b2b_orders:write", "b2b_orders:read"]),
    ).not.toThrow();
  });

  it("refuse un droit en moins, en plus, ou une lecture vide", () => {
    const role = fournil();
    for (const expected of [
      ["b2b_orders:read"],
      ["b2b_orders:read", "b2b_orders:write", "b2b_alerts:read"],
      [],
    ]) {
      expect(() => role.assertUnchangedSince(expected)).toThrow(StaffRoleChangedSinceReadError);
    }
  });
});

describe("roleUpdatedFact — la trace d'un outil agent", () => {
  const before = fournil().toPersistence();
  const after = {
    ...before,
    grants: [...before.grants, { resource: "b2b_alerts", action: "read" } as const],
  };

  it("porte `via` et reste conforme au catalogue", () => {
    const fact = roleUpdatedFact(before, after, "role_grant");
    expect(fact?.payload).toMatchObject({ via: { agentTool: "role_grant" } });
    expect(fact === null ? "absent" : checkJournalFact(fact.type, fact.payload)).toBeNull();
  });

  it("n'en porte pas sans outil", () => {
    expect(roleUpdatedFact(before, after)?.payload).not.toHaveProperty("via");
  });
});
