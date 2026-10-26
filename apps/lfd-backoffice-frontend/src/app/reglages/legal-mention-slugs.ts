import type { LegalMention } from '@lfd/contracts';
import { legalMentionLabels, legalMentionOrder } from '@lfd/contracts/content-values';

/**
 * Le segment d'adresse de chaque mention légale sous `/reglages/legal/` —
 * français et stable : il vit dans des favoris (Hugo, 2026-10-15).
 *
 * Un `Record` sur le vocabulaire et non une liste : une mention ajoutée au
 * contrat ne compile pas tant qu'elle n'a pas son segment. Le sens inverse est
 * DÉRIVÉ de cette table, jamais recopié.
 */
export const LEGAL_MENTION_SLUGS: Readonly<Record<LegalMention, string>> = {
  legalNotice: 'mentions-legales',
  salesTerms: 'cgv',
  privacy: 'confidentialite',
  cookies: 'cookies',
  accessibility: 'accessibilite',
  termsOfUse: 'cgu',
};

/** L'adresse absolue de l'écran d'une mention. */
export function legalMentionLink(mention: LegalMention): string {
  return `/reglages/legal/${LEGAL_MENTION_SLUGS[mention]}`;
}

/** La mention qu'un segment désigne, ou `null` s'il n'en désigne aucune. */
export function legalMentionOfSlug(slug: string): LegalMention | null {
  return legalMentionOrder.find((mention) => LEGAL_MENTION_SLUGS[mention] === slug) ?? null;
}

/**
 * Les libellés COURTS du menu, propres au back-office (Hugo, 2026-10-15 :
 * « CGV »). Le vocabulaire du contrat reste le nom de la mention — la
 * boutique, le pied de page et le titre de l'écran le lisent ; seul le menu,
 * où la place compte, dit plus court. Une mention absente garde son nom.
 */
const LEGAL_MENTION_MENU_LABELS: Readonly<Partial<Record<LegalMention, string>>> = {
  salesTerms: 'CGV',
  termsOfUse: 'CGU',
};

/** Le libellé d'une mention dans le menu — rail et lanceur mobile. */
export function legalMentionMenuLabel(mention: LegalMention): string {
  return LEGAL_MENTION_MENU_LABELS[mention] ?? legalMentionLabels.fr[mention];
}
