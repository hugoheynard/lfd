import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { ActivityEventView, ActivityPageView } from '@lfd/contracts';
import { FoldListboxComponent, FoldPaginatorComponent, FoldSearchComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { JournalPage } from '../journal-page';
import { JournalService, type JournalFilters } from '../journal.service';

/**
 * **Le journal d'activité, lu par pages numérotées.**
 *
 * Ce que ces cas protègent : la page 1 part sans ancre et fixe la vue, les
 * suivantes renvoient l'ancre qu'elle a rendue, et tout geste qui change ce
 * qu'on regarde — un filtre, une recherche, le retour en page 1 — rouvre une
 * vue neuve au lieu de continuer l'ancienne.
 */

const ANCHOR = '01JANCHOR';
const TOTAL = 120;

function event(id: string): ActivityEventView {
  return {
    id,
    type: 'vat_rate.rate_changed',
    module: 'pim',
    occurredAt: '2026-08-21T10:00:00.000Z',
    subjectType: 'vat_rate',
    subjectId: 'tva_1',
    actorType: 'staff',
    actorId: 'auth0|x',
    actorName: 'Hugo Heynard',
    actorRole: 'Commercial',
    traceId: 'trace',
    payload: { name: 'Réduit', from: 5.5, to: 10 },
  };
}

/** Une réponse du serveur : il rend l'ancre qu'on lui a passée, ou en fixe une. */
function respond(filters: JournalFilters, total: number): ActivityPageView {
  return {
    events: total === 0 ? [] : [event(`evt_p${filters.page ?? 1}`)],
    nextBefore: null,
    total,
    page: filters.page ?? 1,
    asOf: total === 0 ? null : (filters.asOf ?? ANCHOR),
  };
}

interface Mounted {
  readonly fixture: ComponentFixture<JournalPage>;
  readonly requests: JournalFilters[];
}

function mount(total = TOTAL): Mounted {
  const requests: JournalFilters[] = [];
  const service: Pick<JournalService, 'page'> = {
    page: (filters) => {
      requests.push(filters);
      return Promise.resolve(respond(filters, total));
    },
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: JournalService, useValue: service }],
  });
  const fixture = TestBed.createComponent(JournalPage);
  fixture.detectChanges();
  return { fixture, requests };
}

async function settled(fixture: ComponentFixture<JournalPage>): Promise<string> {
  await fixture.whenStable();
  fixture.detectChanges();
  return String(fixture.nativeElement.textContent ?? '');
}

function paginator(fixture: ComponentFixture<JournalPage>): FoldPaginatorComponent | null {
  const debug = fixture.debugElement.query(By.directive(FoldPaginatorComponent));
  return debug === null ? null : debug.injector.get(FoldPaginatorComponent);
}

/** Le premier sélecteur de la barre : le module. */
function moduleFilter(fixture: ComponentFixture<JournalPage>): FoldListboxComponent<string> {
  return fixture.debugElement
    .query(By.directive(FoldListboxComponent))
    .injector.get(FoldListboxComponent);
}

function search(fixture: ComponentFixture<JournalPage>): FoldSearchComponent {
  return fixture.debugElement
    .query(By.directive(FoldSearchComponent))
    .injector.get(FoldSearchComponent);
}

/** Ouvre l'écran, puis se rend à la page 2 de la vue figée. */
async function onPageTwo(): Promise<Mounted> {
  const mounted = mount();
  await settled(mounted.fixture);
  paginator(mounted.fixture)?.pageChange.emit(2);
  await settled(mounted.fixture);
  return mounted;
}

describe('le journal d’activité par pages', () => {
  it('lit la page 1 sans ancre, cinquante faits', async () => {
    const { fixture, requests } = mount();
    await settled(fixture);

    expect(requests[0]).toMatchObject({ page: 1, limit: 50 });
    expect(requests[0]?.asOf).toBeUndefined();
  });

  it('annonce le total de la vue', async () => {
    const { fixture } = mount();

    expect(await settled(fixture)).toContain('1–50 sur 120');
  });

  it('ne pose pas de paginateur quand tout tient sur une page', async () => {
    const { fixture } = mount(3);
    await settled(fixture);

    expect(paginator(fixture)).toBeNull();
  });

  /**
   * Sans l'ancre, un fait écrit entre deux clics pousserait tout d'un rang : la
   * page 2 répéterait la dernière ligne de la page 1.
   */
  it("renvoie l'ancre de la page 1 pour lire la page 2", async () => {
    const { fixture, requests } = await onPageTwo();

    expect(requests[1]).toMatchObject({ page: 2, asOf: ANCHOR, limit: 50 });
    expect(await settled(fixture)).toContain('51–100 sur 120');
  });

  it('dit que la vue est figée dès qu’on a quitté la page 1', async () => {
    const { fixture } = mount();
    expect(await settled(fixture)).not.toContain('Vue figée');

    paginator(fixture)?.pageChange.emit(2);

    expect(await settled(fixture)).toContain('revenir à la page 1');
  });

  /** Revenir à la page 1 est le geste qui montre les faits arrivés depuis. */
  it('rouvre une vue neuve en revenant à la page 1', async () => {
    const { fixture, requests } = await onPageTwo();

    paginator(fixture)?.pageChange.emit(1);
    await settled(fixture);

    expect(requests.at(-1)).toMatchObject({ page: 1 });
    expect(requests.at(-1)?.asOf).toBeUndefined();
  });

  /** L'ancre d'avant répondait à d'autres filtres : la garder mentirait sur le total. */
  it('repart en page 1 sans ancre quand un filtre change', async () => {
    const { fixture, requests } = await onPageTwo();

    moduleFilter(fixture).selectionChange.emit('pim');
    await settled(fixture);

    expect(requests.at(-1)).toMatchObject({ page: 1, module: 'pim' });
    expect(requests.at(-1)?.asOf).toBeUndefined();
  });

  it('repart en page 1 sans ancre quand la recherche change', async () => {
    const { fixture, requests } = await onPageTwo();

    search(fixture).searchChange.emit('martin');
    await settled(fixture);

    expect(requests.at(-1)).toMatchObject({ page: 1, q: 'martin' });
    expect(requests.at(-1)?.asOf).toBeUndefined();
  });
});
