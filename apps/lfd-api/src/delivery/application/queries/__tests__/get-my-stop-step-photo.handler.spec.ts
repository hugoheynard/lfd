import type { StoredDocument } from "../../../../platform/storage/document-store.js";
import { DeliveryStepPhotosReader } from "../../../channels/commerce/index.js";
import {
  DriverRoundNotFoundError,
  DriverStepPhotoNotFoundError,
} from "../../../domain/errors/delivery-driver-errors.js";
import {
  type DriverRoundRow,
  DriverRoundsReader,
  type DriverRoundSummaryRow,
  type DriverStopRow,
} from "../../../domain/ports/driver-rounds.reader.js";
import { GetMyStopStepPhotoHandler } from "../get-my-stop-step-photo.handler.js";
import { GetMyStopStepPhotoQuery } from "../get-my-stop-step-photo.query.js";

const DRIVER = "staff-driver";
const ROUND = "round-1";

function stop(stopId: string, orderId: string): DriverStopRow {
  return {
    stopId,
    orderId,
    position: 0,
    closedAt: null,
    departed: null,
    bins: 0,
    coldBins: 0,
  };
}

/** Le mur du livreur, joué en mémoire : une tournée n'existe que pour SON livreur. */
class FixedDriverRounds extends DriverRoundsReader {
  readonly asked: { staffUserId: string; roundId: string }[] = [];

  constructor(
    private readonly driver: string,
    private readonly round: DriverRoundRow,
  ) {
    super();
  }

  roundsOf(): Promise<readonly DriverRoundSummaryRow[]> {
    return Promise.resolve([]);
  }

  roundOf(staffUserId: string, roundId: string): Promise<DriverRoundRow | null> {
    this.asked.push({ staffUserId, roundId });
    const mine = staffUserId === this.driver && roundId === this.round.id;
    return Promise.resolve(mine ? this.round : null);
  }
}

/** Les photos du commerce, par `(commande, étape)`. */
class FixedStepPhotos extends DeliveryStepPhotosReader {
  readonly asked: { orderId: string; stepId: string }[] = [];

  constructor(private readonly photos: ReadonlyMap<string, StoredDocument>) {
    super();
  }

  photoOf(orderId: string, stepId: string): Promise<StoredDocument | null> {
    this.asked.push({ orderId, stepId });
    return Promise.resolve(this.photos.get(`${orderId}/${stepId}`) ?? null);
  }
}

const PHOTO: StoredDocument = { contentType: "image/png", bytes: Buffer.from([1, 2, 3]) };

function setup(): {
  handler: GetMyStopStepPhotoHandler;
  rounds: FixedDriverRounds;
  photos: FixedStepPhotos;
} {
  const rounds = new FixedDriverRounds(DRIVER, {
    id: ROUND,
    serviceDay: "2026-01-05",
    vehicleName: "Kangoo",
    passage: 1,
    version: 1,
    departedAt: null,
    stops: [stop("stop-a", "order-a"), stop("stop-b", "order-b")],
  });
  const photos = new FixedStepPhotos(new Map([["order-b/step-1", PHOTO]]));
  return { handler: new GetMyStopStepPhotoHandler(rounds, photos), rounds, photos };
}

describe("GetMyStopStepPhotoHandler", () => {
  it("sert la photo de l'étape par la commande de l'arrêt de MA tournée", async () => {
    const { handler, rounds, photos } = setup();

    const served = await handler.execute(
      new GetMyStopStepPhotoQuery(DRIVER, ROUND, "stop-b", "step-1"),
    );

    expect(served).toBe(PHOTO);
    expect(rounds.asked).toEqual([{ staffUserId: DRIVER, roundId: ROUND }]);
    expect(photos.asked).toEqual([{ orderId: "order-b", stepId: "step-1" }]);
  });

  it("refuse en 404 la tournée d'un autre livreur, sans demander la photo", async () => {
    const { handler, photos } = setup();

    await expect(
      handler.execute(new GetMyStopStepPhotoQuery("staff-other", ROUND, "stop-b", "step-1")),
    ).rejects.toBeInstanceOf(DriverRoundNotFoundError);
    expect(photos.asked).toEqual([]);
  });

  it("refuse en 404 un arrêt qui n'est pas dans cette tournée", async () => {
    const { handler, photos } = setup();

    await expect(
      handler.execute(new GetMyStopStepPhotoQuery(DRIVER, ROUND, "stop-elsewhere", "step-1")),
    ).rejects.toBeInstanceOf(DriverStepPhotoNotFoundError);
    expect(photos.asked).toEqual([]);
  });

  it("refuse en 404 une étape que la procédure de cette commande ne porte pas", async () => {
    const { handler } = setup();

    await expect(
      handler.execute(new GetMyStopStepPhotoQuery(DRIVER, ROUND, "stop-a", "step-1")),
    ).rejects.toBeInstanceOf(DriverStepPhotoNotFoundError);
  });
});
