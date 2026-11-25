import { EventArchivedError, FunctionSheetNotFoundError } from "../../errors/event-errors.js";
import { EventDate } from "../../value-objects/event-date.js";
import { EventName } from "../../value-objects/event-name.js";
import { Event } from "../event.js";
import { AT, declaredEvent, LATER, pdf } from "./event-fixtures.js";

describe("Event.declare", () => {
  it("sort en vigueur, sans fiche, avec son auteur et ses applications", () => {
    const event = declaredEvent();
    expect(event.archivedAt).toBeNull();
    expect(event.sheets).toEqual([]);
    expect(event.createdBy).toBe("staff_1");
    expect(event.concerns("lafoliecoffee")).toBe(true);
    expect(event.updatedAt).toBe(AT);
  });
});

describe("Event.rename / reschedule", () => {
  it("change le nom et la date, et marque l'heure du geste", () => {
    const event = declaredEvent();
    event.rename(EventName.of("Mariage Dupont"), LATER);
    event.reschedule(EventDate.fromString("2026-12-06"), LATER);
    expect(event.name.value).toBe("Mariage Dupont");
    expect(event.date.value).toBe("2026-12-06");
    expect(event.updatedAt).toBe(LATER);
  });

  it("refuse de modifier un événement archivé", () => {
    const event = declaredEvent();
    event.archive(LATER);
    expect(() => event.rename(EventName.of("Autre"), LATER)).toThrow(EventArchivedError);
    expect(() => event.reschedule(EventDate.fromString("2026-12-07"), LATER)).toThrow(
      EventArchivedError,
    );
  });
});

describe("Event.archive", () => {
  it("rejoué, garde l'heure du premier archivage", () => {
    const event = declaredEvent();
    event.archive(AT);
    event.archive(LATER);
    expect(event.archivedAt).toBe(AT);
  });
});

describe("Event.depositSheet", () => {
  it("range les fiches à la suite, sous une clé composée de leurs identifiants", () => {
    const event = declaredEvent();
    const first = event.depositSheet({
      sheetId: "s1",
      pdf: pdf("a.pdf"),
      uploadedBy: "staff_2",
      at: AT,
    });
    const second = event.depositSheet({
      sheetId: "s2",
      pdf: pdf("b.pdf"),
      uploadedBy: "staff_2",
      at: LATER,
    });
    expect([first.position, second.position]).toEqual([0, 1]);
    expect(first.storageKey).toBe("events/evt_1/function-sheets/s1.pdf");
    expect(first).toMatchObject({
      fileName: "a.pdf",
      contentType: "application/pdf",
      uploadedBy: "staff_2",
    });
    expect(event.activeSheets.map((sheet) => sheet.id)).toEqual(["s1", "s2"]);
    expect(event.updatedAt).toBe(LATER);
  });

  it("🔴 refuse un dépôt sur un événement archivé", () => {
    const event = declaredEvent();
    event.archive(AT);
    expect(() =>
      event.depositSheet({ sheetId: "s1", pdf: pdf(), uploadedBy: "staff_2", at: LATER }),
    ).toThrow(EventArchivedError);
    expect(event.sheets).toEqual([]);
  });

  it("ne réattribue jamais le rang d'une fiche retirée", () => {
    const event = declaredEvent();
    event.depositSheet({ sheetId: "s1", pdf: pdf(), uploadedBy: "staff_2", at: AT });
    event.archiveSheet("s1", AT);
    const next = event.depositSheet({
      sheetId: "s2",
      pdf: pdf(),
      uploadedBy: "staff_2",
      at: LATER,
    });
    expect(next.position).toBe(1);
  });
});

describe("Event.archiveSheet", () => {
  it("retire la fiche des fiches en vigueur sans l'effacer, et rejoué ne change rien", () => {
    const event = declaredEvent();
    event.depositSheet({ sheetId: "s1", pdf: pdf(), uploadedBy: "staff_2", at: AT });
    event.archiveSheet("s1", AT);
    event.archiveSheet("s1", LATER);
    expect(event.activeSheets).toEqual([]);
    expect(event.sheets[0]?.archivedAt).toBe(AT);
  });

  it("refuse une fiche qui n'est pas de cet événement", () => {
    expect(() => declaredEvent().archiveSheet("ailleurs", AT)).toThrow(FunctionSheetNotFoundError);
  });

  it("refuse le retrait sur un événement archivé", () => {
    const event = declaredEvent();
    event.depositSheet({ sheetId: "s1", pdf: pdf(), uploadedBy: "staff_2", at: AT });
    event.archive(AT);
    expect(() => event.archiveSheet("s1", LATER)).toThrow(EventArchivedError);
  });
});

describe("Event.rehydrate", () => {
  it("rend les fiches dans l'ordre de leur rang, quel que soit l'ordre lu", () => {
    const source = declaredEvent();
    const sheet = (id: string, position: number) => ({
      id,
      fileName: `${id}.pdf`,
      storageKey: `k/${id}`,
      contentType: "application/pdf",
      sizeBytes: 10,
      position,
      uploadedBy: "staff_2",
      uploadedAt: AT,
      archivedAt: null,
      replacesSheetId: null,
    });
    const event = Event.rehydrate({
      id: source.id,
      name: source.name,
      date: source.date,
      applications: source.applications,
      archivedAt: null,
      createdBy: "staff_1",
      createdAt: AT,
      updatedAt: AT,
      sheets: [sheet("b", 1), sheet("a", 0)],
    });
    expect(event.sheets.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
