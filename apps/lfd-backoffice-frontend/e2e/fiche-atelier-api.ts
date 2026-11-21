import type { Page, Route } from '@playwright/test';

import type {
  ProductionWorksheetView,
  StaffMeView,
  VersionsView,
  WorkshopGroup,
  WorkshopLine,
  WorkshopShortcutsView,
} from '@lfd/contracts';

/**
 * **L'instant gelé de la page**, à l'heure de Paris : 8 h 20 un matin de
 * service. Ce n'est pas une date comparée à l'horloge du poste — c'est
 * l'horloge du poste elle-même, posée par `page.clock`. Toutes les heures de la
 * fiche (fournées, paliers) sont tirées de lui, si bien que « Dépassée · N min »
 * et l'horloge murale rendent toujours les mêmes pixels.
 */
export const FROZEN_NOW = new Date('2026-11-20T08:20:00+01:00');

/** Le fuseau dans lequel tourne la page — celui du fournil. */
export const WORKSHOP_TIMEZONE = 'Europe/Paris';

/** La journée servie : celle de l'instant gelé, au fuseau du fournil. */
const SERVICE_DAY = FROZEN_NOW.toLocaleDateString('sv-SE', { timeZone: WORKSHOP_TIMEZONE });

/** Un instant ISO, `minutes` avant l'instant gelé. */
function minutesBefore(minutes: number): string {
  return new Date(FROZEN_NOW.getTime() - minutes * 60_000).toISOString();
}

/** Ce qu'une ligne a en commun ; chaque cas ne dit que ce qui le distingue. */
function line(overrides: Partial<WorkshopLine> & Pick<WorkshopLine, 'sku'>): WorkshopLine {
  return {
    productName: '',
    quantity: 0,
    saleUnit: 'piece',
    containerLabel: null,
    done: false,
    initials: null,
    doneAt: null,
    produced: 0,
    remaining: 0,
    surplus: 0,
    batches: [],
    container: null,
    pendingReturn: 0,
    deadlines: [],
    quality: null,
    trackingLevel: 'detailed',
    ceiling: null,
    problem: null,
    waitingOrders: null,
    ...overrides,
  };
}

/**
 * **La ligne détaillée** : deux paliers — le premier passé, en partie sorti —,
 * un contenant réglé et deux fournées signées.
 */
const DETAILED = line({
  sku: 'CRO-001',
  productName: 'Croissant au beurre',
  quantity: 96,
  containerLabel: '4 plaques',
  produced: 30,
  remaining: 66,
  remainingUnderCeiling: 66,
  container: { unitsPerContainer: 24, singular: 'plaque' },
  batches: [
    {
      id: 'batch-1',
      quantity: 24,
      recordedAt: minutesBefore(95),
      initials: 'HH',
      pendingReturn: 0,
    },
    { id: 'batch-2', quantity: 6, recordedAt: minutesBefore(70), initials: 'MB', pendingReturn: 0 },
  ],
  deadlines: [
    { quantity: 48, before: '07:00' },
    { quantity: 48, before: '10:30' },
  ],
  waitingOrders: { count: 1, earliestHandover: '08:45' },
});

/** **La ligne simple** : un seul palier, rien de sorti. */
const SIMPLE = line({
  sku: 'BAG-002',
  productName: 'Baguette tradition',
  quantity: 40,
  remaining: 40,
  remainingUnderCeiling: 40,
  trackingLevel: 'simple',
  deadlines: [{ quantity: 40, before: '09:00' }],
});

/** **La ligne toujours vert** : réputée sortie, sans geste. */
const ALWAYS_GREEN = line({
  sku: 'PAI-003',
  productName: 'Pain de campagne',
  quantity: 12,
  remaining: 12,
  remainingUnderCeiling: 12,
  trackingLevel: 'always_green',
  deadlines: [{ quantity: 12, before: null }],
});

const LINES: readonly WorkshopLine[] = [DETAILED, SIMPLE, ALWAYS_GREEN];

const GROUP: WorkshopGroup = {
  key: 'viennoiserie',
  family: null,
  kind: 'shelf',
  category: null,
  label: 'Viennoiserie & pains',
  lineCount: LINES.length,
  doneCount: 0,
  totalUnits: 148,
  remainingUnits: 118,
  doneUnits: 0,
  lines: LINES,
  pending: LINES,
  done: [],
};

/** La journée servie par `GET …/worksheet/current`. */
export function worksheet(): ProductionWorksheetView {
  return {
    date: SERVICE_DAY,
    generatedAt: minutesBefore(260),
    retakenAt: null,
    lines: LINES,
    drift: null,
    groups: [GROUP],
    shelvesKnown: true,
    grouping: 'shelf',
    workstationsKnown: true,
    relativeDay: 'today',
  };
}

/** La personne connectée : le droit de la fiche, sans préférence de fiche. */
function me(): StaffMeView {
  return {
    id: 'staff-e2e',
    firstName: 'Hugo',
    lastName: 'Fournil',
    email: 'fournil@example.test',
    role: 'baker',
    roleLabel: 'Boulanger',
    permissions: ['production_worksheet:read', 'production_worksheet:write'],
    navPrefs: { worksheetCategory: null, productSectionFamily: null },
  };
}

/**
 * L'API de la fiche d'atelier, **doublée dans la page** — réponses figées :
 * ces tests regardent l'écran, ils ne font aucun geste.
 */
export class FicheAtelierApiDouble {
  async install(page: Page): Promise<void> {
    await page.clock.setFixedTime(FROZEN_NOW);
    await page.route('**/admin/**', (route) => this.dispatch(route));
  }

  private async dispatch(route: Route): Promise<void> {
    const { pathname } = new URL(route.request().url());

    if (pathname.endsWith('/admin/me')) {
      return json(route, me());
    }
    if (pathname.endsWith('/admin/production/worksheet/current')) {
      return json(route, worksheet());
    }
    if (pathname.endsWith('/admin/production/shortcuts')) {
      const shortcuts: WorkshopShortcutsView = { bySku: {} };
      return json(route, shortcuts);
    }
    if (pathname.endsWith('/admin/versions')) {
      const versions: VersionsView = { date: SERVICE_DAY, versions: {} };
      return json(route, versions);
    }
    if (pathname.endsWith('/admin/notifications')) {
      return json(route, { unread: 0, notifications: [] });
    }
    // Le reste de la coquille (pastilles, menus) : une collection vide.
    return json(route, []);
  }
}

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}
