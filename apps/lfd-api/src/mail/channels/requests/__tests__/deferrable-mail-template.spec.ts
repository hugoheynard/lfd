import type { B2bMails } from "../../templates/b2b-mails.js";
import type { ByReference, DeferrableMailTemplate, ImmediateMailData } from "../mail.js";

/**
 * Les modèles que `send` refuse, figés par le compilateur : un `Record` sur
 * l'exclusion exige exactement ces clés, ni plus ni moins. Un modèle neuf qui
 * joindrait un PDF en base64 (ou un `Date`) fait échouer la compilation de ce
 * fichier — l'occasion de décider s'il doit passer au stockage d'abord.
 */
const NOT_DEFERRABLE: Record<Exclude<keyof B2bMails, DeferrableMailTemplate>, string> = {
  "staff.production-dossier":
    "le dossier du jour joint (pdfBase64) — envoyé par `sendAndAwaitReceipt` seulement (S2f)",
};

/**
 * La forme différée du bon joint : la référence au stockage à la place des
 * octets. Une affectation qui compile ; `pdfBase64` y serait une erreur.
 */
const PLACED_DOCUMENT: ByReference<B2bMails["customer.order-placed"]["document"]> = {
  fileName: "confirmation-de-commande-ORD-1.pdf",
  pdfStored: { store: "customer-documents", key: "orders/o-1/bon-de-commande-r0-d2.pdf" },
};

/**
 * Le mandat à signer, par la place où son envoyeur l'a rangé (revue, cas 7) :
 * la forme qu'un envoi immédiat accepte aussi.
 */
const MANDATE_DATA: ImmediateMailData<"customer.mandate-to-sign"> = {
  scheme: "CORE",
  companyName: "Le Refuge du Col",
  reference: "LFC-1",
  creditorIdentifier: "FR00ZZZ000000",
  creditorName: "La Folie Douce",
  fileName: "mandat.pdf",
  pdfStored: { store: "customer-documents", key: "mandates/cmp_1/mdt_1/i-1.pdf" },
};

/** La facture jointe, par la clé où le rendu Factur-X l'a rangée (S2d). */
const INVOICE_DOCUMENT: ByReference<B2bMails["customer.invoice-issued"]["document"]> = {
  fileName: "FA-LFD-2026-000001.pdf",
  pdfStored: { store: "customer-documents", key: "invoices/le_1/FA-LFD-2026-000001.pdf" },
};

describe("DeferrableMailTemplate — ce que la boîte d'envoi peut porter", () => {
  it("n'exclut plus que le dossier du fournil — le mandat passe par référence (revue, cas 7, 2026-11-06)", () => {
    expect(Object.keys(NOT_DEFERRABLE).sort()).toEqual(["staff.production-dossier"]);
  });

  it("ouvre `customer.mandate-to-sign`, son mandat passant par référence", () => {
    const opened: DeferrableMailTemplate = "customer.mandate-to-sign";
    expect(opened).toBe("customer.mandate-to-sign");
    expect(MANDATE_DATA).not.toHaveProperty("pdfBase64");
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
