/**
 * E2E des **seuils de la médiathèque** sur la carte OPS.
 *
 * Ce que seul ce niveau prouve : que la route est murée comme le reste d'OPS,
 * et que le compte traverse la racine de composition jusqu'à la vraie table de
 * la médiathèque — sans qu'`ops` la lise.
 */
import type { MediaThresholdsReport } from "@lfd/ops-contract";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MediaStore } from "../src/platform/storage/media-store.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { InMemoryMediaStore } from "./in-memory-media-store.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const ROUTE = "/admin/ops/media";

let ctx: E2eContext;
let width = 1000;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MediaStore, value: new InMemoryMediaStore() },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Un PNG minimal ; une largeur neuve fait une image neuve. */
function png(): Buffer {
  width += 1;
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(600, 20);
  return buffer;
}

async function deposit(): Promise<void> {
  const response = await ctx
    .http()
    .post("/media")
    .set("Authorization", "Bearer staff")
    .attach("file", png(), "image.png");
  expect(response.status).toBe(201);
}

async function read(): Promise<MediaThresholdsReport> {
  const response = await ctx.http().get(ROUTE).set("Authorization", "Bearer staff");
  expect(response.status).toBe(200);
  return jsonBody<MediaThresholdsReport>(response);
}

describe("les seuils de la médiathèque", () => {
  it("refuse un appel anonyme", async () => {
    const response = await ctx.http().get(ROUTE);

    expect(response.status).toBe(401);
  });

  it("rend les trois seuils à zéro sur un fonds vide", async () => {
    const report = await read();

    expect(report.images).toBe(0);
    expect(report.thresholds.map((threshold) => threshold.key)).toEqual([
      "transformations",
      "ranked-sort",
      "palette-strip",
    ]);
    expect(report.thresholds.every((threshold) => threshold.state === "ok")).toBe(true);
  });

  it("compte les images déposées par la vraie route", async () => {
    await deposit();
    await deposit();

    const report = await read();

    expect(report.images).toBe(2);
    expect(
      report.thresholds.find((threshold) => threshold.key === "transformations"),
    ).toMatchObject({ measured: 8, estimated: true, state: "ok" });
  });
});
