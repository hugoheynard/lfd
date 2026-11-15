import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, type Params } from '@angular/router';
import type {
  SalesOversightRowView,
  SalesOversightView,
  SalesSheetStepsView,
} from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { AssignFollowerPanel } from '../assign-follower-panel/assign-follower-panel';
import type { SalesOversightFilters } from '../sales-oversight-filters';
import { SalesOversightService } from '../sales-oversight.service';
import { SuiviPage } from './suivi-page';

function row(over: Partial<SalesOversightRowView> = {}): SalesOversightRowView {
  return {
    companyId: 'co_1',
    reference: 'C-4F2K1A',
    name: 'Boulangerie X',
    level: 'directory',
    missing: ['interlocutor', 'noted_contact'],
    ageDays: 21,
    followedBy: { id: 'st_a', name: 'Commerciale A', archived: false },
    declaredVia: 'staff',
    signals: ['late'],
    accessSentCount: 0,
    lastAccessSentAt: null,
    deliveryAddressCount: 0,
    steps: steps(),
    nextStep: 'contact',
    nextStepActor: 'commercial',
    ...over,
  };
}

function steps(over: Partial<SalesSheetStepsView> = {}): SalesSheetStepsView {
  return {
    contact: { last: null, daysAgo: null },
    legal: { done: 2, of: 4, missing: ['vat', 'phone'], nameOnly: false },
    kbis: 'missing',
    payment: { terms: 'on_order', requested: false, rhythm: null, means: null },
    debitReady: 'not_applicable',
    delivery: 'missing',
    login: false,
    activated: false,
    orders: 0,
    ...over,
  };
}

function view(over: Partial<SalesOversightView> = {}): SalesOversightView {
  return {
    counts: { directory: 38, contacted: 8, qualified: 4, opened: 2, active: 5 },
    cards: { noContact: 38, onAccountNotDebitReady: 3, readyNotActivated: 2, ordering: 5 },
    rows: [row()],
    page: 1,
    pageSize: 50,
    total: 1,
    followers: [{ id: 'st_a', name: 'Commerciale A' }],
    assignable: [
      { id: 'st_a', name: 'Commerciale A' },
      { id: 'st_b', name: 'Commerciale B' },
    ],
    today: {
      day: '2030-01-15',
      opened: 12,
      levelUps: 0,
      accessResent: 4,
      contacts: { phone: 2, email: 0, visit: 1, visio: 0, trade_show: 0, other: 0 },
    },
    ...over,
  };
}

class FakeApi {
  readonly asked: SalesOversightFilters[] = [];
  answer: () => Promise<SalesOversightView> = () => Promise.resolve(view());
  read(filters: SalesOversightFilters): Promise<SalesOversightView> {
    this.asked.push(filters);
    return this.answer();
  }
}

class FakeRouter {
  readonly navigations: { commands: unknown[]; queryParams: Params | undefined }[] = [];
  navigate(commands: unknown[], extras?: { queryParams?: Params }): Promise<boolean> {
    this.navigations.push({ commands, queryParams: extras?.queryParams });
    return Promise.resolve(true);
  }
}

/** Les droits de l'agent : la cheffe a l'écriture, un lecteur non. */
class FakePermissions {
  constructor(private readonly writes: boolean) {}
  can(permission: string): boolean {
    return permission === 'b2b_sales_oversight:read' || this.writes;
  }
}

/** L'hôte des panneaux : garde ce qu'on ouvre, et ferme comme on le lui dit. */
class FakePanels {
  readonly opened: { component: unknown; data: unknown }[] = [];
  result: boolean = true;
  open(component: unknown, options: { data: unknown }): { closed: Promise<boolean> } {
    this.opened.push({ component, data: options.data });
    return { closed: Promise.resolve(this.result) };
  }
}

interface Rendered {
  readonly panels: FakePanels;
  readonly fixture: ComponentFixture<SuiviPage>;
  readonly api: FakeApi;
  readonly router: FakeRouter;
  readonly params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
}

async function render(query: Params = {}, api = new FakeApi(), writes = true): Promise<Rendered> {
  const params = new BehaviorSubject(convertToParamMap(query));
  const router = new FakeRouter();
  const panels = new FakePanels();
  TestBed.configureTestingModule({
    imports: [SuiviPage],
    providers: [
      { provide: PermissionsStore, useValue: new FakePermissions(writes) },
      { provide: FoldPanelHostService, useValue: panels },
      { provide: SalesOversightService, useValue: api },
      { provide: Router, useValue: router },
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } },
      },
    ],
  });
  const fixture = TestBed.createComponent(SuiviPage);
  await settle(fixture);
  return { fixture, api, router, params, panels };
}

