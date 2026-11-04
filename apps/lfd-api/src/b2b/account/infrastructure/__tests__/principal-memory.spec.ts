import { PrincipalMemory, storedPart, type StoredPrincipal } from "../principal-memory.js";

const kept = (userId: string): StoredPrincipal => ({
  userId,
  email: "jean@client.fr",
  emailProven: true,
  memberships: [],
  reachableCompanyIds: [],
});

describe("PrincipalMemory", () => {
  it("rend ce qui est rangé sous la même estampille, rien sous une autre", () => {
    const memory = new PrincipalMemory(10, 1_000);
    memory.keep("a", 3n, 0, kept("u_a"));
    expect(memory.take("a", 3n, 0)?.userId).toBe("u_a");
    expect(memory.take("a", 4n, 0)).toBeNull();
  });

  it("une lecture plus ancienne n'écrase pas une plus récente", () => {
    const memory = new PrincipalMemory(10, 1_000);
    memory.keep("a", 5n, 0, kept("recent"));
    memory.keep("a", 4n, 0, kept("ancien"));
    expect(memory.take("a", 5n, 0)?.userId).toBe("recent");
  });

  it("sort la moins récemment lue au-delà de la borne", () => {
    const memory = new PrincipalMemory(2, 1_000);
    memory.keep("a", 1n, 0, kept("u_a"));
    memory.keep("b", 1n, 0, kept("u_b"));
    memory.take("a", 1n, 0);
    memory.keep("c", 1n, 0, kept("u_c"));
    expect(memory.size).toBe(2);
    expect(memory.take("b", 1n, 0)).toBeNull();
    expect(memory.take("a", 1n, 0)?.userId).toBe("u_a");
  });

  it("oublie passé le filet de durée", () => {
    const memory = new PrincipalMemory(10, 1_000);
    memory.keep("a", 1n, 0, kept("u_a"));
    expect(memory.take("a", 1n, 1_000)).toBeNull();
  });

  it("fige la part gardée en profondeur", () => {
    const stored = storedPart({
      subject: "s",
      userId: "u",
      email: "e",
      emailProven: false,
      memberships: [{ companyId: "c", role: "orders" }],
      reachableCompanyIds: ["site"],
      scopes: [],
    });
    expect(Object.isFrozen(stored.memberships[0])).toBe(true);
    expect(Object.isFrozen(stored.reachableCompanyIds)).toBe(true);
    expect("subject" in stored).toBe(false);
  });
});
