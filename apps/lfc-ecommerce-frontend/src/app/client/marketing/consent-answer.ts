// Types seulement depuis le baril ; les VALEURS viennent de l'entrée sans zod
// (budget `cloudflare` : une valeur du baril au démarrage embarque zod).
import type { SocietyConsentAnswer } from '@lfd/contracts';
import { MARKETING_CONSENT_TEXT_VERSIONS } from '@lfd/contracts/shop-values';

import type { LocaleCode } from '../client-locale.service';
import type { MarketingConsentCopy } from '../copy/screens/marketing-consent.copy';

type TextVersions = typeof MARKETING_CONSENT_TEXT_VERSIONS;
type CurrentVersion = TextVersions[keyof TextVersions];

/**
 * **La clé du dictionnaire qui porte le texte de chaque version COURANTE.**
 *
 * 🔴 C'est ce qui tient « le texte affiché est celui de la version envoyée » :
 * une version publiée de plus au contrat (`society.v2`) casse la compilation
 * ici tant qu'aucun texte ne la porte. Plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, règles 10 et 18.
 */
export const CONSENT_TEXT_KEY = {
  'society.v1': 'societyV1',
  'partners.v1': 'partnersV1',
  'newsletter.v1': 'newsletterV1',
} as const satisfies Record<CurrentVersion, keyof MarketingConsentCopy>;

/** Le texte affiché d'une case : celui de la version que la réponse enverra. */
export function consentText(copy: MarketingConsentCopy, box: keyof TextVersions): string {
  return copy[CONSENT_TEXT_KEY[MARKETING_CONSENT_TEXT_VERSIONS[box]]];
}

/** La réponse à la case de la société, telle que l'inscription et la commande l'envoient. */
export function societyAnswer(accepted: boolean, locale: LocaleCode): SocietyConsentAnswer {
  return { accepted, textVersion: MARKETING_CONSENT_TEXT_VERSIONS.society, locale };
}
