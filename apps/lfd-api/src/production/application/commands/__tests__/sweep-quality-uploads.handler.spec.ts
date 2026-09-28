import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  CheckTable,
  InMemoryProductionStore,
  InMemoryUploads,
  JPEG,
} from "../../__tests__/quality-doubles.js";
import { DepositQualityPhotoCommand } from "../deposit-quality-photo.command.js";
import { DepositQualityPhotoHandler } from "../deposit-quality-photo.handler.js";
import { SweepQualityUploadsHandler } from "../sweep-quality-uploads.handler.js";

const HOUR = 60 * 60 * 1000;

function subject() {
  const clock = new FixedClock(new Date());
  const uploads = new InMemoryUploads(new CheckTable());
  const store = new InMemoryProductionStore();
  const deposit = new DepositQualityPhotoHandler(uploads, store, new FixedIdGenerator("up"), clock);
  const sweep = new SweepQualityUploadsHandler(uploads, store, clock);
  return { clock, uploads, store, deposit, sweep };
}

describe("SweepQualityUploadsHandler", () => {
  it("retire les dépôts de plus de 24 h, et laisse les plus jeunes", async () => {
    const { clock, deposit, sweep, store, uploads } = subject();
    const old = await deposit.execute(new DepositQualityPhotoCommand(JPEG, "s"));
    clock.advanceMs(20 * HOUR);
    const young = await deposit.execute(new DepositQualityPhotoCommand(JPEG, "s"));
    clock.advanceMs(5 * HOUR);

    await expect(sweep.execute()).resolves.toBe(1);

    expect(store.objects.has(`quality/pending/${old}`)).toBe(false);
    expect(store.objects.has(`quality/pending/${young}`)).toBe(true);
    expect(uploads.rows.get(old)?.releasedAt).toEqual(clock.now());
    expect(uploads.rows.get(young)?.releasedAt).toBeNull();
  });

  it("un second passage ne retrouve rien : un dépôt n'est libéré qu'une fois", async () => {
    const { clock, deposit, sweep } = subject();
    await deposit.execute(new DepositQualityPhotoCommand(JPEG, "s"));
    clock.advanceMs(25 * HOUR);
    await sweep.execute();
    await expect(sweep.execute()).resolves.toBe(0);
  });
});
