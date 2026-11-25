import {
  EventArchivedError,
  FunctionSheetNotFoundError,
  FunctionSheetRetiredError,
} from "../../errors/event-errors.js";
import { AT, declaredEvent, LATER, pdf } from "./event-fixtures.js";

function withTwoSheets() {
  const event = declaredEvent();
  event.depositSheet({ sheetId: "s1", pdf: pdf("a.pdf"), uploadedBy: "staff_2", at: AT });
  event.depositSheet({ sheetId: "s2", pdf: pdf("b.pdf"), uploadedBy: "staff_2", at: AT });
  return event;
}

const newer = (sheetId = "s3") => ({
  sheetId,
  pdf: pdf("a-v2.pdf"),
  uploadedBy: "staff_3",
  at: LATER,
});

describe("Event.replaceSheet", () => {
  it("archive l'ancienne et donne son rang à la nouvelle, qui dit qui elle remplace", () => {
    const event = withTwoSheets();
    const sheet = event.replaceSheet("s1", newer());

    expect(sheet.position).toBe(0);
    expect(sheet.replacesSheetId).toBe("s1");
    expect(sheet.storageKey).toBe(`events/${event.id}/function-sheets/s3.pdf`);
    expect(event.activeSheets.map((s) => s.id)).toEqual(["s3", "s2"]);
    const old = event.sheets.find((s) => s.id === "s1");
    expect(old?.archivedAt).toEqual(LATER);
    expect(old?.storageKey).toBe(`events/${event.id}/function-sheets/s1.pdf`);
    expect(event.updatedAt).toEqual(LATER);
  });

  it("un dépôt neuf après un remplacement prend toujours le plus haut rang + 1", () => {
    const event = withTwoSheets();
    event.replaceSheet("s1", newer());
    const fresh = event.depositSheet({
      sheetId: "s4",
      pdf: pdf(),
      uploadedBy: "staff_2",
      at: LATER,
    });
    expect(fresh.position).toBe(2);
    expect(fresh.replacesSheetId).toBeNull();
  });

  it("🔴 refuse sur un événement archivé", () => {
    const event = withTwoSheets();
    event.archive(LATER);
    expect(() => event.replaceSheet("s1", newer())).toThrow(EventArchivedError);
    expect(event.activeSheets).toHaveLength(2);
  });

  it("refuse une fiche qui n'est pas de cet événement", () => {
    const event = withTwoSheets();
    expect(() => event.replaceSheet("absente", newer())).toThrow(FunctionSheetNotFoundError);
  });

  it("refuse une fiche retirée, sans rien ajouter", () => {
    const event = withTwoSheets();
    event.archiveSheet("s1", LATER);
    expect(() => event.replaceSheet("s1", newer())).toThrow(FunctionSheetRetiredError);
    expect(event.sheets).toHaveLength(2);
  });

  it("refuse de remplacer deux fois la même version : seule la plus récente est en vigueur", () => {
    const event = withTwoSheets();
    event.replaceSheet("s1", newer("s3"));
    expect(() => event.replaceSheet("s1", newer("s4"))).toThrow(FunctionSheetRetiredError);
    expect(event.replaceSheet("s3", newer("s4")).position).toBe(0);
  });
});
