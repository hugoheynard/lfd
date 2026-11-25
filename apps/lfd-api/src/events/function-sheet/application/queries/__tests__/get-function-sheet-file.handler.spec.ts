import { InMemoryProductionStore } from "../../../../event/application/commands/__tests__/event-doubles.js";
import { PDF_BYTES } from "../../../../event/domain/entities/__tests__/event-fixtures.js";
import { FunctionSheetNotFoundError } from "../../../../event/domain/errors/event-errors.js";
import {
  FunctionSheetReader,
  type FunctionSheetLocation,
} from "../../../domain/ports/function-sheet.reader.js";
import { GetFunctionSheetFileHandler } from "../get-function-sheet-file.handler.js";
import { GetFunctionSheetFileQuery } from "../get-function-sheet-file.query.js";

class OneSheetReader extends FunctionSheetReader {
  constructor(private readonly found: FunctionSheetLocation | null) {
    super();
  }

  locate(): Promise<FunctionSheetLocation | null> {
    return Promise.resolve(this.found);
  }
}

describe("GetFunctionSheetFileHandler", () => {
  it("lit les octets au stockage sous la clé gardée en base", async () => {
    const store = new InMemoryProductionStore();
    await store.save("events/e/function-sheets/s.pdf", {
      bytes: PDF_BYTES,
      contentType: "application/pdf",
    });
    const reader = new OneSheetReader({
      fileName: "deroule.pdf",
      storageKey: "events/e/function-sheets/s.pdf",
      contentType: "application/pdf",
    });
    const file = await new GetFunctionSheetFileHandler(reader, store).execute(
      new GetFunctionSheetFileQuery("e", "s"),
    );
    expect(file).toEqual({
      fileName: "deroule.pdf",
      contentType: "application/pdf",
      bytes: PDF_BYTES,
    });
  });

  it("404 sur une fiche retirée ou inconnue", async () => {
    await expect(
      new GetFunctionSheetFileHandler(
        new OneSheetReader(null),
        new InMemoryProductionStore(),
      ).execute(new GetFunctionSheetFileQuery("e", "s")),
    ).rejects.toThrow(FunctionSheetNotFoundError);
  });
});
