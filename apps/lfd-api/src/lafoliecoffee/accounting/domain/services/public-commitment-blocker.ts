import type { CommitmentTiming } from "@lfd/contracts";

import type { InvoiceIssuanceBlocker } from "./invoice-issuance-blockers.js";
import type { InvoiceBudgetCommitment } from "../value-objects/invoice-budget-commitment.js";

/**
 * Ce que la fiche Chorus d'un payeur public exige sur ses factures. `null`
 * pour un payeur sans fiche (tout payeur privé).
 */
export interface PayerCommitmentRequirement {
  readonly commitmentRequired: boolean;
  readonly serviceCodeRequired: boolean;
}

/**
 * La fiche Chorus d'un payeur public telle que la clôture la lit : ce qu'elle
 * exige, et **quand le numéro arrive** (plan `plan-clients-publics-chorus.md`,
 * § 6 sexies, v5 B4). En `on_period_quote`, la clôture range les commandes
 * sans numéro dans un devis (`splitForPeriodQuotes`) au lieu d'en émettre la
 * facture : le filet ci-dessous ne les juge donc jamais.
 */
export interface PayerCommitmentSheet extends PayerCommitmentRequirement {
  readonly timing: CommitmentTiming;
}

/**
 * **Le filet de l'engagement à l'émission** (E7) : la passation refuse déjà
 * une commande sans le numéro (ou le code) que le payeur exige ; ce motif
 * couvre la fiche Chorus posée ou durcie après la commande, et tout chemin
 * qui l'aurait oublié. Une facture découpée par engagement n'en porte qu'un :
 * il suffit de juger le sien.
 */
export function publicCommitmentBlockers(
  payerName: string,
  requirement: PayerCommitmentRequirement | null,
  commitment: InvoiceBudgetCommitment | null,
  orderReferences: readonly string[],
): readonly InvoiceIssuanceBlocker[] {
  if (requirement === null) {
    return [];
  }
  const missing: string[] = [];
  if (requirement.commitmentRequired && (commitment?.number ?? "") === "") {
    missing.push("le numéro d'engagement");
  }
  if (requirement.serviceCodeRequired && (commitment?.serviceCode ?? "") === "") {
    missing.push("le code service");
  }
  if (missing.length === 0) {
    return [];
  }
  return [
    {
      code: "public_commitment_missing",
      message:
        `Le client « ${payerName} » exige ${missing.join(" et ")} sur ses factures (fiche ` +
        `Chorus Pro), et ${orderReferences.length > 1 ? "les bons" : "le bon"} ` +
        `${orderReferences.join(", ")} n'en ${orderReferences.length > 1 ? "portent" : "porte"} pas : ` +
        "corrigez l'engagement de chaque commande (fiche commande, « Engagement budgétaire »), " +
        "puis relancez la facture.",
    },
  ];
}
