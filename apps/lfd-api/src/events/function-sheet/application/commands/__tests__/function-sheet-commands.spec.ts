import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import {
  EventArchivedError,
  EventNotFoundError,
  FunctionSheetNotPdfError,
} from "../../../../event/domain/errors/event-errors.js";
import {
  declaredEvent,
  PDF_BYTES,
} from "../../../../event/domain/entities/__tests__/event-fixtures.js";
import {
  ambient,
  FailingEventRepository,
  InMemoryEventRepository,
  InMemoryProductionStore,
} from "../../../../event/application/commands/__tests__/event-doubles.js";
import { ArchiveFunctionSheetCommand } from "../archive-function-sheet.command.js";
import { ArchiveFunctionSheetHandler } from "../archive-function-sheet.handler.js";
import { DepositFunctionSheetCommand } from "../deposit-function-sheet.command.js";
import { DepositFunctionSheetHandler } from "../deposit-function-sheet.handler.js";

function setup(events = new InMemoryEventRepository()) {
  const event = declaredEvent();
  events.saved.set(event.id, event);
  const store = new InMemoryProductionStore();
  const { clock, ids, uow, intents } = ambient();
  const deposit = new DepositFunctionSheetHandler(events, store, ids, clock, uow, intents);
  const archive = new ArchiveFunctionSheetHandler(events, clock, new DirectUnitOfWork());
  return { events, event, store, deposit, archive };
}

function depositCommand(
  eventId: string,
  bytes: Buffer | null = PDF_BYTES,
  type = "application/pdf",
  key = "k1",
) {
  return new DepositFunctionSheetCommand(eventId, bytes, "deroule.pdf", type, "staff_2", key);
}

describe("DepositFunctionSheetHandler", () => {
  it("range le PDF au stockage du fournil, puis la fiche sur l'événement", async () => {
    const { events, event, store, deposit } = setup();
    const id = await deposit.execute(depositCommand(event.id));
    const sheet = events.saved.get(event.id)?.activeSheets[0];
    expect(sheet?.id).toBe(id);
    expect(sheet?.uploadedBy).toBe("staff_2");
    expect(store.objects.get(`events/${event.id}/function-sheets/${id}.pdf`)).toEqual({
      bytes: PDF_BYTES,
      contentType: "application/pdf",
    });
  });

  it("rejoué avec la même clé, ne range qu'une fiche", async () => {
    const { events, event, store, deposit } = setup();
    const first = await deposit.execute(depositCommand(event.id));
    const second = await deposit.execute(depositCommand(event.id));
    expect(second).toBe(first);
    expect(events.saved.get(event.id)?.activeSheets).toHaveLength(1);
    expect(store.objects.size).toBe(1);
  });

  it("🔴 refuse sur un événement archivé, AVANT de ranger quoi que ce soit", async () => {
    const { event, store, deposit } = setup();
    event.archive(event.createdAt);
    await expect(deposit.execute(depositCommand(event.id))).rejects.toThrow(EventArchivedError);
    expect(store.objects.size).toBe(0);
  });

  it("refuse un fichier qui n'est pas un PDF, sans rien ranger", async () => {
    const { event, store, deposit } = setup();
    await expect(
      deposit.execute(depositCommand(event.id, Buffer.from("PK\u0003\u0004"), "application/pdf")),
    ).rejects.toThrow(FunctionSheetNotPdfError);
    expect(store.objects.size).toBe(0);
  });

  it("404 sur un événement inconnu", async () => {
    const { deposit } = setup();
    await expect(deposit.execute(depositCommand("absent"))).rejects.toThrow(EventNotFoundError);
  });

  it("retire l'objet rangé quand l'écriture en base échoue", async () => {
    const { event, store, deposit } = setup(new FailingEventRepository());
    await expect(deposit.execute(depositCommand(event.id))).rejects.toThrow("base indisponible");
    expect(store.objects.size).toBe(0);
    expect(store.deleted).toHaveLength(1);
  });
});

describe("ArchiveFunctionSheetHandler", () => {
  it("retire la fiche sans toucher au stockage, et rejoué ne change rien", async () => {
    const { events, event, store, deposit, archive } = setup();
    const id = await deposit.execute(depositCommand(event.id));
    await archive.execute(new ArchiveFunctionSheetCommand(event.id, id));
    await archive.execute(new ArchiveFunctionSheetCommand(event.id, id));
    expect(events.saved.get(event.id)?.activeSheets).toEqual([]);
    expect(store.deleted).toEqual([]);
  });

  it("404 sur un événement inconnu", async () => {
    const { archive } = setup();
    await expect(archive.execute(new ArchiveFunctionSheetCommand("absent", "s"))).rejects.toThrow(
      EventNotFoundError,
    );
  });
});
