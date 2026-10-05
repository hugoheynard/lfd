import type { PaymentMandate } from "../entities/payment-mandate.js";

/**
 * Les mandats qu'un site porte au nom d'un autre débiteur (`plan-sous-comptes.md`
 * §2.1 ter). Un port à part de `PaymentMandateRepository` (ISP) : seule la
 * révocation d'un suivi `billing` le lit, et le dépôt n'a pas à grossir pour
 * elle.
 */
export abstract class SiteMandatesReader {
  /** Les mandats ACTIFS ou en BROUILLON de `siteId` qui nomment `debtorCompanyId`. */
  abstract revocableNaming(
    siteId: string,
    debtorCompanyId: string,
  ): Promise<readonly PaymentMandate[]>;
}
