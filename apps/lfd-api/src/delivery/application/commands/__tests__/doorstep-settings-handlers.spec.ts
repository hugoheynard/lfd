import type { DoorstepRule } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import type { DeliveryAuthor } from "../../../domain/entities/departure-choice.js";
import { DoorstepSettingsReader } from "../../../domain/ports/doorstep-settings.reader.js";
import { DoorstepSettingsRepository } from "../../../domain/ports/doorstep-settings.repository.js";
import { GetDoorstepSettingsHandler } from "../../queries/get-doorstep-settings.handler.js";
import { SetDoorstepSettingsCommand } from "../set-doorstep-settings.command.js";
import { SetDoorstepSettingsHandler } from "../set-doorstep-settings.handler.js";

const NOW = new Date(0);

/** Le réglage global en mémoire : lu et écrit dans la même case. */
class InMemoryDoorstepSettings extends DoorstepSettingsReader {
  readonly written: { readonly rule: DoorstepRule; readonly author: DeliveryAuthor }[] = [];
  readonly writer: DoorstepSettingsRepository;

  constructor(private stored: DoorstepRule | null = null) {
    super();
    const record = (rule: DoorstepRule, author: DeliveryAuthor): void => {
      this.stored = rule;
      this.written.push({ rule, author });
    };
    this.writer = new (class extends DoorstepSettingsRepository {
      put(rule: DoorstepRule, _at: Date, author: DeliveryAuthor): Promise<void> {
        record(rule, author);
        return Promise.resolve();
      }
    })();
  }

  current(): Promise<DoorstepRule | null> {
    return Promise.resolve(this.stored);
  }
}

function setter(settings: InMemoryDoorstepSettings, events: RecordingPublisher) {
  return new SetDoorstepSettingsHandler(
    settings,
    settings.writer,
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

describe("la décision réglée d'avance à la porte, globale (B3 bis)", () => {
  it("vaut « Me demander » tant que personne ne l'a posée", async () => {
    const view = await new GetDoorstepSettingsHandler(new InMemoryDoorstepSettings()).execute();

    expect(view).toEqual({ rule: "ask", source: "default" });
  });

  it("se pose avec son auteur, et le fait dit « aucun réglage avant »", async () => {
    const settings = new InMemoryDoorstepSettings();
    const events = new RecordingPublisher();

    await setter(settings, events).execute(new SetDoorstepSettingsCommand("bring_back", "staff_1"));

    expect(settings.written[0]?.author).toEqual({
      staffUserId: "staff_1",
      name: "Hugo H",
      role: "admin",
    });
    expect(await new GetDoorstepSettingsHandler(settings).execute()).toEqual({
      rule: "bring_back",
      source: "explicit",
    });
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "delivery_doorstep.settings_updated",
      subjectType: "delivery_doorstep",
      subjectId: "doorstep",
      payload: { subjectLabel: "Décision à la porte", before: null, after: "bring_back" },
    });
  });

  it("une règle déjà en vigueur n'écrit rien ni ne journalise", async () => {
    const settings = new InMemoryDoorstepSettings("deposit");
    const events = new RecordingPublisher();

    await setter(settings, events).execute(new SetDoorstepSettingsCommand("deposit", "staff_1"));

    expect(settings.written).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("le fait dit l'avant quand on change la règle", async () => {
    const settings = new InMemoryDoorstepSettings("deposit");
    const events = new RecordingPublisher();

    await setter(settings, events).execute(new SetDoorstepSettingsCommand("ask", "staff_1"));

    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      before: "deposit",
      after: "ask",
    });
  });
});
