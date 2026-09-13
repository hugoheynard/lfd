import type { ContentLocale, LegalMention } from '@lfd/contracts';
import { legalMentionLabels } from '@lfd/contracts/content-values';

/**
 * Le mot de secours des CGV — et cette ligne ne supplée PAS au contrat.
 *
 * Le vrai libellé du lien est le TITRE du document, qui vit en base et se
 * renomme depuis l'écran des CGV : un document renommé renomme son lien, et un
 * second libellé aurait divergé au premier renommage. Le back-office doit
 * pourtant nommer la case qu'il fait cocher, et l'aperçu, occuper la place que
 * le lien prendra. C'est tout ce que ce mot fait.
 */
export const SALES_TERMS_FALLBACK_LABEL = 'Conditions générales de vente';

/**
 * Le mot d'une mention dans une langue.
 *
 * Il vit à CÔTÉ des écrans et non dedans parce que deux d'entre eux le lisent —
 * le formulaire, qui nomme la case, et l'aperçu, qui rend le bandeau. Deux
 * copies auraient divergé sur le seul cas qui n'est pas dans le contrat.
 */
export function legalMentionLabel(locale: ContentLocale, mention: LegalMention): string {
  return mention === 'salesTerms'
    ? SALES_TERMS_FALLBACK_LABEL
    : legalMentionLabels[locale][mention];
}
