import { Buffer } from "node:buffer";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { pdfText } from "../../../../orders/domain/services/__tests__/pdf-text.js";
import {
  InHouseRecapDocumentNotKeptError,
  InHouseRecapNotFoundError,
} from "../../../domain/errors/in-house-recap-errors.js";
import { RecapMonth } from "../../../domain/value-objects/recap-month.js";
import { documentWorld, issuedRecap } from "../../__tests__/in-house-recap-document-doubles.js";
import { GetInHouseRecapDocumentHandler } from "../get-in-house-recap-document.handler.js";
import { GetInHouseRecapDocumentQuery } from "../get-in-house-recap-document.query.js";
import { GetInHouseRecapSpecimenHandler } from "../get-in-house-recap-specimen.handler.js";

describe("le PDF rangé d'un récapitulatif", () => {
  it("relit les octets rangés sous la clé du récapitulatif", async () => {
    const world = documentWorld();
    await world.recaps.save(issuedRecap());
    await world.keeper.ensure("recap-1");
    const handler = new GetInHouseRecapDocumentHandler(world.reader, world.store);

    const pdf = await handler.execute(new GetInHouseRecapDocumentQuery("recap-1"));

    expect(pdf.fileName).toBe("RBL-202610-0001.pdf");
    expect(Buffer.from(pdf.bytes).toString("latin1", 0, 5)).toBe("%PDF-");
  });

  it("404 nommé tant qu'il n'est pas rangé, et pour un récapitulatif inconnu", async () => {
    const world = documentWorld();
    await world.recaps.save(issuedRecap());
    const handler = new GetInHouseRecapDocumentHandler(world.reader, world.store);

    await expect(handler.execute(new GetInHouseRecapDocumentQuery("recap-1"))).rejects.toThrow(
      InHouseRecapDocumentNotKeptError,
    );
    await expect(handler.execute(new GetInHouseRecapDocumentQuery("absent"))).rejects.toThrow(
      InHouseRecapNotFoundError,
    );
  });
});

describe("le récapitulatif d'exemple de la planche", () => {
  it("porte le dernier mois clos de l'horloge, un rectificatif, et le filigrane", async () => {
    const now = new Date("2026-11-20T10:00:00.000Z");
    const handler = new GetInHouseRecapSpecimenHandler(new FixedClock(now));

    const pdf = await handler.execute();
    const month = RecapMonth.lastClosedAt(now).key.replace("-", "");

    expect(pdf.fileName).toBe(`exemple-RBL-${month}-0002.pdf`);
    const text = pdfText(pdf.bytes);
    expect(text).toContain("EXEMPLE");
    expect(text).toContain(`remplace le récapitulatif RBL-${month}-0001`);
  });
});
