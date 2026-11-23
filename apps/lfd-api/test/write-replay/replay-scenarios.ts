import { ACCOUNT_SCENARIOS } from "./account-scenarios.js";
import { ACCOUNTING_SCENARIOS } from "./accounting-scenarios.js";
import { CARD_PAYMENT_SCENARIOS } from "./card-payment-scenarios.js";
import { COMMERCE_SCENARIOS } from "./commerce-scenarios.js";
import { CONTACT_SCENARIOS } from "./contact-scenarios.js";
import { COUNTER_SCENARIOS } from "./counter-scenarios.js";
import { DOCUMENTS_SCENARIOS } from "./documents-scenarios.js";
import { GROWTH_SCENARIOS } from "./growth-scenarios.js";
import { IDENTITY_SCENARIOS } from "./identity-scenarios.js";
import { MAIL_SCENARIOS } from "./mail-scenarios.js";
import { MEDIA_VITRINE_SCENARIOS } from "./media-vitrine-scenarios.js";
import { PAYMENTS_SCENARIOS } from "./payments-scenarios.js";
import { OPS_SCENARIOS } from "./ops-scenarios.js";
import { PACKING_SCENARIOS } from "./packing-scenarios.js";
import { PIM_SCENARIOS } from "./pim-scenarios.js";
import { PRICING_SCENARIOS } from "./pricing-scenarios.js";
import { PRODUCTION_SCENARIOS } from "./production-scenarios.js";
import { REPORTING_SCENARIOS } from "./reporting-scenarios.js";
import { REVIEW_SCENARIOS } from "./review-scenarios.js";
import type { ScenarioSet } from "./scenario.js";
import { SETTINGS_SCENARIOS } from "./settings-scenarios.js";

/**
 * Le registre des scénarios du rejeu, par `fichier#méthode` du contrôleur.
 * Un bloc, un fichier de scénarios : chacun reste lisible et sous 300 lignes.
 */
export const REPLAY_SCENARIOS: ScenarioSet = {
  ...ACCOUNT_SCENARIOS,
  ...ACCOUNTING_SCENARIOS,
  ...CARD_PAYMENT_SCENARIOS,
  ...IDENTITY_SCENARIOS,
  ...MAIL_SCENARIOS,
  ...MEDIA_VITRINE_SCENARIOS,
  ...PAYMENTS_SCENARIOS,
  ...COMMERCE_SCENARIOS,
  ...CONTACT_SCENARIOS,
  ...COUNTER_SCENARIOS,
  ...DOCUMENTS_SCENARIOS,
  ...GROWTH_SCENARIOS,
  ...OPS_SCENARIOS,
  ...PACKING_SCENARIOS,
  ...PIM_SCENARIOS,
  ...PRICING_SCENARIOS,
  ...PRODUCTION_SCENARIOS,
  ...REPORTING_SCENARIOS,
  ...REVIEW_SCENARIOS,
  ...SETTINGS_SCENARIOS,
};
