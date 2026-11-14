import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, type Params } from '@angular/router';
import type { SalesOversightRowView, SalesOversightView } from '@lfd/contracts';
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
    ...over,
  };
}

function view(over: Partial<SalesOversightView> = {}): SalesOversightView {
  return {
    counts: { directory: 38, contacted: 8, qualified: 4, opened: 2, active: 5 },
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

const text = (fixture: ComponentFixture<SuiviPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('SuiviPage — le suivi commercial', () => {
  it('lit les filtres de l’URL, et ignore une valeur inconnue', async () => {
    const { api } = await render({
      follower: 'unassigned',
      level: 'contacted',
      signal: 'bogus',
      channel: 'self',
      page: '2',
    });
    expect(api.asked[0]).toEqual({
      follower: 'unassigned',
      level: 'contacted',
      signal: null,
      channel: 'self',
      page: 2,
    });
  });

  it('montre les compteurs, le niveau, le suiveur, les signaux et ce qui manque', async () => {
    const { fixture } = await render();
    const shown = text(fixture);
    expect(shown).toContain('38 Annuaire');
    expect(shown).toContain('5 Active');
    expect(shown).toContain('Boulangerie X');
    expect(shown).toContain('Commerciale A');
    expect(shown).toContain('En retard');
    expect(shown).toContain('manque : interlocuteur · contact noté');
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
    expect(shown).toContain('Non attribuée');
    expect(shown).toContain('Accès envoyé 3×');
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
    params.next(convertToParamMap({ level: 'active' }));
    await settle(fixture);
    expect(api.asked.at(-1)?.level).toBe('active');
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

  it('nomme le signal d’une inscription sans suivi', async () => {
    const api = new FakeApi();
    api.answer = () =>
      Promise.resolve(view({ rows: [row({ signals: ['unassigned_signup'], followedBy: null })] }));
    const { fixture } = await render({}, api);
    expect(text(fixture)).toContain('Inscription sans suivi');
  });
});
