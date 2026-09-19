import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import { AppellationCodeTakenError } from "../../domain/errors/ingredient-errors.js";
import { CreateAppellationCommand, CreateAppellationHandler } from "../create-appellation.js";
import { InMemoryAppellationRepository } from "./in-memory-repositories.js";
import { APPELLATION_PAYLOAD } from "./ingredient-fixtures.js";

describe("CreateAppellationHandler", () => {
  it("refuse un second code identique", async () => {
    const appellations = new InMemoryAppellationRepository();
    const handler = new CreateAppellationHandler(
      appellations,
      new RecordingJournal(),
      new FixedIdGenerator(),
      new DirectUnitOfWork(),
    );
    await handler.execute(new CreateAppellationCommand(APPELLATION_PAYLOAD));

    await expect(
      handler.execute(
        new CreateAppellationCommand({ ...APPELLATION_PAYLOAD, label: { fr: "Autre" } }),
      ),
    ).rejects.toBeInstanceOf(AppellationCodeTakenError);
  });

  // Une appellation neuve est en service : un second geste pour l'activer
  // n'existe pas dans le contrat, et ce test verrouille cette promesse.
  it("ouvre l'appellation déjà en service", async () => {
    const appellations = new InMemoryAppellationRepository();
    const code = await new CreateAppellationHandler(
      appellations,
      new RecordingJournal(),
      new FixedIdGenerator(),
      new DirectUnitOfWork(),
    ).execute(new CreateAppellationCommand(APPELLATION_PAYLOAD));

    expect(appellations.at(code)?.active).toBe(true);
  });
});
