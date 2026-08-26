import { signal } from '@angular/core';
import type { Provider } from '@angular/core';
import type { SalesContextView } from '@lfd/pim-contracts';

import { SalesContextStore } from './sales-context-store';

/**
 * Le registre **tel que la migration le pose**. Les écrans l'itèrent : sans lui,
 * un test monte un panneau qui n'a aucun contexte à régler et passe au vert pour
 * une raison qui n'a rien à voir avec ce qu'il vérifie.
 */
export const TEST_SALES_CONTEXTS: readonly SalesContextView[] = [
  { key: 'takeaway', label: 'À emporter', position: 1 },
  { key: 'eatIn', label: 'Sur place', position: 2 },
  { key: 'b2b', label: 'B2B', position: 3 },
];

/**
 * Remplace le magasin par sa liste, sans réseau.
 *
 * Un double plutôt qu'une requête interceptée : le registre est une donnée de
 * référence, pas le sujet des tests qui le consomment.
 */
export function provideTestSalesContexts(
  contexts: readonly SalesContextView[] = TEST_SALES_CONTEXTS,
): Provider {
  return {
    provide: SalesContextStore,
    useValue: {
      items: signal(contexts),
      loadError: signal(null),
      reload: (): Promise<void> => Promise.resolve(),
    },
  };
}
