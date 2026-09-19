import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import { AppellationNotFoundError } from "../../domain/errors/ingredient-errors.js";
import { CreateAppellationCommand, CreateAppellationHandler } from "../create-appellation.js";
import { UpdateAppellationCommand, UpdateAppellationHandler } from "../update-appellation.js";
import { InMemoryAppellationRepository } from "./in-memory-repositories.js";
import { APPELLATION_PAYLOAD } from "./ingredient-fixtures.js";

describe("UpdateAppellationHandler", () => {
  it("jette si le code n'existe pas", async () => {
    await expect(
      new UpdateAppellationHandler(
        new InMemoryAppellationRepository(),
        new RecordingJournal(),
        new DirectUnitOfWork(),
      ).execute(new UpdateAppellationCommand("absent", { active: false })),
    ).rejects.toBeInstanceOf(AppellationNotFoundError);
  });

  it("met hors service sans toucher au reste", async () => {
    const appellations = new InMemoryAppellationRepository();
    const code = await new CreateAppellationHandler(
      appellations,
      new RecordingJournal(),
      new FixedIdGenerator(),
      new DirectUnitOfWork(),
    ).execute(new CreateAppellationCommand(APPELLATION_PAYLOAD));

    await new UpdateAppellationHandler(
      appellations,
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new UpdateAppellationCommand(code, { active: false }));

    expect(appellations.at(code)).toMatchObject({ active: false, label: { fr: "Beaufort" } });
  });

  // L'écran renvoie la fiche entière à chaque enregistrement : sans ce
  // filtre, l'historique serait surtout fait de gestes sans effet.
  it("reste muet quand la révision renvoie exactement ce qui est déjà en place", async () => {
    const appellations = new InMemoryAppellationRepository();
    const journal = new RecordingJournal();
    const code = await new CreateAppellationHandler(
      appellations,
      journal,
      new FixedIdGenerator(),
      new DirectUnitOfWork(),
    ).execute(new CreateAppellationCommand(APPELLATION_PAYLOAD));

    await new UpdateAppellationHandler(appellations, journal, new DirectUnitOfWork()).execute(
      new UpdateAppellationCommand(code, {
        label: APPELLATION_PAYLOAD.label,
        scheme: APPELLATION_PAYLOAD.scheme,
        active: true,
      }),
    );

    expect(journal.types()).toEqual(["appellation.created"]);
  });
});
