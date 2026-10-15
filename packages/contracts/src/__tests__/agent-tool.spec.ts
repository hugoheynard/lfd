import { agentToolOf } from "../agent-tool.js";

describe("agentToolOf", () => {
  it("rend le nom d'un outil", () => {
    expect(agentToolOf("role_grant")).toBe("role_grant");
    expect(agentToolOf("  staff_assign_role ")).toBe("staff_assign_role");
  });

  it("ignore un en-tête absent, répété ou hors forme", () => {
    expect(agentToolOf(undefined)).toBeNull();
    expect(agentToolOf(["role_grant", "role_revoke"])).toBeNull();
    expect(agentToolOf("")).toBeNull();
    expect(agentToolOf("Role Grant; DROP")).toBeNull();
    expect(agentToolOf("a".repeat(65))).toBeNull();
  });
});
