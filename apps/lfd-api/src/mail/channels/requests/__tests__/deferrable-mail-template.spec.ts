import type { B2bMails } from "../../templates/b2b-mails.js";
import type { ByReference, DeferrableMailTemplate } from "../mail-requests.js";

/**
 * Les modèles que `request` refuse, figés par le compilateur : un `Record` sur
 * l'exclusion exige exactement ces clés, ni plus ni moins. Un modèle neuf qui
 * joindrait un PDF en base64 (ou un `Date`) fait échouer la compilation de ce
 * fichier — l'occasion de décider s'il doit passer au stockage d'abord.
 */
const NOT_DEFERRABLE: Record<Exclude<keyof B2bMails, DeferrableMailTemplate>, string> = {
  "customer.mandate-to-sign": "le mandat joint (pdfBase64) — envoyé par `sendNow` seulement (S2e)",
  "staff.production-dossier":
    "le dossier du jour joint (pdfBase64) — envoyé par `sendNow` seulement (S2f)",
};

/**
 * La forme différée du bon joint : la référence au stockage à la place des
 * octets. Une affectation qui compile ; `pdfBase64` y serait une erreur.
 */
const PLACED_DOCUMENT: ByReference<B2bMails["customer.order-placed"]["document"]> = {
  fileName: "confirmation-de-commande-ORD-1.pdf",
  pdfStored: { store: "customer-documents", key: "orders/o-1/bon-de-commande-r0-d2.pdf" },
};

/** La facture jointe, par la clé où le rendu Factur-X l'a rangée (S2d). */
const INVOICE_DOCUMENT: ByReference<B2bMails["customer.invoice-issued"]["document"]> = {
  fileName: "FA-LFD-2026-000001.pdf",
  pdfStored: { store: "customer-documents", key: "invoices/le_1/FA-LFD-2026-000001.pdf" },
};

describe("DeferrableMailTemplate — ce que la boîte d'envoi peut porter", () => {
  it("exclut les deux modèles à PDF non ouverts par référence — le mandat reste en `sendNow` (S2e, 2026-11-06)", () => {
    expect(Object.keys(NOT_DEFERRABLE).sort()).toEqual([
      "customer.mandate-to-sign",
      "staff.production-dossier",
    ]);
  });

  it("ouvre `customer.order-placed`, son bon passant par référence", () => {
    const opened: DeferrableMailTemplate = "customer.order-placed";
    expect(opened).toBe("customer.order-placed");
    expect(PLACED_DOCUMENT).not.toHaveProperty("pdfBase64");
  });

  it("ouvre `customer.invoice-issued`, sa facture passant par référence", () => {
    const opened: DeferrableMailTemplate = "customer.invoice-issued";
    expect(opened).toBe("customer.invoice-issued");
    expect(INVOICE_DOCUMENT).not.toHaveProperty("pdfBase64");
  });
});
