/**
 * E2E de **la sonde du calcul des prix** sur la carte OPS
 * (`documentation/ops/sonde-calcul-des-prix.md`).
 *
 * Ce que seul ce niveau prouve : que la route est murée comme le reste d'OPS,
 * et qu'une mesure écrite par le commerce (la vitrine, à la porte du prix)
 * traverse `platform/metrics` jusqu'à la carte — sans qu'`ops` importe le
 * commerce, ni l'inverse. Les deux ports doivent viser la MÊME mémoire.
 */
import type { PricingProbeReport, PricingProbeRow } from "@lfd/ops-contract";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const ROUTE = "/admin/ops/health/pricing";

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

async function read(): Promise<PricingProbeReport> {
  const response = await ctx.http().get(ROUTE).set("Authorization", "Bearer staff");
  expect(response.status).toBe(200);
  return jsonBody<PricingProbeReport>(response);
}

/** La ligne du rayon public — la mémoire survit au `reset`, d'où une lecture avant/après. */
function shelfLots(report: PricingProbeReport): number {
  const row: PricingProbeRow | undefined = report.rows.find(
    (one) => one.caller === "shelf" && one.audience === "public",
  );
  return row?.lots ?? 0;
}

describe("la sonde du calcul des prix", () => {
  it("refuse un appel anonyme", async () => {
    const response = await ctx.http().get(ROUTE);

    expect(response.status).toBe(401);
  });

  it("annonce sa fenêtre, son seuil, et qu'elle ne voit que son instance", async () => {
    const report = await read();

    expect(report).toMatchObject({ windowMinutes: 30, p95ThresholdMs: 300, perInstance: true });
  });

  it("compte un lot résolu par la vitrine publique, sans rien de nominatif", async () => {
    const before = shelfLots(await read());

    await ctx.http().get("/shop/catalogue").expect(200);

    const after = await read();
    expect(shelfLots(after)).toBe(before + 1);
    const row = after.rows.find((one) => one.caller === "shelf" && one.audience === "public");
    expect(Object.keys(row ?? {}).sort()).toEqual(
      ["audience", "caller", "lots", "meanItems", "p50Ms", "p95Ms", "state"].sort(),
    );
    expect(row?.meanItems).toBeGreaterThan(0);
  });
});
