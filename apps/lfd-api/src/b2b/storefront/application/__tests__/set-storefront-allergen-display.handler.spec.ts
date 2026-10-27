import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { AllergenDisplay } from "../../domain/allergen-display.js";
import { StorefrontSettingsRepository } from "../../domain/storefront-settings.repository.js";
import { SetStorefrontAllergenDisplayCommand } from "../set-storefront-allergen-display.command.js";
import { SetStorefrontAllergenDisplayHandler } from "../set-storefront-allergen-display.handler.js";

/** Le réglage en mémoire : rend la valeur d'avant, retient l'auteur. */
class StoredSettings extends StorefrontSettingsRepository {
  readonly writes: { value: AllergenDisplay; staffId: string }[] = [];

  constructor(private current: AllergenDisplay) {
    super();
  }

  setAllergenDisplay(value: AllergenDisplay, _at: Date, staffId: string): Promise<AllergenDisplay> {
    const before = this.current;
    this.current = value;
    this.writes.push({ value, staffId });
    return Promise.resolve(before);
  }
}

function handlerWith(settings: StoredSettings, events: RecordingPublisher) {
  return new SetStorefrontAllergenDisplayHandler(
    settings,
    events,
    new DirectUnitOfWork(),
    new FixedClock(new Date(0)),
  );
}

describe("SetStorefrontAllergenDisplayHandler", () => {
  it("pose la place des allergènes et trace d'où elle part et où elle va", async () => {
    const settings = new StoredSettings("sheet");
    const events = new RecordingPublisher();

    await handlerWith(settings, events).execute(
      new SetStorefrontAllergenDisplayCommand("gallery", "stf_1"),
    );

    expect(settings.writes).toEqual([{ value: "gallery", staffId: "stf_1" }]);
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "storefront.allergen_display_changed",
        subjectType: "storefront",
        subjectId: "main",
        payload: { subjectLabel: "Vitrine", from: "sheet", to: "gallery" },
      },
    ]);
  });

  it("ne trace rien quand la valeur ne change pas", async () => {
    const events = new RecordingPublisher();

    await handlerWith(new StoredSettings("sheet"), events).execute(
      new SetStorefrontAllergenDisplayCommand("sheet", "stf_1"),
    );

    expect(events.traced).toEqual([]);
  });
});
