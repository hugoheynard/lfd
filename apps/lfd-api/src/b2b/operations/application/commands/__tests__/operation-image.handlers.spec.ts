import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { ScopedJournal } from "../../../../../platform/journal/scoped-journal.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  InvalidOperationImageError,
  UnknownOperationImageError,
} from "../../../domain/errors/operation-errors.js";
import { RepointOperationImage } from "../../repoint-operation-image.js";
import { EditOperationCommand } from "../edit-operation.command.js";
import { EditOperationHandler } from "../edit-operation.handler.js";
import { PrepareOperationCommand } from "../prepare-operation.command.js";
import { PrepareOperationHandler } from "../prepare-operation.handler.js";
import { RefocusOperationImageCommand } from "../refocus-operation-image.command.js";
import { RefocusOperationImageHandler } from "../refocus-operation-image.handler.js";
import {
  FixedImageLibrary,
  InMemoryOperations,
  libraryImage,
  noel,
  preparedNoel,
} from "./operation-doubles.js";

const NOW = new Date("2026-10-15T09:00:00.000Z");
const A = "https://media.test/products/a.webp";
const B = "https://media.test/products/b.webp";
/** Un journal qui ne garde rien : le laissez-passer n'est pas lu, il prouve seulement le tracé. */
class SilentJournal extends ScopedJournal<string> {
  protected record(): Promise<void> {
    return Promise.resolve();
  }
}
const TICKET = new SilentJournal().untraced("remplacement tracé par la médiathèque");

function scene(seed = [preparedNoel()]) {
  const operations = new InMemoryOperations(seed);
  const events = new RecordingPublisher();
  const library = new FixedImageLibrary([libraryImage(A, { x: 0.2, y: 0.8 }), libraryImage(B)]);
  const ports = [operations, new FixedClock(NOW), events, new DirectUnitOfWork()] as const;
  return { operations, events, library, ports };
}

function edit(image: { url: string } | null, by = "staff_1") {
  return new EditOperationCommand(
    "noel-2026",
    { name: { fr: "Noël 2026" }, lede: null, image },
    by,
  );
}

describe("choisir l'image d'une opération dans la médiathèque", () => {
  it("prépare avec une image du fonds, son point focal lu à la médiathèque", async () => {
    const { operations, events, library, ports } = scene([]);

    await new PrepareOperationHandler(...ports, library).execute(
      new PrepareOperationCommand(noel({ image: { url: ` ${A} ` } }), "s"),
    );

    // Lot 3 : ni texte alternatif sur l'opération, ni au journal — il est à la médiathèque.
    expect(operations.stored("noel-2026").image).toEqual({ url: A, focal: { x: 0.2, y: 0.8 } });
    expect(events.traced[0]?.journalFact().payload).toMatchObject({ image: { url: A } });
    expect(JSON.stringify(events.traced[0]?.journalFact().payload)).not.toContain("focal");
    expect(JSON.stringify(events.traced[0]?.journalFact().payload)).not.toContain("alt");
  });

  it("refuse en 404 une image que la médiathèque ne connaît pas, et n'écrit rien", async () => {
    const { operations, events, library, ports } = scene();

    await expect(
      new EditOperationHandler(...ports, library).execute(
        edit({ url: "https://ailleurs.test/x.jpg" }),
      ),
    ).rejects.toThrow(UnknownOperationImageError);
    expect(operations.saves).toBe(0);
    expect(events.traced).toEqual([]);
  });

  it("une adresse vide reste le refus de l'agrégat (400), sans interroger le fonds", async () => {
    const { library, ports } = scene();

    await expect(
      new EditOperationHandler(...ports, library).execute(edit({ url: "  " })),
    ).rejects.toThrow(InvalidOperationImageError);
    expect(library.reads).toBe(0);
  });

  it("la même image garde son point, ne relit pas le fonds, et n'écrit rien de plus", async () => {
    const { operations, events, library, ports } = scene();
    const handler = new EditOperationHandler(...ports, library);
    await handler.execute(edit({ url: A }));

    await handler.execute(edit({ url: A }));

    expect(library.reads).toBe(1);
    expect(operations.stored("noel-2026").image).toEqual({ url: A, focal: { x: 0.2, y: 0.8 } });
    expect(events.traced).toHaveLength(1);
  });

  it("une autre image prend SON point — celui de l'ancienne décrivait une autre image", async () => {
    const { operations, library, ports } = scene();
    const handler = new EditOperationHandler(...ports, library);
    await handler.execute(edit({ url: A }));

    await handler.execute(edit({ url: B }));

    expect(operations.stored("noel-2026").image).toEqual({ url: B, focal: null });
  });
});

