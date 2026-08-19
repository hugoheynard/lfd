import { Test } from "@nestjs/testing";

import { PimPrismaService } from "../../../../infra/database/pim-prisma.service.js";
import type { ShopifyProductPayload } from "../projection.js";
import { ShopifySnapshotService, SnapshotNotFoundError } from "../snapshot.service.js";

interface Row {
  id: string;
  handle: string;
  productId: string;
  version: number;
  hash: string;
  payload: unknown;
  mode: "live" | "dry_run";
  outcome: "pushed" | "failed";
  pushedAt: Date;
}

/** Fake `shopifyPushSnapshot` avec état — teste la version monotone et la lecture. */
function fakePrisma(): {
  prisma: { shopifyPushSnapshot: unknown };
  rows: Row[];
} {
  const rows: Row[] = [];
  let seq = 0;
  const table = {
    create: ({ data }: { data: Omit<Row, "id" | "pushedAt"> }) => {
      seq += 1;
      const row: Row = { id: `snap_${seq}`, pushedAt: new Date(0), ...data };
      rows.push(row);
      return Promise.resolve({ id: row.id });
    },
    findFirst: ({ where }: { where: { handle: string } }) => {
      const forHandle = rows
        .filter((r) => r.handle === where.handle)
        .sort((a, b) => b.version - a.version);
      return Promise.resolve(forHandle[0] ?? null);
    },
    findMany: ({ where }: { where: { handle: string } }) =>
      Promise.resolve(
        rows.filter((r) => r.handle === where.handle).sort((a, b) => b.version - a.version),
      ),
    findUnique: ({ where }: { where: { handle_version: { handle: string; version: number } } }) => {
      const { handle, version } = where.handle_version;
      return Promise.resolve(
        rows.find((r) => r.handle === handle && r.version === version) ?? null,
      );
    },
  };
  return { prisma: { shopifyPushSnapshot: table }, rows };
}

const PAYLOAD: ShopifyProductPayload = {
  title: "Croissant",
  handle: "croissant",
  status: "DRAFT",
  variants: [{ sku: "PATI-CROISSANT", title: "Nature", options: {}, price: "1.30" }],
};

async function build(prisma: unknown): Promise<ShopifySnapshotService> {
  const moduleRef = await Test.createTestingModule({
    providers: [ShopifySnapshotService, { provide: PimPrismaService, useValue: prisma }],
  }).compile();
  return moduleRef.get(ShopifySnapshotService);
}

function input(handle: string): Parameters<ShopifySnapshotService["record"]>[0] {
  return {
    handle,
    productId: "p1",
    hash: "h",
    payload: { ...PAYLOAD, handle },
    mode: "live",
    outcome: "pushed",
  };
}

describe("ShopifySnapshotService", () => {
  it("numérote les versions de façon monotone par handle", async () => {
    const { prisma, rows } = fakePrisma();
    const snap = await build(prisma);

    await snap.record(input("croissant"));
    await snap.record(input("croissant"));
    await snap.record(input("pain"));

    const croissant = rows.filter((r) => r.handle === "croissant");
    expect(croissant.map((r) => r.version)).toEqual([1, 2]);
    expect(rows.find((r) => r.handle === "pain")?.version).toBe(1);
  });

  it("rend l’historique, version la plus récente d’abord", async () => {
    const { prisma } = fakePrisma();
    const snap = await build(prisma);
    await snap.record(input("croissant"));
    await snap.record(input("croissant"));

    const history = await snap.history("croissant");

    expect(history.map((h) => h.version)).toEqual([2, 1]);
    expect(history[0]?.mode).toBe("live");
    expect(history[0]?.outcome).toBe("pushed");
  });

  it("charge une version précise avec son payload vérifié", async () => {
    const { prisma } = fakePrisma();
    const snap = await build(prisma);
    await snap.record(input("croissant"));

    const loaded = await snap.load("croissant", 1);

    expect(loaded.version).toBe(1);
    expect(loaded.productId).toBe("p1");
    expect(loaded.payload.handle).toBe("croissant");
    expect(loaded.payload.variants[0]?.price).toBe("1.30");
  });

  it("lève SnapshotNotFoundError sur une version absente", async () => {
    const { prisma } = fakePrisma();
    const snap = await build(prisma);
    await expect(snap.load("croissant", 99)).rejects.toBeInstanceOf(SnapshotNotFoundError);
  });
});
