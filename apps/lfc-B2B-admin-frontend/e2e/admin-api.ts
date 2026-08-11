import type { Page, Route } from '@playwright/test';

import {
  ALERT_KINDS,
  ALERT_KIND_ORDER,
  effectiveAlertRule,
  type AccountAlertOverride,
  type AccountAlertRuleView,
  type AlertKind,
  type AlertRule,
  type AlertRuleView,
} from '@lfd/contracts';

/** La société sur laquelle portent les tests de dérogation. */
export const COMPANY_ID = 'company-e2e';

/**
 * L'API admin, **doublée dans la page**.
 *
 * Un double avec de la mémoire, pas des réponses figées : un `PUT` change ce que
 * le `GET` suivant rendra. Sans ça, « j'enregistre puis l'écran recharge » ne
 * prouverait rien — l'écran réafficherait la valeur d'avant et le test passerait
 * quand même.
 *
 * La résolution `dérogation ?? global` est celle du contrat (`effectiveAlertRule`),
 * pas une seconde écrite ici : un double qui réimplémenterait la règle pourrait
 * valider un écran qui ment.
 */
export class AdminApiDouble {
  private readonly globals = new Map<AlertKind, AlertRule>();
  private readonly overrides = new Map<AlertKind, AccountAlertOverride>();
  /** Ce que le staff a envoyé, dans l'ordre — les tests s'y adossent. */
  readonly savedGlobals: AlertRule[] = [];
  readonly savedOverrides: AccountAlertOverride[] = [];
  readonly clearedOverrides: string[] = [];

  async install(page: Page): Promise<void> {
    await page.route('**/admin/**', (route) => this.dispatch(route));
  }

  private async dispatch(route: Route): Promise<void> {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();

    if (pathname.endsWith('/admin/alert-rules')) {
      return method === 'GET' ? json(route, this.globalViews()) : this.saveGlobal(route);
    }
    if (pathname.endsWith(`/admin/companies/${COMPANY_ID}/alert-rules`)) {
      return method === 'GET' ? json(route, this.accountViews()) : this.saveOverride(route);
    }
    if (pathname.includes(`/admin/companies/${COMPANY_ID}/alert-rules/`)) {
      this.clearedOverrides.push(pathname.split('/').pop() ?? '');
      this.overrides.delete(kindOf(pathname));
      return route.fulfill({ status: 204, body: '' });
    }
    if (pathname.endsWith(`/admin/companies/${COMPANY_ID}`)) {
      return json(route, companyDetail());
    }
    if (pathname.endsWith('/admin/notifications')) {
      return json(route, { unread: 0, notifications: [] });
    }
    // Tout le reste : une collection vide. Ces écrans en portent d'autres
    // (journal, pastilles, réglages voisins) qui n'ont rien à dire ici, et un
    // 404 les ferait passer en état d'erreur pour rien.
    return json(route, pathname.endsWith('/pending') ? {} : []);
  }

  private globalViews(): AlertRuleView[] {
    return ALERT_KIND_ORDER.map((kind) => ({
      kind,
      ...(this.globals.get(kind) ?? ALERT_KINDS[kind].defaults),
      updatedAt: null,
      updatedBy: null,
      degraded: false,
    }));
  }

  private accountViews(): AccountAlertRuleView[] {
    return ALERT_KIND_ORDER.map((kind) => {
      const global = this.globals.get(kind) ?? ALERT_KINDS[kind].defaults;
      const override = this.overrides.get(kind) ?? null;
      return {
        kind,
        global,
        override,
        effective: effectiveAlertRule(global, override),
        globalUpdatedAt: null,
        overrideUpdatedAt: override === null ? null : '2026-08-11T09:00:00.000Z',
        overrideUpdatedBy: override === null ? null : 'staff-e2e',
        globalMovedSince: false,
        degraded: false,
      };
    });
  }

  private async saveGlobal(route: Route): Promise<void> {
    const payload = route.request().postDataJSON() as { rule: AlertRule };
    this.globals.set(payload.rule.params.kind, payload.rule);
    this.savedGlobals.push(payload.rule);
    await route.fulfill({ status: 204, body: '' });
  }

  private async saveOverride(route: Route): Promise<void> {
    const override = route.request().postDataJSON() as AccountAlertOverride;
    this.overrides.set(override.kind, override);
    this.savedOverrides.push(override);
    await route.fulfill({ status: 204, body: '' });
  }
}

function kindOf(pathname: string): AlertKind {
  return decodeURIComponent(pathname.split('/').pop() ?? '') as AlertKind;
}

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Le strict nécessaire pour que la coquille de fiche s'affiche. */
function companyDetail(): unknown {
  return {
    id: COMPANY_ID,
    reference: 'C-E2E',
    raisonSociale: 'Boulangerie Périn',
    enseigne: '',
    formeJuridique: 'SAS',
    siret: '12345678901234',
    tvaIntracom: 'FR12345678901',
    status: 'active',
    paymentTerm: 'per_order',
    requestedPaymentTerm: null,
    primaryContact: {
      id: 'contact-1',
      firstName: 'Alice',
      lastName: 'Périn',
      fonction: 'Gérante',
      email: 'alice@example.test',
      phone: '',
    },
    kbis: null,
    owner: null,
    hasOpenSupportRequest: false,
    createdAt: '2026-07-30T10:00:00.000Z',
    vatNumberRequired: false,
    addresses: { billing: null, deliveries: [] },
  };
}
