import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  type DepartureCandidate,
  DepartureCandidatesReader,
} from "../../../channels/commerce/index.js";
import type { DepartureChoice } from "../../../domain/entities/departure-choice.js";
import { DeparturePointNotFoundError } from "../../../domain/errors/delivery-errors.js";
import { DepartureReader } from "../../../domain/ports/departure.reader.js";
import { DepartureRepository } from "../../../domain/ports/departure.repository.js";
import { ChooseDepartureCommand } from "../choose-departure.command.js";
import { ChooseDepartureHandler } from "../choose-departure.handler.js";

const NOW = new Date(0);

class Points extends DepartureCandidatesReader {
  constructor(private readonly points: readonly DepartureCandidate[]) {
    super();
  }
  list(): Promise<readonly DepartureCandidate[]> {
    return Promise.resolve(this.points);
  }
}

class Chosen extends DepartureReader {
  constructor(private readonly id: string | null) {
    super();
  }
  chosenPickupAddressId(): Promise<string | null> {
    return Promise.resolve(this.id);
  }
}

class Written extends DepartureRepository {
  last: DepartureChoice | null = null;
  put(choice: DepartureChoice): Promise<void> {
    this.last = choice;
    return Promise.resolve();
  }
}

function point(id: string, label: string): DepartureCandidate {
  return {
    pickupAddressId: id,
    label,
    address: {
      label,
      ligne1: "1 rue",
      ligne2: "",
      codePostal: "75001",
      ville: "Paris",
      pays: "France",
    },
    gps: null,
    isDefault: false,
  };
}

function handler(
  previous: string | null,
  written: Written,
  events: RecordingPublisher,
): ChooseDepartureHandler {
  return new ChooseDepartureHandler(
    new Points([point("labo", "Laboratoire"), point("boutique", "Boutique")]),
    new Chosen(previous),
    written,
    new FixedStaffAuthorDirectory(
      authorsKnownAs(
        { firstName: "Hugo", lastName: "H", staffUserId: "staff_1", role: "admin" },
        "staff_1",
      ),
    ),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
}

describe("ChooseDepartureHandler", () => {
  it("pose le point choisi avec son auteur figé, et le trace", async () => {
    const written = new Written();
    const events = new RecordingPublisher();

    await handler(null, written, events).execute(new ChooseDepartureCommand("boutique", "staff_1"));

    expect(written.last).toMatchObject({
      pickupAddressId: "boutique",
      at: NOW,
      author: { staffUserId: "staff_1", name: "Hugo H", role: "admin" },
    });
    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Boutique",
      point: { id: "boutique", name: "Boutique" },
      previous: null,
    });
  });

  it("cite le choix remplacé par son nom, ou par son seul id s'il a disparu", async () => {
    const events = new RecordingPublisher();
    await handler("labo", new Written(), events).execute(
      new ChooseDepartureCommand("boutique", "staff_1"),
    );
    await handler("supprime", new Written(), events).execute(
      new ChooseDepartureCommand("boutique", "staff_1"),
    );

    expect(events.traced.map((event) => event.journalFact().payload["previous"])).toEqual([
      { id: "labo", name: "Laboratoire" },
      "supprime",
    ]);
  });

  it("refuse un point qui n'est pas un point de retrait, sans écrire", async () => {
    const written = new Written();
    const events = new RecordingPublisher();

    await expect(
      handler(null, written, events).execute(new ChooseDepartureCommand("ailleurs", "staff_1")),
    ).rejects.toThrow(DeparturePointNotFoundError);
    expect(written.last).toBeNull();
    expect(events.traced).toEqual([]);
  });
});
