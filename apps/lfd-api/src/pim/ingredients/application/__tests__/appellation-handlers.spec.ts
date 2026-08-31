import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import {
  AppellationCodeTakenError,
  AppellationNotFoundError,
} from "../../domain/errors/ingredient-errors.js";
import {
  CreateAppellationCommand,
  CreateAppellationHandler,
  RemoveAppellationCommand,
  RemoveAppellationHandler,
  UpdateAppellationCommand,
  UpdateAppellationHandler,
} from "../appellation-handlers.js";
import { InMemoryAppellationRepository } from "./in-memory-repositories.js";

const BASE_PAYLOAD = { code: "aop-beaufort", label: { fr: "Beaufort" }, scheme: "AOP" };

describe("CreateAppellationHandler", () => {
  it("refuse un second code identique", async () => {
    const appellations = new InMemoryAppellationRepository();
    const handler = new CreateAppellationHandler(
      appellations,
      new RecordingJournal(),
      new FixedIdGenerator(),
      new DirectUnitOfWork(),
    );
    await handler.execute(new CreateAppellationCommand(BASE_PAYLOAD));

    await expect(
      handler.execute(new CreateAppellationCommand({ ...BASE_PAYLOAD, label: { fr: "Autre" } })),
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
    ).execute(new CreateAppellationCommand(BASE_PAYLOAD));

    expect(appellations.at(code)?.active).toBe(true);
  });
});

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
    ).execute(new CreateAppellationCommand(BASE_PAYLOAD));

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
    ).execute(new CreateAppellationCommand(BASE_PAYLOAD));

    await new UpdateAppellationHandler(appellations, journal, new DirectUnitOfWork()).execute(
      new UpdateAppellationCommand(code, {
        label: BASE_PAYLOAD.label,
        scheme: BASE_PAYLOAD.scheme,
        active: true,
      }),
    );

    expect(journal.types()).toEqual(["appellation.created"]);
  });
});

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
    ).execute(new CreateAppellationCommand(BASE_PAYLOAD));

    await new RemoveAppellationHandler(appellations, journal, new DirectUnitOfWork()).execute(
      new RemoveAppellationCommand(code),
    );

    expect(journal.types()).toEqual(["appellation.deleted"]);
    expect(appellations.at(code)).toBeUndefined();
  });
});
