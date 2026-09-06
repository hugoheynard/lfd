import type { Routes } from '@angular/router';

import type { DevTool } from './dev-tool.model';

/**
 * Outillage de développement — **variante de PRODUCTION**, celle qui ne contient
 * rien.
 *
 * Ce fichier est remplacé par `dev-tools.dev.ts` **uniquement** dans les
 * configurations `development` et `e2e` (`angular.json` → `fileReplacements`, le
 * même mécanisme que `api-config.ts`). Les builds `production` et `cloudflare`
 * gardent CELUI-CI.
 *
 * 🔴 C'est pour cela qu'il ne fait aucun `import()` de la page : le composant
 * n'est atteignable depuis aucun point d'entrée du build de production, donc il
 * n'est **pas émis**. Ce n'est pas un écran caché derrière un drapeau — c'est un
 * écran absent du bundle. Un bouton qui efface des sociétés ne se protège pas
 * par une condition à l'exécution.
 *
 * Il reste type-vérifié : `tsconfig` couvre tout `src/`, donc une page de
 * développement qui ne compile plus rougit ici comme ailleurs. Une trappe qu'on
 * ne compile jamais finit par ne plus fonctionner le jour où on en a besoin.
 */

/** Aucune route : l'outillage n'existe pas dans ce build. */
export const DEV_TOOLS_ROUTES: Routes = [];

/**
 * Aucune entrée de rail — et **le libellé lui-même est absent du bundle**.
 *
 * 🔴 L'entrée était d'abord écrite dans `app.html` derrière un `@if` sur une
 * constante fausse. Le compilateur de gabarits ne retire pas une branche morte :
 * « Jeu de données » se retrouvait dans le bundle de production, inerte mais
 * lisible. Rien de dangereux — la page et son appel, eux, étaient bien absents —
 * mais une affirmation à moitié vraie dans un commentaire vaut moins que rien.
 *
 * Déclarée ici, la liste est une VALEUR : vide, il n'y a plus de texte à
 * embarquer.
 */
export const DEV_TOOLS: readonly DevTool[] = [];
