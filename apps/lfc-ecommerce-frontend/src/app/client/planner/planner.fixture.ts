import type {
  PlannedColumnView,
  PlannedLineCheckView,
  PlannedRoutingView,
  PlannerView,
} from '@lfd/contracts';

/**
 * **Les données de test du planificateur** — une vue telle que `GET /planner`
 * la rend. Les jours ne sont comparés à aucune horloge par les tests qui les
 * lisent, sauf `convertsAt`, qu'ils posent eux-mêmes relativement à maintenant.
 */

export const PLANNER_DAY = '2031-03-04';
export const PLANNER_NEXT_DAY = '2031-03-05';

export const PLANNER_ROUTING: PlannedRoutingView = {
  method: 'pickup',
  deliveryAddress: null,
  pickupAddressId: 'pt_labo',
  window: { start: '07:00', end: '09:00' },
};

export function plannedColumn(overrides: Partial<PlannedColumnView> = {}): PlannedColumnView {
  return {
    id: 'col_1',
    day: PLANNER_DAY,
    version: 1,
    status: 'draft',
    routing: PLANNER_ROUTING,
    lines: [{ sku: 'VIE-001', quantity: 10 }],
    convertsAt: null,
    orderId: null,
    refusal: null,
    ...overrides,
  };
}

export function lineCheck(overrides: Partial<PlannedLineCheckView> = {}): PlannedLineCheckView {
  return {
    sku: 'VIE-001',
    day: PLANNER_DAY,
    columnId: null,
    closesAt: null,
    blocking: null,
    quantityIndependent: false,
    ...overrides,
  };
}

export function plannerView(overrides: Partial<PlannerView> = {}): PlannerView {
  const column = plannedColumn();
  return {
    from: PLANNER_DAY,
    lastPlannableDay: '2031-03-30',
    shownDays: [PLANNER_DAY],
    days: [{ day: PLANNER_DAY, columns: [column] }],
    favorites: ['VIE-001', 'PAI-001'],
    checks: [],
    ...overrides,
  };
}
