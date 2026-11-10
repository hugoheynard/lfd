import { InvalidBatchIdError } from "../../errors/collection-errors.js";
import { MAX_LINE_RANK, batchSepaIdentifiers } from "../collection-identifiers.js";
import { BATCH_ID } from "./collection-fixtures.js";

describe("les références SEPA d'un lot — format arrêté", () => {
  it("dérive MsgId, PmtInfId et EndToEndId de l'ULID du lot, sous 35 caractères", () => {
    const ids = batchSepaIdentifiers(BATCH_ID);

    expect(ids.messageId).toBe(BATCH_ID);
    expect(ids.paymentInfoIdOf("RCUR")).toBe(`${BATCH_ID}-RCUR`);
    expect(ids.endToEndIdOf(7)).toBe(`${BATCH_ID}-0007`);
    expect(ids.endToEndIdOf(MAX_LINE_RANK).length).toBeLessThanOrEqual(35);
  });

  it("deux lots, deux MsgId : un lot reconstitué ne réemploie rien", () => {
    const other = "01JBQ7Z5K8M3QT9P2X4BZZZZZY";

    expect(batchSepaIdentifiers(other).messageId).not.toBe(
      batchSepaIdentifiers(BATCH_ID).messageId,
    );
    expect(batchSepaIdentifiers(other).endToEndIdOf(1)).not.toBe(
      batchSepaIdentifiers(BATCH_ID).endToEndIdOf(1),
    );
  });

  it("refuse un identifiant qui n'est pas un ULID, et un rang hors format", () => {
    expect(() => batchSepaIdentifiers("id_000001")).toThrow(InvalidBatchIdError);
    expect(() => batchSepaIdentifiers(BATCH_ID).endToEndIdOf(0)).toThrow(InvalidBatchIdError);
    expect(() => batchSepaIdentifiers(BATCH_ID).endToEndIdOf(MAX_LINE_RANK + 1)).toThrow(
      InvalidBatchIdError,
    );
  });
});
