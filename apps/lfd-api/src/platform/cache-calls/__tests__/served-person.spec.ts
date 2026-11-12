import { runWithRequestContext, attachActor } from "../../context/request-context.store.js";
import { personStampedFetch, SERVED_PERSON_HEADER, servedPersonOf } from "../served-person.js";

/**
 * L'empreinte de la personne servie. Ces tests échouent si l'identifiant
 * part en clair, si deux personnes partagent une empreinte, ou si un appel
 * sans personne (cron, visiteur) en porte une.
 */
const SEED = { now: new Date(0), traceId: "t" };

function within<T>(
  actor: { type: "staff" | "customer" | "system"; id: string | null } | null,
  fn: () => T,
): T {
  return runWithRequestContext(SEED, () => {
    if (actor !== null) {
      attachActor(actor);
    }
    return fn();
  });
}

describe("servedPersonOf", () => {
  it("rend une empreinte sha256 qui ne contient pas l'identifiant", () => {
    const person = within({ type: "staff", id: "staff_01" }, () => servedPersonOf("sel"));

    expect(person).toMatch(/^[0-9a-f]{64}$/u);
    expect(person).not.toContain("staff_01");
  });

  it("distingue deux personnes, et le type de compte", () => {
    const staff = within({ type: "staff", id: "u1" }, () => servedPersonOf("sel"));
    const customer = within({ type: "customer", id: "u1" }, () => servedPersonOf("sel"));
    const other = within({ type: "staff", id: "u2" }, () => servedPersonOf("sel"));

    expect(new Set([staff, customer, other]).size).toBe(3);
  });

  it("ne rend rien sans sel, hors requête, ni pour un appel système", () => {
    expect(within({ type: "staff", id: "u1" }, () => servedPersonOf(null))).toBeNull();
    expect(servedPersonOf("sel")).toBeNull();
    expect(within(null, () => servedPersonOf("sel"))).toBeNull();
    expect(
      within({ type: "system", id: "recompute-cron" }, () => servedPersonOf("sel")),
    ).toBeNull();
  });
});

describe("personStampedFetch", () => {
  it("joint l'en-tête quand il y a une personne, et laisse l'appel intact sinon", async () => {
    const seen: (string | null)[] = [];
    const fetchFn = personStampedFetch("sel", (_url, init) => {
      seen.push(new Headers(init.headers).get(SERVED_PERSON_HEADER));
      return Promise.resolve(new Response(null, { status: 204 }));
    });

    await within({ type: "customer", id: "c1" }, () => fetchFn("http://x", { method: "GET" }));
    await within(null, () => fetchFn("http://x", { method: "GET" }));

    expect(seen[0]).toMatch(/^[0-9a-f]{64}$/u);
    expect(seen[1]).toBeNull();
  });
});
