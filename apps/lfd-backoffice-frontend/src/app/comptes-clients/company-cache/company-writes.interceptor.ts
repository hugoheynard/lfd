import { HttpResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import { CompanyWrites } from './company-writes';

/** Les méthodes qui ne changent rien côté serveur. */
const READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Signale à {@link CompanyWrites} toute écriture vers l'API B2B.
 *
 * Le cran monte quand la réponse ARRIVE, avant que l'appelant reprenne la
 * main : l'écran qui relit juste après son `await` trouve donc un magasin déjà
 * périmé, et lit l'état neuf. Un échec compte aussi — un refus après une
 * écriture partielle ne doit pas laisser l'ancien état à l'écran.
 */
export const companyWritesInterceptor: HttpInterceptorFn = (request, next) => {
  if (READ_METHODS.has(request.method) || !request.url.startsWith(B2B_API_BASE)) {
    return next(request);
  }
  const writes = inject(CompanyWrites);
  return next(request).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          writes.record();
        }
      },
      error: () => writes.record(),
    }),
  );
};
