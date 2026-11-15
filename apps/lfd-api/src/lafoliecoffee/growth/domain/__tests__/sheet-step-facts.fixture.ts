import type { SheetStepFacts } from "../sheet-steps.js";

/** Une fiche au nom seul, à la commande, sans RIB ni mandat ni commande, jamais contactée. */
export const BARE_STEP_FACTS: SheetStepFacts = {
  legal: {
    raisonSociale: "",
    formeJuridique: "",
    siret: "",
    vatNumber: "",
    primaryPhone: "",
    otherPhones: [],
  },
  kbis: { uploadedAt: null, certifiedAt: null },
  terms: { granted: [], requested: null },
  collection: { rhythm: "monthly", means: "sepa_debit" },
  hasBankAccount: false,
  hasActiveMandate: false,
  directDebitBlocked: false,
  orderCount: 0,
  lastContactDay: null,
};
