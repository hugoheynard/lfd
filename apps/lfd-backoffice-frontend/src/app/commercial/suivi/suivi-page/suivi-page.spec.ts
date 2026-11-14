import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, type Params } from '@angular/router';
import type { SalesOversightRowView, SalesOversightView } from '@lfd/contracts';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

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

interface Rendered {
  readonly fixture: ComponentFixture<SuiviPage>;
  readonly api: FakeApi;
  readonly router: FakeRouter;
  readonly params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
}

async function render(query: Params = {}, api = new FakeApi()): Promise<Rendered> {
  const params = new BehaviorSubject(convertToParamMap(query));
  const router = new FakeRouter();
  TestBed.configureTestingModule({
    imports: [SuiviPage],
    providers: [
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
  return { fixture, api, router, params };
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
