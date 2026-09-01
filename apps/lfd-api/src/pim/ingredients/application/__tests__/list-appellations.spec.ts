import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import {
  CreateAppellationCommand,
  CreateAppellationHandler,
  UpdateAppellationCommand,
  UpdateAppellationHandler,
} from "../appellation-handlers.js";
import { ListAppellationsHandler } from "../list-appellations.js";
import { InMemoryAppellationRepository } from "./in-memory-repositories.js";

/**
 * Les appellations sont ouvertes par le geste réel : une donnée que le domaine
 * ne sait pas produire est une donnée que la production ne verra jamais.
 */
async function opened(codes: readonly string[]): Promise<InMemoryAppellationRepository> {
  const appellations = new InMemoryAppellationRepository();
  const open = new CreateAppellationHandler(
    appellations,
    new RecordingJournal(),
    new FixedIdGenerator("apl"),
    new DirectUnitOfWork(),
  );
  for (const code of codes) {
    await open.execute(new CreateAppellationCommand({ code, label: { fr: code }, scheme: "AOP" }));
  }
  return appellations;
}

describe("ListAppellationsHandler", () => {
  it("rend les appellations avec ce qui les retient", async () => {
    const appellations = await opened(["aop-beaufort"]);

    const view = await new ListAppellationsHandler(appellations).execute();

    expect(view).toEqual([
      {
        code: "aop-beaufort",
        label: { fr: "aop-beaufort" },
        scheme: "AOP",
        active: true,
        usedBy: 0,
      },
    ]);
  });

  // Le fil parle en CODES : l'identifiant technique est une clé de jointure, et
  // le laisser sortir inviterait un écran à s'en servir comme d'une identité.
  it("ne laisse pas sortir l'identifiant technique", async () => {
    const appellations = await opened(["aop-beaufort"]);

    const view = await new ListAppellationsHandler(appellations).execute();

    expect(view[0]).not.toHaveProperty("id");
  });

  // C'est depuis cet écran qu'on remet une appellation en service : la masquer
  // parce qu'elle est hors service la rendrait irrécupérable.
  it("rend aussi les appellations hors service", async () => {
    const appellations = await opened(["aop-beaufort"]);
    await new UpdateAppellationHandler(
      appellations,
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new UpdateAppellationCommand("aop-beaufort", { active: false }));

    const view = await new ListAppellationsHandler(appellations).execute();

    expect(view.map((row) => [row.code, row.active])).toEqual([["aop-beaufort", false]]);
  });
});
