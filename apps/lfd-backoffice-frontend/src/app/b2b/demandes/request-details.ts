import type { Type } from '@angular/core';
import type { RequestKind } from '@lfd/contracts';

import { OrderProblemDetails } from './order-problem-details/order-problem-details';

/**
 * **Quel composant rend les détails d'un type de demande** — la seule table
 * qui connaît les types (`demandes-clients.md`, §3.3).
 *
 * La carte d'une demande ne fait pas de `@switch` sur `kind` : elle demande
 * ici, et rend ce qu'on lui donne avec ses deux entrées `requestId` et
 * `details`. Un type à venir est un composant de plus et une ligne de plus.
 * `contact` n'en a pas : ses détails sont vides, l'enveloppe dit tout.
 */
export const REQUEST_DETAILS_COMPONENTS: Readonly<Partial<Record<RequestKind, Type<unknown>>>> = {
  order_problem: OrderProblemDetails,
};
