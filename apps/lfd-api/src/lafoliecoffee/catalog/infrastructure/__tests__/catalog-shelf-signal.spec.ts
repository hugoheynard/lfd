import { Test } from "@nestjs/testing";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { RecordingShelfChanges } from "../../../shared/shelf-changes/domain/__tests__/recording-shelf-changes.js";
import { ShelfChanges } from "../../../shared/shelf-changes/domain/ports/shelf-changes.js";
import { ALL_SHELVES } from "../../../shared/shelf-changes/domain/shelf-change-scope.js";
import { PrismaCatalogReservations } from "../prisma-catalog-reservations.js";
import { PrismaCatalogVisualsProjection } from "../prisma-catalog-visuals.projection.js";

/**
 * Les écrivains du catalogue émettent le signal des rayons
 * (`le-rayon-en-cache.md`, C1) : un article ou une réservation change le
 * rayon de TOUS — une réservation retire l'article à tous sauf une société,
 * public compris.
 */
async function withPrisma<T>(
  type: new (...args: never[]) => T,
  prisma: object,
): Promise<{ readonly writer: T; readonly shelves: RecordingShelfChanges }> {
  const shelves = new RecordingShelfChanges();
  const moduleRef = await Test.createTestingModule({
    providers: [
      type,
      { provide: PrismaService, useValue: prisma },
      { provide: ShelfChanges, useValue: shelves },
    ],
  }).compile();
  return { writer: moduleRef.get(type), shelves };
}

const RESERVATION = {
  sku: "VIE-001-U",
  companyId: "co_a",
  reservedAt: new Date(0),
  reservedBy: "staff_1",
};

const counted = (count: number) => () => Promise.resolve({ count });

describe("Catalogue — le signal des rayons", () => {
  it("une réservation posée efface tous les rayons", async () => {
    const { writer, shelves } = await withPrisma(PrismaCatalogReservations, {
      catalogItemReservation: { createMany: counted(1) },
    });
    await writer.reserve(RESERVATION);
    expect(shelves.scopes).toEqual([ALL_SHELVES]);
  });

  it("une réservation déjà posée ne change rien, et n'efface rien", async () => {
    const { writer, shelves } = await withPrisma(PrismaCatalogReservations, {
      catalogItemReservation: { createMany: counted(0) },
    });
    await writer.reserve(RESERVATION);
    expect(shelves.scopes).toEqual([]);
  });

  it("une réservation levée efface tous les rayons", async () => {
    const { writer, shelves } = await withPrisma(PrismaCatalogReservations, {
      catalogItemReservation: { deleteMany: counted(1) },
    });
    await writer.release("VIE-001-U", "co_a");
    expect(shelves.scopes).toEqual([ALL_SHELVES]);
  });

  it("un visuel d'article reçu efface tous les rayons", async () => {
    const { writer, shelves } = await withPrisma(PrismaCatalogVisualsProjection, {
      catalogItem: { updateMany: counted(2) },
    });
    await writer.showIfNewer("p_1", "g_2", null, null);
    expect(shelves.scopes).toEqual([ALL_SHELVES]);
  });
});
