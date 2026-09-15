import type { Buffer } from "node:buffer";

import type { CreditorSnapshot } from "../creditor-snapshot.js";
import type { DebtorSnapshot } from "../debtor-snapshot.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import { drawB2bMandate } from "./b2b-mandate-pdf.js";
import { drawCoreMandate } from "./core-mandate-pdf.js";
import {
  type Doc,
  type MandateDrawing,
  type MandateForm,
  type MandateIssuance,
  renderMandateDocument,
} from "./mandate-pdf-drawing.js";
import { SEPA_MANDATE_WORDING } from "./sepa-mandate-wording.js";

export type { MandateForm, MandateIssuance } from "./mandate-pdf-drawing.js";

/**
 * **Le mandat SEPA, prérempli de NOTRE côté** — l'aiguillage entre les deux
 * mises en page.
 *
 * ## 🔴 LE SCHÉMA CHOISIT LE DOCUMENT — depuis le 2026-09-15
 *
 * Jusqu'au 2026-09-14, ce fichier dessinait UN formulaire (la mise en page EPC
 * CORE) et y posait le texte d'un schéma global. Le schéma est désormais un
 * réglage de l'entité, figé sur chaque mandat à la frappe
 * (`documentation/b2b/plan-mandat-deux-schemas.md`) :
 *
 * - `CORE` → `core-mandate-pdf.ts`, le modèle EPC à zones numérotées ;
 * - `B2B` → `b2b-mandate-pdf.ts`, d'après le gabarit interentreprises DGFiP.
 *
 * L'aiguillage est une TABLE indexée par `SepaScheme`, pas un `switch` : un
 * troisième schéma sans sa mise en page ne compile pas.
 *
 * ## Ce qui vaut pour les deux, et qu'il ne faut pas défaire
 *
 * - **un seul paramètre, `issuance`, commande la RUM ET le filigrane** : il est
 *   inexprimable de retirer l'avertissement sans donner de référence ;
 * - **l'IBAN du créancier n'est jamais imprimé** : le seul IBAN d'un mandat est
 *   celui du débiteur, et le nôtre à sa place nous autoriserait à nous prélever ;
 * - **une page**, et **déterministe sans émission** : mêmes entrées, mêmes octets.
 */

type MandateLayout = (doc: Doc, drawing: MandateDrawing) => void;

const LAYOUTS: Readonly<Record<SepaScheme, MandateLayout>> = {
  CORE: drawCoreMandate,
  B2B: drawB2bMandate,
};

/**
 * Rend le mandat SEPA sous la forme demandée.
 *
 * `form` est la forme **du mandat** quand on imprime un brouillon frappé, et le
 * réglage de l'entité pour un exemplaire ou un aperçu sans brouillon — c'est à
 * l'appelant de choisir, parce que lui seul sait lequel il imprime.
 *
 * Prend le snapshot du créancier plutôt que l'agrégat : `creditorSnapshot()`
 * refuse de rendre une copie à qui n'a pas d'ICS, donc aucun mandat ne sort sans
 * identifiant créancier.
 *
 * 🔴 `issuance` commande **deux** choses d'un seul geste : la référence
 * imprimée, et la disparition du filigrane EXEMPLE.
 *
 * ⚠️ **Le rendu n'est déterministe que sans émission** : la RUM porte un tirage
 * et une date de frappe. Les tests qui comparent des octets visent le cas SANS
 * émission ; le cas avec s'éprouve sur le texte.
 *
 * @throws {MandateFieldTooLongError} une valeur déborde de son peigne (RUM au-delà
 *   de 26 caractères en CORE, de 35 en interentreprises ; IBAN, BIC, SIREN…).
 */
export async function renderSepaMandatePdf(
  form: MandateForm,
  creditor: CreditorSnapshot,
  logo: Buffer | null,
  debtor: DebtorSnapshot | null,
  issuance: MandateIssuance | null,
): Promise<Buffer> {
  const label = SEPA_MANDATE_WORDING[form.scheme].documentLabel;
  return renderMandateDocument(
    {
      title:
        issuance === null
          ? `${label} (exemple) - ${creditor.name}`
          : `${label} ${issuance.reference} - ${creditor.name}`,
      author: creditor.name,
    },
    (doc) => {
      LAYOUTS[form.scheme](doc, { form, creditor, logo, debtor, issuance });
    },
  );
}

/** Le nom proposé au téléchargement — lisible sur un bureau, pas une clé opaque. */
export function sampleMandateFileName(creditor: CreditorSnapshot): string {
  const slug = creditor.name
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/gu, "")
    .replace(/[^A-Za-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
  return `mandat-sepa-exemple-${slug}.pdf`;
}
