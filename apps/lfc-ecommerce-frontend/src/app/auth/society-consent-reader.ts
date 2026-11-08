import type { SocietyConsentAnswer } from '@lfd/contracts';
// La valeur par l'entrée sans zod : la façade est chargée au démarrage.
import { MARKETING_CONSENT_TEXT_VERSIONS } from '@lfd/contracts/shop-values';

/** Les langues d'une case — celles du contrat, vérifiées par le compilateur. */
const CONSENT_LOCALES = [
  'fr',
  'en',
  'it',
] as const satisfies readonly SocietyConsentAnswer['locale'][];

function isConsentLocale(value: unknown): value is SocietyConsentAnswer['locale'] {
  return CONSENT_LOCALES.some((locale) => locale === value);
}

/**
 * Relit la réponse à la case des offres revenue de l'`appState` d'Auth0
 * (stockage du navigateur) : chaque champ vérifié, et seulement la version
 * COURANTE du texte — une réponse donnée à un autre texte ne se rejoue pas.
 * `undefined` sinon : rien d'écrit (une case vide n'est pas un refus).
 * Plan `documentation/mail/plan-desinscription-des-e-mails.md`, lot C2.
 */
export function readSocietyAnswer(value: unknown): SocietyConsentAnswer | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const accepted: unknown = Reflect.get(value, 'accepted');
  const textVersion: unknown = Reflect.get(value, 'textVersion');
  const locale: unknown = Reflect.get(value, 'locale');
  if (
    typeof accepted !== 'boolean' ||
    textVersion !== MARKETING_CONSENT_TEXT_VERSIONS.society ||
    !isConsentLocale(locale)
  ) {
    return undefined;
  }
  return { accepted, textVersion, locale };
}
