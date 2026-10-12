import type { BillingRhythmSetting } from "../value-objects/billing-rhythm-setting.js";

/**
 * Le **rythme de facturation réglé sur une entité** (R2), tel que la facture
 * par clôture le lit (R3) : le rythme en vigueur et le programmé.
 *
 * Un port à part de `LegalEntityRepository` (ISP, et pour que la facturation
 * ne reçoive pas un agrégat qu'elle pourrait muter) : le réglage rendu est un
 * value object immuable, dont seul `rhythmAt` sert ici.
 */
export abstract class BillingRhythmReader {
  /** Le réglage de l'entité, ou `null` si elle n'existe pas. */
  abstract settingOf(legalEntityId: string): Promise<BillingRhythmSetting | null>;
}
