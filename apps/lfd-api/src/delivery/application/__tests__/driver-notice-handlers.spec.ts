import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { AcknowledgeDriverNoticeCommand } from "../commands/acknowledge-driver-notice.command.js";
import { AcknowledgeDriverNoticeHandler } from "../commands/acknowledge-driver-notice.handler.js";
import { GetMyDriverNoticeQuery } from "../queries/get-my-driver-notice.query.js";
import { GetMyDriverNoticeHandler } from "../queries/get-my-driver-notice.handler.js";
import type { DriverNoticeAcknowledgement } from "../../domain/entities/driver-notice-acknowledgement.js";
import { DriverNoticeOutdatedError } from "../../domain/errors/driver-notice-errors.js";
import { DriverNoticeAcknowledgementRepository } from "../../domain/ports/driver-notice-acknowledgement.repository.js";
import { DriverNoticeAcknowledgementsReader } from "../../domain/ports/driver-notice-acknowledgements.reader.js";
import { CURRENT_DRIVER_NOTICE } from "../../domain/value-objects/driver-information-notice.js";

/** Les accusés en mémoire, avec la sémantique de l'adaptateur : le premier gagne. */
class InMemoryAcknowledgements extends DriverNoticeAcknowledgementRepository {
  readonly rows = new Map<string, Date>();

  override save(ack: DriverNoticeAcknowledgement): Promise<void> {
    const key = `${ack.staffUserId}|${String(ack.version)}`;
    if (!this.rows.has(key)) {
      this.rows.set(key, ack.acknowledgedAt);
    }
    return Promise.resolve();
  }
}

class AcknowledgementsReaderDouble extends DriverNoticeAcknowledgementsReader {
  constructor(private readonly store: InMemoryAcknowledgements) {
    super();
  }

  override acknowledgedAt(staffUserId: string, version: number): Promise<Date | null> {
    return Promise.resolve(this.store.rows.get(`${staffUserId}|${String(version)}`) ?? null);
  }
}

const CURRENT = CURRENT_DRIVER_NOTICE.version;
const FIRST = new Date(1_000_000);
const LATER = new Date(2_000_000);

describe("« Mes données » — l'accusé et sa lecture", () => {
  let store: InMemoryAcknowledgements;
  let clock: FixedClock;
  let acknowledge: AcknowledgeDriverNoticeHandler;
  let read: GetMyDriverNoticeHandler;

  beforeEach(() => {
    store = new InMemoryAcknowledgements();
    clock = new FixedClock(FIRST);
    acknowledge = new AcknowledgeDriverNoticeHandler(store, clock);
    read = new GetMyDriverNoticeHandler(new AcknowledgementsReaderDouble(store));
  });

  it("sans accusé, rend le texte courant et `acknowledgedAt` nul : le dialogue s'ouvre", async () => {
    const view = await read.execute(new GetMyDriverNoticeQuery("st_paul"));

    expect(view.acknowledgedAt).toBeNull();
    expect(view.notice.version).toBe(CURRENT);
    expect(view.notice.sections.length).toBe(CURRENT_DRIVER_NOTICE.sections.length);
  });

  /**
   * La v2 (position au geste, 2026-10-06) : un livreur qui a accusé la v1 voit
   * le dialogue UNE fois de plus, puis plus jamais pour cette version.
   */
  it("un accusé de la version précédente ne vaut pas : le dialogue se rouvre une fois", async () => {
    expect(CURRENT).toBe(2);
    store.rows.set(`st_paul|${String(CURRENT - 1)}`, FIRST);

    expect((await read.execute(new GetMyDriverNoticeQuery("st_paul"))).acknowledgedAt).toBeNull();

    clock = new FixedClock(LATER);
    await new AcknowledgeDriverNoticeHandler(store, clock).execute(
      new AcknowledgeDriverNoticeCommand("st_paul", CURRENT),
    );
    const view = await read.execute(new GetMyDriverNoticeQuery("st_paul"));
    expect(view.acknowledgedAt).toBe(LATER.toISOString());
  });

  it("accuse à l'heure de l'horloge, et la lecture le rend", async () => {
    await acknowledge.execute(new AcknowledgeDriverNoticeCommand("st_paul", CURRENT));

    const view = await read.execute(new GetMyDriverNoticeQuery("st_paul"));
    expect(view.acknowledgedAt).toBe(FIRST.toISOString());
  });

  it("n'accuse que pour soi : l'accusé de Paul ne vaut pas pour Léa", async () => {
    await acknowledge.execute(new AcknowledgeDriverNoticeCommand("st_paul", CURRENT));

    const lea = await read.execute(new GetMyDriverNoticeQuery("st_lea"));
    expect(lea.acknowledgedAt).toBeNull();
  });

  it("rejoué, garde la première date", async () => {
    await acknowledge.execute(new AcknowledgeDriverNoticeCommand("st_paul", CURRENT));
    clock.set(LATER);
    await acknowledge.execute(new AcknowledgeDriverNoticeCommand("st_paul", CURRENT));

    const view = await read.execute(new GetMyDriverNoticeQuery("st_paul"));
    expect(view.acknowledgedAt).toBe(FIRST.toISOString());
  });

  it("refuse une version qui n'est plus la courante, et n'écrit rien", async () => {
    await expect(
      acknowledge.execute(new AcknowledgeDriverNoticeCommand("st_paul", CURRENT + 1)),
    ).rejects.toThrow(DriverNoticeOutdatedError);
    expect(store.rows.size).toBe(0);
  });

  it("un accusé d'une ancienne version ne vaut pas pour la courante", async () => {
    store.rows.set(`st_paul|${String(CURRENT - 1)}`, FIRST);

    const view = await read.execute(new GetMyDriverNoticeQuery("st_paul"));
    expect(view.acknowledgedAt).toBeNull();
  });
});
