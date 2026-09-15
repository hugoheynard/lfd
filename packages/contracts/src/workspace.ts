/**
 * **L'espace de travail déclaré par le front**, sans zod.
 *
 * ⚠️ Il vit ICI et non dans `account.ts` pour une raison de POIDS, pas de
 * rangement — la même que `feature-access.levels.ts` et
 * `platform-content.defaults.ts`. L'intercepteur de la boutique pose l'en-tête
 * sur chaque requête : il est enregistré dans `app.config.ts`, donc chargé au
 * démarrage. Il prenait ces deux chaînes au baril du paquet, qui embarquait zod
 * et tous les schémas dans le bundle initial : 1,52 Mo pour un budget d'erreur
 * de 1,30 Mo en configuration `cloudflare`, et le déploiement de la boutique a
 * échoué (run `35024864106`, 2026-09-15).
 *
 * Ce module n'importe rien. `account.ts` le réexporte : le backend et le baril
 * n'y voient aucune différence. Un front importe ses valeurs par
 * `@lfd/contracts/workspace`.
 */

/**
 * L'en-tête par lequel le front déclare **dans quel espace il travaille**.
 *
 * Il ne porte aucune autorité : le serveur le confronte aux rattachements de la
 * personne, et ignore ce qui n'en est pas un.
 */
export const WORKSPACE_HEADER = "x-lfc-company";

/**
 * La valeur réservée de l'espace **perso** : agir pour aucune société, quel que
 * soit le nombre de rattachements. Un identifiant de société est un `cuid()`,
 * qui ne peut pas la valoir.
 */
export const PERSONAL_WORKSPACE = "personal";
