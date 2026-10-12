import { describe, expect, it } from 'vitest';

import {
  NO_FILTERS,
  filtersFromParams,
  filtersToParams,
  filtersToQuery,
  hasFilters,
} from '../order-list-filters';

describe("les filtres de la liste des commandes, dans l'URL", () => {
  it('relit chaque filtre sous le nom du serveur', () => {
    const filters = filtersFromParams({
      clientele: 'public',
      method: 'pickup',
      status: 'ready',
      paymentStatus: 'pending',
      placedFrom: '2026-10-01',
      placedTo: '2026-10-12',
      fulfillmentFrom: '2026-10-13',
      fulfillmentTo: '2026-10-20',
      q: '  léa  ',
    });
    expect(filtersToQuery(filters)).toEqual({
      clientele: 'public',
      method: 'pickup',
      status: 'ready',
      paymentStatus: 'pending',
      placedFrom: '2026-10-01',
      placedTo: '2026-10-12',
      fulfillmentFrom: '2026-10-13',
      fulfillmentTo: '2026-10-20',
      q: 'léa',
    });
  });

  it('jette une valeur inconnue plutôt que de la faire refuser par le serveur', () => {
    expect(filtersFromParams({ clientele: 'b2b', placedFrom: '12/10/2026', q: '   ' })).toEqual(
      NO_FILTERS,
    );
  });

  it("un filtre vide sort de l'adresse (null) et de la requête", () => {
    expect(filtersToParams(NO_FILTERS)['clientele']).toBeNull();
    expect(filtersToQuery(NO_FILTERS)).toEqual({});
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, method: 'delivery' })).toBe(true);
  });
});
