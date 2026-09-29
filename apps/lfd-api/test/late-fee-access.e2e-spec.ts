/**
 * E2E du droit **`b2b_late_fee`** — la surtaxe de retard sortie de `b2b_settings`
 * (Hugo, 2026-09-29 : « fais un droit late_fee:read write alors, c'est très
 * spécifique ça »).
 *
 * Ce que seul l'e2e prouve : la garde lit le droit dans la table des rôles, en
 * base. Le commercial, qui lit toujours `b2b_settings`, perd l'écran en lecture
 * ET en écriture ; la comptabilité, qui n'avait que `b2b_settings:read`, le
 * règle désormais.
 *
 * Le jeton porteur EST le `sub` : chaque rôle est une vraie fiche en base.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const LATE_FEE = "/admin/order-late-fee";
const FEE = { fee: { mode: "amount", cents: 500 }, vatRatePercent: 20 } as const;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Sème une personne de ce rôle, déjà entrée, et rend son agent HTTP. */
async function asRole(
  role: "commercial" | "comptabilite",
): Promise<ReturnType<E2eContext["asSub"]>> {
  const sub = `staff-${role}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: role,
      email: `${role}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

describe("le droit `b2b_late_fee`", () => {
  it("🔴 refuse la lecture au commercial, qui lit pourtant `b2b_settings`", async () => {
    const commercial = await asRole("commercial");

    expect((await commercial.get(LATE_FEE)).status).toBe(403);
  });

  it("refuse au commercial régler et retirer la surtaxe, sans rien écrire", async () => {
    const commercial = await asRole("commercial");

    expect((await commercial.put(LATE_FEE).send(FEE)).status).toBe(403);
    expect((await commercial.delete(LATE_FEE)).status).toBe(403);
    expect(await ctx.prisma.orderLateFee.count()).toBe(0);
  });

  it("laisse la comptabilité régler, relire et retirer la surtaxe", async () => {
    const accounting = await asRole("comptabilite");

    await accounting.put(LATE_FEE).send(FEE).expect(204);
    const read = await accounting.get(LATE_FEE).expect(200);
    expect(read.body).toEqual({ fee: FEE.fee, vatRatePercent: 20 });

    await accounting.delete(LATE_FEE).expect(204);
    expect(await ctx.prisma.orderLateFee.count()).toBe(0);
  });

  /**
   * Hugo, 2026-09-29 : « oui ajoute la trace au journal ». Elle existait déjà
   * (`order_late_fee.set` / `.cleared`, 2026-09-19) ; ce qui est neuf, c'est
   * qu'un autre rôle que l'administrateur peut l'écrire — l'acteur doit être
   * LUI, relu du contexte de requête, pas un auteur par défaut.
   */
  it("journalise la pose et le retrait au nom de la comptable", async () => {
    const accounting = await asRole("comptabilite");
    const { id } = await ctx.prisma.staffUser.findUniqueOrThrow({
      where: { email: "comptabilite@lfc.test" },
      select: { id: true },
    });

    await accounting.put(LATE_FEE).send(FEE).expect(204);
    await accounting.delete(LATE_FEE).expect(204);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "order_late_fee." } },
      orderBy: { id: "asc" },
      select: { type: true, actorType: true, actorId: true },
    });
    expect(facts).toEqual([
      { type: "order_late_fee.set", actorType: "staff", actorId: id },
      { type: "order_late_fee.cleared", actorType: "staff", actorId: id },
    ]);
  });
});
