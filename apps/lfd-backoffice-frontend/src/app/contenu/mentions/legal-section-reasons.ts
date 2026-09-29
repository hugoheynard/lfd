import type { LegalSectionKey } from '@lfd/contracts/content-values';

/**
 * **Pourquoi une section est exigée**, dit à qui la rédige (Hugo, 2026-09-29).
 *
 * Sans cette phrase, « Requis » se lit comme une règle de l'outil. C'est une
 * condition extérieure : Meta refuse la connexion avec Facebook sans une page
 * publique qui explique comment faire supprimer ses données, et c'est vers
 * cette section que pointe l'adresse qu'on lui donne.
 */
export const LEGAL_SECTION_REASONS: Readonly<Record<LegalSectionKey, string>> = {
  dataDeletion:
    'Cette section est nécessaire pour la connexion avec Facebook : Meta exige une page publique qui explique comment faire supprimer ses données, et l’adresse qui lui est donnée mène ici. Modifiez son texte librement ; elle ne se supprime pas.',
};
