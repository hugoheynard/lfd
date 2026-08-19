import { InjectionToken } from '@angular/core';

import { API_BASE_URL_VALUE } from './api.env.generated';

/**
 * Base des routes du référentiel — `lfd-api` sous le préfixe `/pim` (port 3200 en dev). **Injectée au build** :
 * la valeur vient de l'environnement via `scripts/generate-api-config.mjs` →
 * `api.env.generated.ts` (git-ignored). Source : le `.env` de l'app en dev local, la
 * variable `PIM_API_BASE_URL` (CI/Cloudflare) en déployé. Jamais un secret — juste une
 * origine. Reste surchargeable par un provider au besoin.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  factory: () => API_BASE_URL_VALUE,
});
