import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import { AppellationNotFoundError } from "../../domain/errors/ingredient-errors.js";
import { CreateAppellationCommand, CreateAppellationHandler } from "../create-appellation.js";
import { RemoveAppellationCommand, RemoveAppellationHandler } from "../remove-appellation.js";
import { InMemoryAppellationRepository } from "./in-memory-repositories.js";
import { APPELLATION_PAYLOAD } from "./ingredient-fixtures.js";

describe("RemoveAppellationHandler", () => {
  it("jette si le code n'existe pas", async () => {
    await expect(
      new RemoveAppellationHandler(
        new InMemoryAppellationRepository(),
        new RecordingJournal(),
        new DirectUnitOfWork(),
      ).execute(new RemoveAppellationCommand("absent")),
    ).rejects.toBeInstanceOf(AppellationNotFoundError);
  });

  it("journalise l'effacement avant de retirer la fiche", async () => {
    const appellations = new InMemoryAppellationRepository();
    const journal = new RecordingJournal();
    const code = await new CreateAppellationHandler(
      appellations,
      new RecordingJournal(),
      new FixedIdGenerator(),
      new DirectUnitOfWork(),
    ).execute(new CreateAppellationCommand(APPELLATION_PAYLOAD));

    await new RemoveAppellationHandler(appellations, journal, new DirectUnitOfWork()).execute(
      new RemoveAppellationCommand(code),
    );

    expect(journal.types()).toEqual(["appellation.deleted"]);
    expect(appellations.at(code)).toBeUndefined();
  });
});
