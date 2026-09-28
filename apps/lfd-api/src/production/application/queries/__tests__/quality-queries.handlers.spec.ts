import { QualityCheck, type QualityVerdict } from "../../../domain/entities/quality-check.js";
import { QualityPhotoNotFoundError } from "../../../domain/errors/quality-record-errors.js";
import type { QualityCheckTargetInput } from "../../../domain/value-objects/quality-check-target.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import {
  StaffAuthorDirectory,
  StaffAuthors,
} from "../../../../staff/directory/domain/staff-author-directory.js";
import {
  BAGUETTE,
  CheckTable,
  closedDay,
  CROISSANT,
  FixedDays,
  InMemoryCheckReader,
  InMemoryProductionStore,
  JPEG,
} from "../../__tests__/quality-doubles.js";
import { GetQualityBoardHandler } from "../get-quality-board.handler.js";
import { GetQualityBoardQuery } from "../get-quality-board.query.js";
import { GetQualityPhotoHandler } from "../get-quality-photo.handler.js";
import { GetQualityPhotoQuery } from "../get-quality-photo.query.js";
import { ListQualityChecksHandler } from "../list-quality-checks.handler.js";
import { ListQualityChecksQuery } from "../list-quality-checks.query.js";

const DAY = ServiceDay.of("2026-10-01");
const START = new Date();

/** Aucun auteur connu : la vue garde l'identifiant brut. */
class NoAuthors extends StaffAuthorDirectory {
  identify(): Promise<StaffAuthors> {
    return Promise.resolve(StaffAuthors.none());
  }
}

function render(
  table: CheckTable,
  id: string,
  target: QualityCheckTargetInput,
  verdict: QualityVerdict,
  offsetMs: number,
): void {
  table.rows.set(
    id,
    QualityCheck.render({
      id,
      serviceDay: DAY,
      target,
      verdict,
      note: verdict === "ok" ? null : "Note du superviseur",
      checkedBy: "staff_sup",
      checkedAt: new Date(START.getTime() + offsetMs),
      photos:
        id === "chk_photo"
          ? [
              {
                position: 0,
                storageKey: "quality/x/chk_photo/0",
                uploadId: "up_1",
                contentType: "image/jpeg",
                byteSize: JPEG.length,
              },
            ]
          : [],
    }),
  );
}

describe("GetQualityBoardHandler — les pastilles (D5, D7)", () => {
  it("le verdict courant par cible, la péremption, et les commandes retenues", async () => {
    const table = new CheckTable();
    // Croissants : bloqués sur 12, alors que le compte dit 16 — à revoir, et TOUJOURS bloquants.
    render(table, "chk_1", { kind: "line", sku: CROISSANT, quantitySeen: 12 }, "blocking", 0);
    // Baguettes : une réserve, puis un OK plus récent.
    render(table, "chk_2", { kind: "line", sku: BAGUETTE, quantitySeen: 2 }, "warning", 0);
    render(table, "chk_3", { kind: "line", sku: BAGUETTE, quantitySeen: 2 }, "ok", 1000);
    render(table, "chk_4", { kind: "order", orderId: "ord_1" }, "ok", 0);
    const handler = new GetQualityBoardHandler(
      new FixedDays(closedDay(DAY, START, ["ord_1"])),
      new InMemoryCheckReader(table),
    );

    const view = await handler.execute(new GetQualityBoardQuery(DAY.value));

    expect(view.lines).toEqual([
      expect.objectContaining({ sku: BAGUETTE, verdict: "ok", stale: false }),
      expect.objectContaining({
        sku: CROISSANT,
        verdict: "blocking",
        quantitySeen: 12,
        currentQuantity: 16,
        stale: true,
      }),
    ]);
    expect(view.orders).toEqual([
      expect.objectContaining({ orderId: "ord_1", reference: "ORD-0001", verdict: "ok" }),
    ]);
    expect(view.heldOrderIds).toEqual(["ord_1", "ord_2"]);
    expect(JSON.stringify(view)).not.toContain("Note du superviseur");
  });
});

describe("ListQualityChecksHandler — le détail (D3)", () => {
  it("tous les verdicts, du plus récent au plus ancien, notes et photos comprises", async () => {
    const table = new CheckTable();
    render(table, "chk_1", { kind: "line", sku: CROISSANT, quantitySeen: 16 }, "blocking", 0);
    render(table, "chk_photo", { kind: "line", sku: CROISSANT, quantitySeen: 16 }, "ok", 1000);
    const handler = new ListQualityChecksHandler(new InMemoryCheckReader(table), new NoAuthors());

    const view = await handler.execute(new ListQualityChecksQuery(DAY.value));

    expect(view.checks.map((check) => check.id)).toEqual(["chk_photo", "chk_1"]);
    expect(view.checks[1]).toMatchObject({ note: "Note du superviseur", checkedByName: null });
    expect(view.checks[0]?.photos).toEqual([
      { position: 0, contentType: "image/jpeg", byteSize: JPEG.length },
    ]);
  });
});

describe("GetQualityPhotoHandler", () => {
  it("sert les octets rangés sous la clé de la ligne, avec son type", async () => {
    const table = new CheckTable();
    render(table, "chk_photo", { kind: "order", orderId: "ord_1" }, "ok", 0);
    const store = new InMemoryProductionStore();
    await store.save("quality/x/chk_photo/0", { bytes: JPEG, contentType: "image/jpeg" });
    const handler = new GetQualityPhotoHandler(new InMemoryCheckReader(table), store);

    await expect(handler.execute(new GetQualityPhotoQuery("chk_photo", 0))).resolves.toEqual({
      bytes: JPEG,
      contentType: "image/jpeg",
    });
    await expect(handler.execute(new GetQualityPhotoQuery("chk_photo", 1))).rejects.toThrow(
      QualityPhotoNotFoundError,
    );
  });
});
