import { Buffer } from "node:buffer";

import type { ClientSheet } from "@lfd/contracts";

import { OrderSheetLogoUnavailableError } from "../../../domain/errors/order-sheet-logo-unavailable.error.js";
import { sheet } from "../../../domain/services/__tests__/client-sheet.fixture.js";
import { OrderSheetArchive } from "../order-sheet-archive.service.js";
import {
  FixedLogo,
  FixedSheetOrigins,
  MemoryCustomerDocuments,
  MissingLogo,
} from "./order-sheet-doubles.js";

/**
 * L'archive du bon (plan `documentation/order/plan-bon-public.md`, §2.3, §5) :
 * la clé du nouveau dessin, la relecture, et le QR qui n'entre que par elle.
 */

const TOKEN = "tok_secret_42";

function archiveOf(
  options: { readonly admin?: string | null; readonly documents?: MemoryCustomerDocuments } = {},
): { readonly archive: OrderSheetArchive; readonly documents: MemoryCustomerDocuments } {
  const documents = options.documents ?? new MemoryCustomerDocuments();
  const archive = new OrderSheetArchive(
    documents,
    new FixedLogo(),
    new FixedSheetOrigins(options.admin === undefined ? "https://admin.lfc.test" : options.admin),
  );
  return { archive, documents };
}

const delivery = (): ClientSheet =>
  sheet({ fulfillment: { ...sheet().fulfillment, method: "delivery" } });

describe("l'archive du bon de commande", () => {
  it("range le nouveau dessin sous SA clé — l'ancienne n'est plus relue", async () => {
    const documents = new MemoryCustomerDocuments();
    // Un bon d'avant le 2026-10-09, sous la clé sans version de dessin.
    documents.objects.set("orders/ord_1/bon-de-commande-r0.pdf", {
      bytes: Buffer.from("ancien dessin"),
      contentType: "application/pdf",
    });
    const { archive } = archiveOf({ documents });

    const pdf = await archive.pdfOf(sheet(), TOKEN);

    expect(pdf.bytes.toString("latin1").startsWith("%PDF-")).toBe(true);
    expect([...documents.objects.keys()]).toContain("orders/ord_1/bon-de-commande-r0-d2.pdf");
    // L'ancien reste en stockage : aucune suppression.
    expect(documents.objects.has("orders/ord_1/bon-de-commande-r0.pdf")).toBe(true);
  });

  it("relit l'archive au second appel, octets compris", async () => {
    const { archive } = archiveOf();

    const first = await archive.pdfOf(sheet(), TOKEN);
    const second = await archive.pdfOf(sheet(), TOKEN);

    expect(second.bytes.equals(first.bytes)).toBe(true);
  });

  it("dessine le QR en retrait avec jeton : les octets diffèrent d'un bon sans jeton", async () => {
    const withToken = await archiveOf().archive.pdfOf(sheet(), TOKEN);
    const withoutToken = await archiveOf().archive.pdfOf(sheet(), null);

    expect(withToken.bytes.equals(withoutToken.bytes)).toBe(false);
  });

  it("ne dessine PAS de QR en livraison, même avec un jeton", async () => {
    const withToken = await archiveOf().archive.pdfOf(delivery(), TOKEN);
    const withoutToken = await archiveOf().archive.pdfOf(delivery(), null);

    expect(withToken.bytes.equals(withoutToken.bytes)).toBe(true);
  });

  it("rend un bon SANS QR quand l'origine admin manque", async () => {
    const noOrigin = await archiveOf({ admin: null }).archive.pdfOf(sheet(), TOKEN);
    const withoutToken = await archiveOf().archive.pdfOf(sheet(), null);

    expect(noOrigin.bytes.equals(withoutToken.bytes)).toBe(true);
  });

  it("lève une erreur technique nommée quand le logo manque", async () => {
    const archive = new OrderSheetArchive(
      new MemoryCustomerDocuments(),
      new MissingLogo(),
      new FixedSheetOrigins(null),
    );

    await expect(archive.pdfOf(sheet(), null)).rejects.toBeInstanceOf(
      OrderSheetLogoUnavailableError,
    );
  });
});
