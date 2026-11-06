import type { B2bMails } from "../../../../platform/mailer/mail-templates.js";
import type { DeferrableMailTemplate } from "../mail-requests.js";

/**
 * Les modèles que `request` refuse, figés par le compilateur : un `Record` sur
 * l'exclusion exige exactement ces clés, ni plus ni moins. Un modèle neuf qui
 * joindrait un PDF en base64 (ou un `Date`) fait échouer la compilation de ce
 * fichier — l'occasion de décider s'il doit passer au stockage d'abord.
 */
const NOT_DEFERRABLE: Record<Exclude<keyof B2bMails, DeferrableMailTemplate>, string> = {
  "customer.order-placed": "le bon de commande joint (document.pdfBase64)",
  "customer.invoice-issued": "la facture jointe (document.pdfBase64)",
  "customer.mandate-to-sign": "le mandat joint (pdfBase64)",
  "staff.production-dossier": "le dossier du jour joint (pdfBase64)",
};

describe("DeferrableMailTemplate — ce que la boîte d'envoi peut porter", () => {
  it("exclut les quatre modèles qui joignent un PDF en base64 (2026-11-06)", () => {
    expect(Object.keys(NOT_DEFERRABLE).sort()).toEqual([
      "customer.invoice-issued",
      "customer.mandate-to-sign",
      "customer.order-placed",
      "staff.production-dossier",
    ]);
  });
});
