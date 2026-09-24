import { OPERATION_AUDIENCES } from "@lfd/pim-contracts";

import { Operation } from "../../domain/entities/operation.js";
import {
  DuplicateOperationSkuError,
  OperationArchivedError,
  OperationNotFoundError,
  UnknownOperationSkusError,
} from "../../domain/errors/operation-errors.js";
import { ArchiveOperationCommand, ArchiveOperationHandler } from "../archive-operation.js";
import {
  ChangeOperationAudienceCommand,
  ChangeOperationAudienceHandler,
} from "../change-operation-audience.js";
import { GetOperationHandler, GetOperationQuery } from "../get-operation.js";
import { ListOperationsHandler } from "../list-operations.js";
import { scheduleInputOf } from "../operation-support.js";
import {
  SetOperationSelectionCommand,
  SetOperationSelectionHandler,
} from "../set-operation-selection.js";
import { doubles, inDays, NOW, prepared, type Doubles } from "./operation-doubles.js";

function seed(d: Doubles, over: Parameters<typeof prepared>[0] = {}): void {
  const payload = prepared(over);
  d.operations.seed(Operation.prepare({ ...payload, schedule: scheduleInputOf(payload) }));
}

describe("SetOperationSelectionHandler", () => {
  const select = (d: Doubles) =>
    new SetOperationSelectionHandler(d.operations, d.skus, d.journal, d.uow);

  it("pose la sélection dans l'ordre, et trace l'avant et l'après", async () => {
    const d = doubles();
    seed(d);

    await select(d).execute(new SetOperationSelectionCommand("noel-2026", ["GAL-002", "BUC-001"]));

    expect(d.operations.rows.get("noel-2026")?.skus).toEqual(["GAL-002", "BUC-001"]);
    expect(d.journal.entries[0]?.payload).toEqual({
      subjectLabel: "Noël 2026",
      skus: { from: [], to: ["GAL-002", "BUC-001"] },
    });
  });

  it("refuse un SKU que le catalogue ne porte pas, en le nommant", async () => {
    const d = doubles();
    seed(d);

    const attempt = select(d).execute(
      new SetOperationSelectionCommand("noel-2026", ["BUC-001", "XXX-404"]),
    );

    await expect(attempt).rejects.toThrow(UnknownOperationSkusError);
    await expect(attempt).rejects.toThrow(/XXX-404/u);
    expect(d.operations.writes).toEqual([]);
  });

  /** Une liste qui se contredit n'a pas besoin d'une lecture pour être refusée. */
  it("refuse un doublon avant d'interroger le catalogue", async () => {
    const d = doubles();
    seed(d);

    await expect(
      select(d).execute(new SetOperationSelectionCommand("noel-2026", ["BUC-001", "BUC-001"])),
    ).rejects.toThrow(DuplicateOperationSkuError);
    expect(d.skus.reads).toBe(0);
  });

  it("n'écrit rien quand la sélection est la même, dans le même ordre", async () => {
    const d = doubles();
    seed(d);
    await select(d).execute(new SetOperationSelectionCommand("noel-2026", ["BUC-001"]));

    await select(d).execute(new SetOperationSelectionCommand("noel-2026", [" BUC-001 "]));

    expect(d.journal.types()).toEqual(["operation.selection_saved"]);
  });
});

describe("ChangeOperationAudienceHandler", () => {
  const change = (d: Doubles) => new ChangeOperationAudienceHandler(d.operations, d.journal, d.uow);

  /** Chaque clientèle du contrat passe le catalogue des faits, strict : les deux listes s'accordent. */
  it.each(OPERATION_AUDIENCES.filter((audience) => audience !== "both"))(
    "passe de « both » à « %s », et le trace",
    async (audience) => {
      const d = doubles();
      seed(d);

      await change(d).execute(new ChangeOperationAudienceCommand("noel-2026", audience));

      expect(d.journal.entries[0]?.payload).toEqual({
        subjectLabel: "Noël 2026",
        audience: { from: "both", to: audience },
      });
    },
  );

  it("n'écrit rien quand la clientèle ne change pas", async () => {
    const d = doubles();
    seed(d);

    await change(d).execute(new ChangeOperationAudienceCommand("noel-2026", "both"));

    expect(d.operations.writes).toEqual([]);
  });
});

describe("ArchiveOperationHandler", () => {
  const archive = (d: Doubles) =>
    new ArchiveOperationHandler(d.operations, d.journal, d.clock, d.uow);

  it("archive à l'heure de l'horloge, et le trace", async () => {
    const d = doubles();
    seed(d);

    await archive(d).execute(new ArchiveOperationCommand("noel-2026"));

    expect(d.operations.rows.get("noel-2026")?.archivedAt).toEqual(NOW);
    expect(d.journal.types()).toEqual(["operation.archived"]);
  });

  it("refuse un second archivage : la date du premier est celle qu'on cherchera", async () => {
    const d = doubles();
    seed(d);
    await archive(d).execute(new ArchiveOperationCommand("noel-2026"));
    d.clock.advanceMs(60_000);

    await expect(archive(d).execute(new ArchiveOperationCommand("noel-2026"))).rejects.toThrow(
      OperationArchivedError,
    );
    expect(d.operations.rows.get("noel-2026")?.archivedAt).toEqual(NOW);
  });
});

describe("les lectures", () => {
  it("liste l'annonce la plus récente d'abord, l'état calculé à l'horloge", async () => {
    const d = doubles();
    seed(d, {
      key: "galette",
      announceFrom: inDays(-10),
      orderFrom: null,
      orderUntil: inDays(5),
      pickupFrom: inDays(1).slice(0, 10),
      pickupUntil: inDays(6).slice(0, 10),
    });
    seed(d);

    const views = await new ListOperationsHandler(d.operations.reader(), d.clock).execute();

    expect(views.map((view) => [view.key, view.state])).toEqual([
      ["noel-2026", "preparing"],
      ["galette", "open"],
    ]);
  });

  it("lit une opération, et suit l'horloge quand elle avance", async () => {
    const d = doubles();
    seed(d);
    const get = new GetOperationHandler(d.operations.reader(), d.clock);

    expect((await get.execute(new GetOperationQuery("noel-2026"))).state).toBe("preparing");
    d.clock.set(new Date(inDays(50)));
    expect(await get.execute(new GetOperationQuery("noel-2026"))).toMatchObject({
      state: "open",
      skus: [],
      archivedAt: null,
      orderFrom: inDays(45),
    });
    await expect(get.execute(new GetOperationQuery("paques"))).rejects.toThrow(
      OperationNotFoundError,
    );
  });
});