async function settle(fixture: ComponentFixture<SuiviPage>): Promise<void> {
  for (let pass = 0; pass < 3; pass += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

const card = (fixture: ComponentFixture<SuiviPage>, key: string): HTMLElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector(`[data-card="${key}"]`);

/** Le texte de la cellule `step` de la ligne `index`, ses morceaux séparés d'une espace. */
function cellText(fixture: ComponentFixture<SuiviPage>, step: string, index = 0): string {
  const cells = (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-step="${step}"]`);
  const parts = [...(cells[index]?.children ?? [])].map((part) => part.textContent?.trim() ?? '');
  return parts.filter((part) => part !== '').join(' ');
}

async function renderRows(rows: SalesOversightRowView[]): Promise<Rendered> {
  const api = new FakeApi();
  api.answer = () => Promise.resolve(view({ rows, total: rows.length }));
  return render({}, api);
}

const text = (fixture: ComponentFixture<SuiviPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('SuiviPage — le suivi commercial', () => {
  it('lit les filtres de l’URL, et ignore une valeur inconnue', async () => {
    const { api } = await render({
      follower: 'unassigned',
      card: 'ordering',
      nextStep: 'mandate',
      signal: 'bogus',
      channel: 'self',
      page: '2',
    });
    expect(api.asked[0]).toEqual({
      follower: 'unassigned',
      card: 'ordering',
      nextStep: 'mandate',
      signal: null,
      channel: 'self',
      page: 2,
    });
  });

  it('montre les cartes, l’établissement, son origine et le commercial', async () => {
    const { fixture } = await render();
    const shown = text(fixture);
    expect(card(fixture, 'noContact')?.textContent).toContain('38');
    expect(card(fixture, 'noContact')?.textContent).toContain('Sans aucun contact');
    expect(card(fixture, 'ordering')?.textContent).toContain('Clients qui commandent');
    expect(shown).not.toContain('Annuaire');
    expect(shown).toContain('Boulangerie X');
    expect(shown).toContain('créée par un commercial · il y a 21 j');
    expect(shown).toContain('Commerciale A');
  });

  it('dit le récap du jour sous les compteurs, contacts par mode', async () => {
    const { fixture } = await render();
    const line = (fixture.nativeElement as HTMLElement).querySelector('[data-today]');
    expect(line?.textContent).toContain(
      'Aujourd’hui : 12 fiches ouvertes · 0 montée · 4 accès renvoyés · contacts : 2 téléphone, 1 visite',
    );
  });

  it('dit « aucun contact » un jour sans contact', async () => {
    const api = new FakeApi();
    api.answer = () =>
      Promise.resolve(
        view({
          today: {
            day: '2030-01-15',
            opened: 1,
            levelUps: 2,
            accessResent: 1,
            contacts: { phone: 0, email: 0, visit: 0, visio: 0, trade_show: 0, other: 0 },
          },
        }),
      );
    const { fixture } = await render({}, api);
    expect(text(fixture)).toContain(
      '1 fiche ouverte · 2 montées · 1 accès renvoyé · aucun contact',
    );
  });

  it('dit « Ancien membre », « Non attribuée » et le nombre d’envois', async () => {
    const api = new FakeApi();
    api.answer = () =>
      Promise.resolve(
        view({
          rows: [
            row({
              companyId: 'co_1',
              followedBy: { id: 'st_old', name: 'Partie', archived: true },
            }),
            row({
              companyId: 'co_2',
              followedBy: null,
              signals: ['access_resent'],
              accessSentCount: 3,
              missing: [],
            }),
          ],
          total: 2,
        }),
      );
    const { fixture } = await render({}, api);
    const shown = text(fixture);
    expect(shown).toContain('Ancien membre');
    expect(shown).not.toContain('Partie');
    expect(shown).toContain('Personne');
    expect(cellText(fixture, 'login', 1)).toContain('accès envoyé 3×');
  });

  it('un 409 « trop de fiches » demande de filtrer par commercial ou par canal', async () => {
    const api = new FakeApi();
    api.answer = () =>
      Promise.reject(
        new HttpErrorResponse({
          status: 409,
          error: { code: 'growth.sales_oversight.too_large', message: 'trop' },
        }),
      );
    const { fixture } = await render({}, api);
    expect(text(fixture)).toContain('Filtrez par commercial ou par canal');
  });

  it('une panne se dit, et propose de réessayer', async () => {
    const api = new FakeApi();
    api.answer = () => Promise.reject(new HttpErrorResponse({ status: 500 }));
    const { fixture } = await render({}, api);
    expect(text(fixture)).toContain('Impossible de lire le suivi commercial');
  });

  it('suit l’URL : un nouveau filtre relit le tableau', async () => {
    const { fixture, api, params } = await render();
    params.next(convertToParamMap({ nextStep: 'activate' }));
    await settle(fixture);
    expect(api.asked.at(-1)?.nextStep).toBe('activate');
  });
});

describe('SuiviPage — confier une fiche', () => {
  const assignButtons = (fixture: ComponentFixture<SuiviPage>): HTMLButtonElement[] => [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[data-assign]'),
  ];

  it('propose « Attribuer » sans suiveur, « Réattribuer » sinon', async () => {
    const api = new FakeApi();
    api.answer = () =>
      Promise.resolve(
        view({ rows: [row(), row({ companyId: 'co_2', followedBy: null })], total: 2 }),
      );
    const { fixture } = await render({}, api);
    expect(assignButtons(fixture).map((button) => button.textContent?.trim())).toEqual([
      'Réattribuer',
      'Attribuer',
    ]);
  });

  it('ne propose rien sans le droit d’écrire le suivi', async () => {
    const { fixture } = await render({}, new FakeApi(), false);
    expect(assignButtons(fixture)).toEqual([]);
  });

  it('ouvre le dialogue sans ouvrir la fiche, puis relit la page sur un succès', async () => {
    const { fixture, panels, router, api } = await render();
    assignButtons(fixture)[0]?.click();
    await settle(fixture);
    expect(panels.opened[0]?.component).toBe(AssignFollowerPanel);
    expect(panels.opened[0]?.data).toEqual({
      companyId: 'co_1',
      companyName: 'Boulangerie X',
      currentFollowerId: 'st_a',
      assignable: view().assignable,
    });
    expect(router.navigations).toEqual([]);
    expect(api.asked).toHaveLength(2);
  });
});

describe('SuiviPage — les cartes filtrent', () => {
  it('un clic pose le filtre dans l’URL, et repart de la première page', async () => {
    const { fixture, router } = await render();
    card(fixture, 'onAccountNotDebitReady')?.click();
    expect(router.navigations.at(-1)?.queryParams).toEqual({
      card: 'onAccountNotDebitReady',
      page: null,
    });
  });

  it('la carte active se voit, et un second clic retire le filtre', async () => {
    const { fixture, router, api } = await render({ card: 'ordering' });
    expect(api.asked[0]?.card).toBe('ordering');
    expect(card(fixture, 'ordering')?.getAttribute('aria-pressed')).toBe('true');
    expect(card(fixture, 'noContact')?.getAttribute('aria-pressed')).toBe('false');
    card(fixture, 'ordering')?.click();
    expect(router.navigations.at(-1)?.queryParams).toEqual({ card: null, page: null });
  });
});

describe('SuiviPage — la grille d’étapes', () => {
  it('dit chaque forme de paiement', async () => {
    const { fixture } = await renderRows([
      row({ companyId: 'a' }),
      row({
        companyId: 'b',
        steps: steps({
          payment: { terms: 'on_order', requested: true, rhythm: null, means: null },
        }),
      }),
      row({
        companyId: 'c',
        steps: steps({
          payment: { terms: 'on_account', requested: false, rhythm: 'weekly', means: 'sepa_debit' },
        }),
      }),
      row({
        companyId: 'd',
        steps: steps({
          payment: {
            terms: 'on_account',
            requested: false,
            rhythm: 'semimonthly',
            means: 'bank_transfer',
          },
        }),
      }),
      row({
        companyId: 'e',
        steps: steps({
          payment: {
            terms: 'on_account',
            requested: false,
            rhythm: 'monthly',
            means: 'sepa_debit',
          },
        }),
      }),
    ]);
    expect(cellText(fixture, 'payment', 0)).toBe('À la commande');
    expect(cellText(fixture, 'payment', 1)).toBe('À la commande demandé : au compte');
    expect(cellText(fixture, 'payment', 2)).toBe('Au compte · hebdo · prélèvement');
    expect(cellText(fixture, 'payment', 3)).toBe('Au compte · 2×/mois · virement');
    expect(cellText(fixture, 'payment', 4)).toBe('Au compte · mensuel · prélèvement');
  });

  it('dit où en est le prélèvement', async () => {
    const states = [
      'ready',
      'bank_account_missing',
      'mandate_missing',
      'blocked',
      'not_applicable',
    ] as const;
    const { fixture } = await renderRows(
      states.map((debitReady, index) =>
        row({ companyId: `co_${index}`, steps: steps({ debitReady }) }),
      ),
    );
    expect(states.map((_, index) => cellText(fixture, 'debit', index))).toEqual([
      '✓ prêt à prélever',
      'RIB manquant',
      'mandat à signer',
      'bloqué par la compta',
      'sans objet',
    ]);
  });

  it('dit la fiche remplie, le KBIS, la livraison, le contact et les commandes', async () => {
    const { fixture } = await renderRows([
      row({
        companyId: 'a',
        steps: steps({
          contact: { last: '2030-01-01', daysAgo: 45 },
          legal: { done: 4, of: 4, missing: [], nameOnly: false },
          kbis: 'certified',
          delivery: 'address',
          login: true,
          activated: true,
          orders: 7,
        }),
      }),
      row({
        companyId: 'b',
        steps: steps({
          contact: { last: '2030-01-10', daysAgo: 3 },
          legal: {
            done: 0,
            of: 4,
            missing: ['legal_identity', 'vat', 'phone', 'billing_address'],
            nameOnly: true,
          },
          kbis: 'to_verify',
          delivery: 'pickup',
        }),
      }),
      row({ companyId: 'c' }),
    ]);
    expect(cellText(fixture, 'contact', 0)).toContain('il y a 45 j');
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-step="contact"]')[0]
        ?.classList,
    ).toContain('tone-alert');
    expect(cellText(fixture, 'contact', 2)).toBe('— aucun contact');
    expect(cellText(fixture, 'legal', 0)).toBe('✓ fiche remplie');
    expect(cellText(fixture, 'legal', 1)).toContain('nom seul');
    expect(cellText(fixture, 'legal', 2)).toBe('2 sur 4 manque : n° de TVA, téléphone');
    expect(cellText(fixture, 'kbis', 0)).toBe('✓ KBIS certifié');
    expect(cellText(fixture, 'kbis', 1)).toBe('à vérifier');
    expect(cellText(fixture, 'delivery', 1)).toBe('retrait');
    expect(cellText(fixture, 'login', 0)).toBe('✓ client connecté');
    expect(cellText(fixture, 'orders', 0)).toBe('7 activé, 7 commandes');
    expect(cellText(fixture, 'orders', 2)).toBe('— pas activé');
  });

  it('dit la prochaine étape, et qui agit', async () => {
    const { fixture } = await renderRows([
      row({ companyId: 'a', followedBy: null, nextStep: 'assign', nextStepActor: 'commercial' }),
      row({ companyId: 'b', nextStep: 'contact', signals: ['stale_contact'] }),
      row({ companyId: 'c', nextStep: 'contact', signals: [] }),
      row({ companyId: 'd', nextStep: 'mandate', nextStepActor: 'client' }),
      row({ companyId: 'e', nextStep: 'activate', nextStepActor: 'accounting' }),
      row({ companyId: 'f', nextStep: 'none', nextStepActor: 'none' }),
    ]);
    expect([0, 1, 2, 3, 4, 5].map((index) => cellText(fixture, 'next', index))).toEqual([
      'Attribuer commercial',
      'Recontacter commercial',
      'Contacter commercial',
      'Faire signer le mandat client',
      'Activer compta',
      'Rien à faire',
    ]);
  });

  it('« En retard » : l’âge passe en rouge et se dit', async () => {
    const { fixture } = await renderRows([
      row({ companyId: 'a', signals: ['late'] }),
      row({ companyId: 'b', signals: [] }),
    ]);
    const origins = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-origin]');
    expect(origins[0]?.querySelector('[data-late]')?.classList).toContain('tone-alert');
    expect(origins[0]?.textContent).toContain('en retard');
    expect(origins[1]?.querySelector('[data-late]')).toBeNull();
    expect(origins[1]?.textContent).not.toContain('en retard');
  });

  it('« Plusieurs adresses » : la livraison dit combien, en orange', async () => {
    const { fixture } = await renderRows([
      row({
        companyId: 'a',
        signals: ['multiple_addresses'],
        deliveryAddressCount: 3,
        steps: steps({ delivery: 'address' }),
      }),
      row({ companyId: 'b', deliveryAddressCount: 1, steps: steps({ delivery: 'address' }) }),
    ]);
    expect(cellText(fixture, 'delivery', 0)).toBe('✓ adresse de livraison 3 adresses');
    const detail = (fixture.nativeElement as HTMLElement)
      .querySelectorAll('[data-step="delivery"]')[0]
      ?.querySelector('.secondary');
    expect(detail?.classList).toContain('tone-warning');
    expect(cellText(fixture, 'delivery', 1)).toBe('✓ adresse de livraison');
  });

  it('« Inscription sans suivi » : sous « Personne », en rouge', async () => {
    const { fixture } = await renderRows([
      row({ companyId: 'a', followedBy: null, signals: ['unassigned_signup'] }),
      row({ companyId: 'b', followedBy: null, signals: [] }),
    ]);
    const flags = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-unfollowed]');
    expect(flags).toHaveLength(1);
    expect(flags[0]?.textContent).toContain('inscrite, personne ne rappelle');
    expect(flags[0]?.classList).toContain('tone-alert');
  });
});
