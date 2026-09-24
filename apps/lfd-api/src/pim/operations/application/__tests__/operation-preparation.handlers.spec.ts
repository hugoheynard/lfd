import { UnknownImageError } from "../../../channels/media/image-catalogue.js";
import { Operation } from "../../domain/entities/operation.js";
import {
  InvalidOperationScheduleError,
  OperationKeyTakenError,
  OperationNotFoundError,
} from "../../domain/errors/operation-errors.js";
import { EditOperationCommand, EditOperationHandler } from "../edit-operation.js";
import { PrepareOperationCommand, PrepareOperationHandler } from "../prepare-operation.js";
import { RescheduleOperationCommand, RescheduleOperationHandler } from "../reschedule-operation.js";
import { scheduleInputOf } from "../operation-support.js";
import {
  dayIn,
  doubles,
  inDays,
  KNOWN_IMAGE,
  prepared,
  type Doubles,
} from "./operation-doubles.js";

function prepare(d: Doubles): PrepareOperationHandler {
  return new PrepareOperationHandler(d.operations, d.images, d.journal, d.uow);
}

/** Une opération déjà là, préparée par le domaine — jamais une ligne écrite à la main. */
function seeded(d: Doubles, archivedAt: Date | null = null): Operation {
  const payload = prepared();
  const operation = Operation.prepare({ ...payload, schedule: scheduleInputOf(payload) });
  if (archivedAt !== null) {
    operation.archive(archivedAt);
  }
  d.operations.seed(operation);
  return operation;
}

describe("PrepareOperationHandler", () => {
  it("prépare l'opération, rend sa clé, et journalise tout ce qu'elle dit", async () => {
    const d = doubles();

    const key = await prepare(d).execute(
      new PrepareOperationCommand(prepared({ key: " noel-2026 " })),
    );

    expect(key).toBe("noel-2026");
    expect(d.operations.writes).toEqual(["add:noel-2026"]);
    expect(d.journal.types()).toEqual(["operation.prepared"]);
    expect(d.journal.entries[0]).toMatchObject({
      subjectType: "operation",
      subjectId: "noel-2026",
      payload: {
        subjectLabel: "Noël 2026",
        audience: "both",
        announceFrom: inDays(30),
        pickupUntil: dayIn(84),
        image: { url: KNOWN_IMAGE, alt: "Une bûche" },
      },
    });
  });

  /** D9 : `noel-2026` ne renaît jamais, même archivée — le commerce y accroche ses surcharges. */
  it("refuse une clé déjà prise par une opération archivée, sans rien écrire ni tracer", async () => {
    const d = doubles();
    seeded(d, new Date(inDays(-3)));

    await expect(prepare(d).execute(new PrepareOperationCommand(prepared()))).rejects.toThrow(
      OperationKeyTakenError,
    );
    expect(d.operations.writes).toEqual([]);
    expect(d.journal.entries).toHaveLength(0);
  });

  /** Plus aucun visuel par simple URL (Hugo, 2026-09-23) : l'annonce n'y fait pas exception. */
  it("refuse une image qui n'est pas dans la médiathèque", async () => {
    const d = doubles();

    await expect(
      prepare(d).execute(
        new PrepareOperationCommand(
          prepared({ image: { url: "https://ailleurs.test/x.jpg", alt: "" } }),
        ),
      ),
    ).rejects.toThrow(UnknownImageError);
    expect(d.journal.entries).toHaveLength(0);
  });

  it("refuse des dates qui se contredisent avant toute lecture", async () => {
    const d = doubles();

    await expect(
      prepare(d).execute(new PrepareOperationCommand(prepared({ orderUntil: inDays(40) }))),
    ).rejects.toThrow(InvalidOperationScheduleError);
    expect(d.operations.writes).toEqual([]);
  });
});

describe("EditOperationHandler", () => {
  const edit = (d: Doubles) => new EditOperationHandler(d.operations, d.images, d.journal, d.uow);

  it("journalise seulement ce qui a changé", async () => {
    const d = doubles();
    seeded(d);

    await edit(d).execute(
      new EditOperationCommand("noel-2026", {
        name: { fr: "Noël" },
        lede: { fr: "Les bûches sont là." },
        image: { url: KNOWN_IMAGE, alt: "Une bûche" },
      }),
    );

    expect(d.journal.entries[0]?.payload).toEqual({
      subjectLabel: "Noël",
      changes: { name: { from: { fr: "Noël 2026" }, to: { fr: "Noël" } } },
    });
    expect(d.operations.writes).toEqual(["save:noel-2026"]);
  });

  it("n'écrit rien quand rien n'a changé", async () => {
    const d = doubles();
    seeded(d);
    const { name, lede, image } = prepared();

    await edit(d).execute(new EditOperationCommand("noel-2026", { name, lede, image }));

    expect(d.operations.writes).toEqual([]);
    expect(d.journal.entries).toHaveLength(0);
  });

  it("refuse une image nouvelle hors de la médiathèque", async () => {
    const d = doubles();
    seeded(d);

    await expect(
      edit(d).execute(
        new EditOperationCommand("noel-2026", {
          name: { fr: "Noël 2026" },
          lede: null,
          image: { url: "https://ailleurs.test/x.jpg", alt: "" },
        }),
      ),
    ).rejects.toThrow(UnknownImageError);
    expect(d.operations.writes).toEqual([]);
  });

  it("refuse une clé inconnue", async () => {
    const d = doubles();

    await expect(
      edit(d).execute(
        new EditOperationCommand("paques", { name: { fr: "P" }, lede: null, image: null }),
      ),
    ).rejects.toThrow(OperationNotFoundError);
  });
});

describe("RescheduleOperationHandler", () => {
  const reschedule = (d: Doubles) => new RescheduleOperationHandler(d.operations, d.journal, d.uow);

  /** « Qui a avancé la clôture de Noël » : la réponse ne doit pas se noyer dans les dates restées. */
  it("ne trace que les dates qui ont bougé, en texte", async () => {
    const d = doubles();
    seeded(d);
    const payload = prepared();

    await reschedule(d).execute(
      new RescheduleOperationCommand("noel-2026", { ...payload, orderUntil: inDays(79) }),
    );

    expect(d.journal.entries[0]?.payload).toEqual({
      subjectLabel: "Noël 2026",
      changes: { orderUntil: { from: inDays(80), to: inDays(79) } },
    });
  });

  it("ne laisse aucune trace d'un redatage refusé", async () => {
    const d = doubles();
    seeded(d);

    await expect(
      reschedule(d).execute(
        new RescheduleOperationCommand("noel-2026", { ...prepared(), orderUntil: inDays(90) }),
      ),
    ).rejects.toThrow(InvalidOperationScheduleError);
    expect(d.journal.entries).toHaveLength(0);
    expect(d.operations.writes).toEqual([]);
  });
});
