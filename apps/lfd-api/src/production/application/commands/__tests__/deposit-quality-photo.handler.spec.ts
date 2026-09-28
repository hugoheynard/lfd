import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { InvalidQualityPhotoError } from "../../../domain/errors/quality-record-errors.js";
import {
  CheckTable,
  InMemoryProductionStore,
  InMemoryUploads,
  JPEG,
} from "../../__tests__/quality-doubles.js";
import { DepositQualityPhotoCommand } from "../deposit-quality-photo.command.js";
import { DepositQualityPhotoHandler } from "../deposit-quality-photo.handler.js";

function subject() {
  const clock = new FixedClock(new Date());
  const uploads = new InMemoryUploads(new CheckTable());
  const store = new InMemoryProductionStore();
  const handler = new DepositQualityPhotoHandler(uploads, store, new FixedIdGenerator("up"), clock);
  return { clock, uploads, store, handler };
}

describe("DepositQualityPhotoHandler", () => {
  it("range la photo sous quality/pending/<id>, avec son type relu dans les octets", async () => {
    const { handler, uploads, store, clock } = subject();
    const id = await handler.execute(new DepositQualityPhotoCommand(JPEG, "staff_sup"));

    expect(store.objects.get(`quality/pending/${id}`)).toEqual({
      bytes: JPEG,
      contentType: "image/jpeg",
    });
    expect(uploads.rows.get(id)).toMatchObject({
      uploadedBy: "staff_sup",
      uploadedAt: clock.now(),
      byteSize: JPEG.length,
      releasedAt: null,
    });
  });

  it("refuse l'absence de fichier et un format inconnu, sans rien ranger", async () => {
    const { handler, store, uploads } = subject();
    await expect(handler.execute(new DepositQualityPhotoCommand(null, "s"))).rejects.toThrow(
      InvalidQualityPhotoError,
    );
    await expect(
      handler.execute(new DepositQualityPhotoCommand(Buffer.from("%PDF-1.7"), "s")),
    ).rejects.toThrow(InvalidQualityPhotoError);
    expect(store.objects.size).toBe(0);
    expect(uploads.rows.size).toBe(0);
  });

  it("un stockage en panne n'écrit aucune ligne", async () => {
    const { handler, store, uploads } = subject();
    store.failOn = "save";
    await expect(handler.execute(new DepositQualityPhotoCommand(JPEG, "s"))).rejects.toThrow();
    expect(uploads.rows.size).toBe(0);
  });
});
