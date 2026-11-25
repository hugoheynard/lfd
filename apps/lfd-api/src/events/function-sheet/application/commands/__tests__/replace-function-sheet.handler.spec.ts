import {
  EventArchivedError,
  EventNotFoundError,
  FunctionSheetNotFoundError,
  FunctionSheetNotPdfError,
  FunctionSheetRetiredError,
} from "../../../../event/domain/errors/event-errors.js";
import {
  AT,
  declaredEvent,
  pdf,
} from "../../../../event/domain/entities/__tests__/event-fixtures.js";
import {
  ambient,
  FailingEventRepository,
  InMemoryEventRepository,
  InMemoryProductionStore,
} from "../../../../event/application/commands/__tests__/event-doubles.js";
import { ReplaceFunctionSheetCommand } from "../replace-function-sheet.command.js";
import { ReplaceFunctionSheetHandler } from "../replace-function-sheet.handler.js";

const NEWER_BYTES = Buffer.from("%PDF-1.7\n%v2\n", "latin1");

function setup(events = new InMemoryEventRepository()) {
  const event = declaredEvent();
  event.depositSheet({ sheetId: "s1", pdf: pdf("a.pdf"), uploadedBy: "staff_2", at: AT });
  events.saved.set(event.id, event);
  const store = new InMemoryProductionStore();
  const { clock, ids, uow, intents } = ambient();
  const replace = new ReplaceFunctionSheetHandler(events, store, ids, clock, uow, intents);
  return { events, event, store, replace };
}

function replaceCommand(
  eventId: string,
  sheetId = "s1",
  bytes: Buffer | null = NEWER_BYTES,
  key = "k1",
) {
  return new ReplaceFunctionSheetCommand(
    eventId,
    sheetId,
    bytes,
    "a-v2.pdf",
    "application/pdf",
    "staff_3",
    key,
  );
}

describe("ReplaceFunctionSheetHandler", () => {
  it("range la nouvelle version, archive l'ancienne sans toucher à son objet", async () => {
    const { events, event, store, replace } = setup();
    const id = await replace.execute(replaceCommand(event.id));
    const saved = events.saved.get(event.id);
    expect(saved?.activeSheets.map((s) => [s.id, s.position, s.replacesSheetId])).toEqual([
      [id, 0, "s1"],
    ]);
    expect(store.objects.get(`events/${event.id}/function-sheets/${id}.pdf`)?.bytes).toEqual(
      NEWER_BYTES,
    );
    expect(store.deleted).toEqual([]);
  });

  it("rejoué avec la même clé, ne range qu'une version", async () => {
    const { events, event, store, replace } = setup();
    const first = await replace.execute(replaceCommand(event.id));
    const second = await replace.execute(replaceCommand(event.id));
    expect(second).toBe(first);
    expect(events.saved.get(event.id)?.sheets).toHaveLength(2);
    expect(store.objects.size).toBe(1);
  });

  it("une autre clé sur la version remplacée est refusée : elle n'est plus en vigueur", async () => {
    const { event, store, replace } = setup();
    await replace.execute(replaceCommand(event.id));
    await expect(
      replace.execute(replaceCommand(event.id, "s1", NEWER_BYTES, "k2")),
    ).rejects.toThrow(FunctionSheetRetiredError);
    expect(store.objects.size).toBe(1);
  });

  it("🔴 refuse sur un événement archivé, AVANT de ranger quoi que ce soit", async () => {
    const { event, store, replace } = setup();
    event.archive(AT);
    await expect(replace.execute(replaceCommand(event.id))).rejects.toThrow(EventArchivedError);
    expect(store.objects.size).toBe(0);
  });

  it("refuse une fiche inconnue, sans rien ranger", async () => {
    const { event, store, replace } = setup();
    await expect(replace.execute(replaceCommand(event.id, "absente"))).rejects.toThrow(
      FunctionSheetNotFoundError,
    );
    expect(store.objects.size).toBe(0);
  });

  it("refuse un fichier qui n'est pas un PDF, sans rien ranger", async () => {
    const { event, store, replace } = setup();
    await expect(
      replace.execute(replaceCommand(event.id, "s1", Buffer.from("PK\u0003\u0004"))),
    ).rejects.toThrow(FunctionSheetNotPdfError);
    expect(store.objects.size).toBe(0);
  });

  it("404 sur un événement inconnu", async () => {
    const { replace } = setup();
    await expect(replace.execute(replaceCommand("absent"))).rejects.toThrow(EventNotFoundError);
  });

  it("retire l'objet neuf quand l'écriture en base échoue", async () => {
    const { event, store, replace } = setup(new FailingEventRepository());
    await expect(replace.execute(replaceCommand(event.id))).rejects.toThrow("base indisponible");
    expect(store.objects.size).toBe(0);
    expect(store.deleted).toHaveLength(1);
  });
});
