/**
 * **Qui a le droit de parler à l'aperçu** — la liste FERMÉE des origines du
 * back-office, par environnement (plan `plan-textes-de-la-boutique.md`, §5,
 * §10 B3).
 *
 * L'aperçu n'accepte un message que d'une de ces origines, et n'en envoie qu'à
 * elles. La même liste est écrite dans `public/_headers`
 * (`frame-ancestors`) : le navigateur refuse de l'encadrer ailleurs, et ce
 * fichier refuse de répondre ailleurs — deux murs, l'un ne remplace pas
 * l'autre.
 *
 * Ce fichier est celui de la PRODUCTION ; la configuration `development` le
 * remplace par `preview-environment.development.ts` (`angular.json`).
 */
export interface PreviewEnvironment {
  /** Les origines exactes (schéma, hôte, port) du back-office qui encadre l'aperçu. */
  readonly editorOrigins: readonly string[];
}

export const PREVIEW_ENVIRONMENT: PreviewEnvironment = {
  editorOrigins: ['https://lfd-backoffice.com', 'https://lfd-backoffice.pages.dev'],
};
