import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
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

let intentCount = 0;
/** Une clé d'intention neuve par geste voulu, comme l'écran. */
const nextKey = (): string => `intent_${(intentCount += 1)}`;

function subject() {
  const clock = new FixedClock(new Date());
  const uploads = new InMemoryUploads(new CheckTable());
  const store = new InMemoryProductionStore();
  const handler = new DepositQualityPhotoHandler(
    uploads,
    store,
    new FixedIdGenerator("up"),
    clock,
    new DirectUnitOfWork(),
    inMemoryIntents(),
  );
  return { clock, uploads, store, handler };
}

describe("DepositQualityPhotoHandler", () => {
  it("range la photo sous quality/pending/<id>, avec son type relu dans les octets", async () => {
    const { handler, uploads, store, clock } = subject();
    const id = await handler.execute(new DepositQualityPhotoCommand(JPEG, "staff_sup", nextKey()));

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
    await expect(
      handler.execute(new DepositQualityPhotoCommand(null, "s", nextKey())),
    ).rejects.toThrow(InvalidQualityPhotoError);
    await expect(
      handler.execute(new DepositQualityPhotoCommand(Buffer.from("%PDF-1.7"), "s", nextKey())),
    ).rejects.toThrow(InvalidQualityPhotoError);
    expect(store.objects.size).toBe(0);
    expect(uploads.rows.size).toBe(0);
  });

  /** Régression : un envoi rejoué déposait la même photo deux fois, sous deux identifiants. */
  it("rejoué avec la même clé, rend le même dépôt sans rien ranger de plus", async () => {
    const { handler, uploads, store } = subject();
    const command = new DepositQualityPhotoCommand(JPEG, "staff_sup", nextKey());

    const first = await handler.execute(command);
    const replayed = await handler.execute(command);

    expect(replayed).toBe(first);
    expect(uploads.rows.size).toBe(1);
    expect(store.objects.size).toBe(1);
  });

  it("un stockage en panne n'écrit aucune ligne", async () => {
    const { handler, store, uploads } = subject();
    store.failOn = "save";
    await expect(
      handler.execute(new DepositQualityPhotoCommand(JPEG, "s", nextKey())),
    ).rejects.toThrow();
    expect(uploads.rows.size).toBe(0);
  });
});