describe("RepointOperationImage — la médiathèque remplace une image", () => {
  /** Lot 3 : suivre un remplacement n'est pas une édition — l'auteur reste celui de l'opération. */
  it("charge, repointe par l'agrégat, sauve — sans changer l'auteur", async () => {
    const { operations, library, ports } = scene();
    await new EditOperationHandler(...ports, library).execute(edit({ url: A }));
    const saves = operations.saves;

    const count = await new RepointOperationImage(operations).repoint(
      { from: A, to: B, staffId: "staff_media", at: NOW },
      TICKET,
    );

    expect(count).toBe(1);
    expect(operations.saves).toBe(saves + 1);
    expect(operations.stored("noel-2026")).toMatchObject({
      image: { url: B, focal: null },
      lastWrite: { by: "staff_1" },
    });
  });

  it("ne touche pas une opération qui montre une autre image", async () => {
    const { operations } = scene([preparedNoel({ image: { url: B } })]);

    const count = await new RepointOperationImage(operations).repoint(
      { from: A, to: B, staffId: "s", at: NOW },
      TICKET,
    );

    expect(count).toBe(0);
    expect(operations.saves).toBe(0);
  });

  /** Lot 3 (« Après le lot 2 ») : l'historique d'une archivée ne pointe pas vers une image disparue. */
  it("repointe aussi une opération archivée", async () => {
    const archived = preparedNoel({ key: "paques-2027", image: { url: A } });
    archived.archive({ by: "s", at: NOW });
    const { operations } = scene([archived]);

    const count = await new RepointOperationImage(operations).repoint(
      { from: A, to: B, staffId: "s", at: NOW },
      TICKET,
    );

    expect(count).toBe(1);
    expect(operations.stored("paques-2027")).toMatchObject({ image: { url: B }, archivedAt: NOW });
  });
});

describe("RefocusOperationImageHandler — le point focal suit", () => {
  it("recadre les opérations qui montrent l'image, sans changer leur auteur", async () => {
    const { operations, ports } = scene([preparedNoel({ image: { url: A } })]);
    const [repository, , , uow] = ports;

    const count = await new RefocusOperationImageHandler(repository, uow).execute(
      new RefocusOperationImageCommand(A, { x: 0.5, y: 0.1 }),
    );

    expect(count).toBe(1);
    expect(operations.stored("noel-2026")).toMatchObject({
      image: { url: A, focal: { x: 0.5, y: 0.1 } },
      lastWrite: { by: "staff_veille" },
    });
  });

  it("n'écrit rien quand le point ne change pas", async () => {
    const { operations, ports } = scene([preparedNoel({ image: { url: A } })]);
    const [repository, , , uow] = ports;

    const count = await new RefocusOperationImageHandler(repository, uow).execute(
      new RefocusOperationImageCommand(A, null),
    );

    expect(count).toBe(0);
    expect(operations.saves).toBe(0);
  });

  it("laisse une opération archivée à son point", async () => {
    const archived = preparedNoel({ image: { url: A } });
    archived.archive({ by: "s", at: NOW });
    const { operations, ports } = scene([archived]);
    const [repository, , , uow] = ports;

    const count = await new RefocusOperationImageHandler(repository, uow).execute(
      new RefocusOperationImageCommand(A, { x: 0.5, y: 0.1 }),
    );

    expect(count).toBe(0);
    expect(operations.saves).toBe(0);
  });
});
