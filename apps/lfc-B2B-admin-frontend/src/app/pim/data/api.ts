import { InjectionToken } from '@angular/core';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Base des routes du référentiel — l'API, sous son préfixe `/pim`.
 *
 * Elle **dérive** désormais de la base de l'admin au lieu d'avoir sa propre
 * valeur générée : le référentiel est un module de cette application, il tape le
 * même backend, sur la même origine. Deux valeurs pour une seule origine, c'est
 * une occasion de les voir diverger — et une origine fausse ne se voit qu'à la
 * première requête.
 *
 * Conséquence heureuse : comme elle commence par `B2B_API_BASE`, l'intercepteur
 * staff de l'admin l'estampille sans rien savoir du référentiel. Son
 * intercepteur à lui — qui demandait un jeton au shell par `postMessage` — a
 * disparu avec la greffe.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  factory: () => `${B2B_API_BASE}/pim`,
});
