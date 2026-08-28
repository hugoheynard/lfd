/**
 * Ce qui reste de l'identité légale dans le CODE : l'année.
 *
 * Le reste — raison sociale, capital, SIRET, RCS, TVA, téléphone, e-mail,
 * réseaux — a quitté ce fichier pour la base : il se saisit depuis le
 * back-office, il se corrige sans déploiement, et les trois numéros
 * d'immatriculation qui manquaient depuis le début ont enfin un endroit où être
 * entrés. Le contenu de départ du contrat porte les valeurs déjà publiées.
 *
 * L'année ne suit pas, et c'est délibéré : elle n'est pas une mention à
 * rédiger, c'est un fait du calendrier. La confier à un écran d'édition
 * inviterait à l'oublier au 1er janvier.
 */

/** L'année du copyright, figée : `new Date()` casserait l'hydratation SSR. */
export const LEGAL_YEAR = 2026;
