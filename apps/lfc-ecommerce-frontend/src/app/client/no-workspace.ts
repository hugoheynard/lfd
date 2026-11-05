import { HttpContextToken } from '@angular/common/http';

/**
 * **« Cette requête part sans espace »** — le marqueur que la brique de
 * lecture (`context-keyed/`) pose pour toute clé visiteur, et devant lequel
 * `workspaceInterceptor` ne pose rien (Hugo, 2026-11-05).
 *
 * Sans lui, une clé visiteur ne portait aucun en-tête et l'intercepteur
 * complétait avec l'espace COURANT : juste seulement par chance, parce que
 * `ClientWorkspace.current()` vaut `null` sans session (vérifié le
 * 2026-11-05). Avec lui, la règle « l'en-tête vient de la clé » est tenue
 * par construction : la brique décide seule, dans tous les cas.
 *
 * Fichier à part, sans dépendance : l'intercepteur et la brique le lisent
 * tous les deux sans s'importer l'un l'autre.
 */
export const NO_WORKSPACE = new HttpContextToken<boolean>(() => false);
