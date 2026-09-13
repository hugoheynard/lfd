/**
 * Les **bornes** des CGV — les seules valeurs du contrat que les deux fronts
 * lisent pour prévenir avant que le serveur refuse.
 *
 * ⚠️ Elles vivent dans leur propre module, sans le moindre import, pour la même
 * raison mesurée que `platform-content.defaults.ts` : les écrans n'importent
 * `@lfd/contracts` qu'en `import type`, et une constante rangée à côté des
 * schémas aurait tiré zod dans un bundle de vitrine (+380 ko relevés, budget au
 * rouge). Le schéma, lui, dérive de ces valeurs — pas l'inverse.
 *
 * Une borne annoncée à l'écran vaut mieux qu'un refus au retour : le rédacteur
 * sait avant d'écrire, et non après avoir écrit.
 */

/** Le nombre maximum d'articles dans un document. Une borne, pas une limite ressentie. */
export const MAX_SALES_TERMS_PARAGRAPHS = 120;

/** La longueur maximale du corps d'un article, en caractères. */
export const MAX_SALES_TERMS_BODY = 20_000;
