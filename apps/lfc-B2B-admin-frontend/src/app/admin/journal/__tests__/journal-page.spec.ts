import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { ActivityEventView, ActivityPageView } from '@lfd/contracts';
import { FoldListboxComponent, FoldPaginatorComponent, FoldSearchComponent } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

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
  readonly fixture: ComponentFixture<unknown>;
  readonly requests: JournalFilters[];
  readonly router: Router;
}

/** Ouvre l'écran à une adresse, derrière le vrai routeur : c'est lui qui porte l'URL. */
async function mount(total = TOTAL, url = '/journal'): Promise<Mounted> {
  const requests: JournalFilters[] = [];
  const service: Pick<JournalService, 'page'> = {
    page: (filters) => {
      requests.push(filters);
      return Promise.resolve(respond(filters, total));
    },
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'journal', component: JournalPage }]),
      { provide: JournalService, useValue: service },
    ],
  });
  const harness = await RouterTestingHarness.create(url);
  return { fixture: harness.fixture, requests, router: TestBed.inject(Router) };
}

async function settled(fixture: ComponentFixture<unknown>): Promise<string> {
  await fixture.whenStable();
  fixture.detectChanges();
  return String(fixture.nativeElement.textContent ?? '');
}

function paginator(fixture: ComponentFixture<unknown>): FoldPaginatorComponent | null {
  const debug = fixture.debugElement.query(By.directive(FoldPaginatorComponent));
  return debug === null ? null : debug.injector.get(FoldPaginatorComponent);
}

/** Le premier sélecteur de la barre : le module. */
function moduleFilter(fixture: ComponentFixture<unknown>): FoldListboxComponent<string> {
  return fixture.debugElement
    .query(By.directive(FoldListboxComponent))
    .injector.get(FoldListboxComponent);
}

function search(fixture: ComponentFixture<unknown>): FoldSearchComponent {
  return fixture.debugElement
    .query(By.directive(FoldSearchComponent))
    .injector.get(FoldSearchComponent);
}

/** Ouvre l'écran, puis se rend à la page 2 de la vue figée. */
async function onPageTwo(): Promise<Mounted> {
  const mounted = await mount();
  await settled(mounted.fixture);
  paginator(mounted.fixture)?.pageChange.emit(2);
  await settled(mounted.fixture);
  return mounted;
}

describe('le journal d’activité par pages', () => {
  it('lit la page 1 sans ancre, cinquante faits', async () => {
    const { fixture, requests } = await mount();
    await settled(fixture);

    expect(requests[0]).toMatchObject({ page: 1, limit: 50 });
    expect(requests[0]?.asOf).toBeUndefined();
  });

  it('annonce le total de la vue', async () => {
    const { fixture } = await mount();

    expect(await settled(fixture)).toContain('1–50 sur 120');
  });

  it('ne pose pas de paginateur quand tout tient sur une page', async () => {
    const { fixture } = await mount(3);
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
    const { fixture } = await mount();
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

/** Les pastilles de filtre : des boutons qui se retirent d'un clic. */
function chips(fixture: ComponentFixture<unknown>): HTMLButtonElement[] {
  const host = fixture.nativeElement as HTMLElement;
  return [...host.querySelectorAll<HTMLButtonElement>('button[aria-label^="Retirer le filtre"]')];
}

function chip(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement | undefined {
  return chips(fixture).find((button) => (button.textContent ?? '').includes(label));
}

const FROM_SHEET = '/journal?actorId=stf_1&subjectType=product&subjectId=prd_42&module=pim';

/**
 * **Arriver au journal depuis une fiche** (plan journalisation, lot 3) : les
 * filtres d'identifiant vivent dans l'adresse, la recherche jamais — un terme
 * cherché peut être un nom, et l'URL voyage dans les journaux de la passerelle.
 */
describe('le journal d’activité et son adresse', () => {
  it('lit ses filtres dans l’adresse, en page 1 sans ancre', async () => {
    const { fixture, requests } = await mount(TOTAL, FROM_SHEET);
    await settled(fixture);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      page: 1,
      module: 'pim',
      actorId: 'stf_1',
      subjectType: 'product',
      subjectId: 'prd_42',
    });
    expect(requests[0]?.asOf).toBeUndefined();
    expect(moduleFilter(fixture).value()).toBe('pim');
  });

  it('ignore un module inconnu plutôt que de filtrer sur du vide', async () => {
    const { fixture, requests } = await mount(TOTAL, '/journal?module=inconnu');
    await settled(fixture);

    expect(requests[0]?.module).toBeUndefined();
  });

  it('écrit le module choisi dans l’adresse, sans perdre les autres filtres', async () => {
    const { fixture, router } = await mount(TOTAL, '/journal?actorId=stf_1');
    await settled(fixture);

    moduleFilter(fixture).selectionChange.emit('commandes');
    await settled(fixture);

    expect(router.url).toContain('module=commandes');
    expect(router.url).toContain('actorId=stf_1');
  });

  /** Un filtre qu'on essaie n'est pas une page visitée : « Précédent » ramène d'où l'on vient. */
  it('met l’adresse à jour sans empiler l’historique', async () => {
    const { fixture, router } = await mount();
    await settled(fixture);
    const navigate = vi.spyOn(router, 'navigate');

    moduleFilter(fixture).selectionChange.emit('pim');
    await settled(fixture);

    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ replaceUrl: true }));
  });

  it('retire le module de l’adresse quand on revient à « tous »', async () => {
    const { fixture, router } = await mount(TOTAL, '/journal?module=pim');
    await settled(fixture);

    moduleFilter(fixture).selectionChange.emit('');
    await settled(fixture);

    expect(router.url).not.toContain('module=');
  });

  it('n’écrit jamais la recherche dans l’adresse', async () => {
    const { fixture, router, requests } = await mount(TOTAL, '/journal?actorId=stf_1');
    await settled(fixture);

    search(fixture).searchChange.emit('martin');
    await settled(fixture);
    moduleFilter(fixture).selectionChange.emit('pim');
    await settled(fixture);

    expect(requests.at(-1)).toMatchObject({ q: 'martin', module: 'pim' });
    expect(router.url).not.toContain('q=');
    expect(router.url).not.toContain('martin');
  });

  /** Une adresse collée à la main qui porterait un terme : il n'est ni lu, ni gardé. */
  it('ne lit pas une recherche venue de l’adresse, et l’en retire', async () => {
    const { fixture, router, requests } = await mount(TOTAL, '/journal?q=martin&actorId=stf_1');
    await settled(fixture);

    expect(requests[0]?.q).toBeUndefined();
    expect(router.url).not.toContain('martin');
    expect(router.url).toContain('actorId=stf_1');
  });

  it('ne montre aucune pastille sans filtre d’auteur ni de sujet', async () => {
    const { fixture } = await mount(TOTAL, '/journal?module=pim');
    await settled(fixture);

    expect(chips(fixture)).toHaveLength(0);
  });

  /** Sans pastille, l'écran filtrerait sur une personne sans le dire. */
  it('nomme l’auteur filtré, lu sur un fait qu’il a signé', async () => {
    const { fixture } = await mount(TOTAL, '/journal?actorId=stf_1');

    await settled(fixture);

    expect(chip(fixture, 'Auteur : Hugo Heynard')).toBeDefined();
  });

  it('montre l’identifiant de l’auteur quand aucun fait ne le nomme', async () => {
    const { fixture } = await mount(0, '/journal?actorId=stf_1');

    await settled(fixture);

    expect(chip(fixture, 'Auteur : stf_1')).toBeDefined();
  });

  it('retire le filtre d’auteur d’un clic : la requête, l’adresse et la pastille', async () => {
    const { fixture, router, requests } = await mount(TOTAL, FROM_SHEET);
    await settled(fixture);

    chip(fixture, 'Auteur')?.click();
    await settled(fixture);

    expect(requests.at(-1)?.actorId).toBeUndefined();
    expect(requests.at(-1)).toMatchObject({ page: 1, subjectId: 'prd_42' });
    expect(router.url).not.toContain('actorId');
    expect(chip(fixture, 'Auteur')).toBeUndefined();
  });

  it('retire le filtre de sujet d’un clic, type et identifiant ensemble', async () => {
    const { fixture, router, requests } = await mount(TOTAL, FROM_SHEET);
    await settled(fixture);
    expect(chip(fixture, 'Sujet : product · prd_42')).toBeDefined();

    chip(fixture, 'Sujet')?.click();
    await settled(fixture);

    expect(requests.at(-1)?.subjectType).toBeUndefined();
    expect(requests.at(-1)?.subjectId).toBeUndefined();
    expect(router.url).not.toContain('subject');
    expect(chip(fixture, 'Sujet')).toBeUndefined();
  });

  /** L'entrée du menu, depuis un journal filtré : l'adresse nue rouvre tout le journal. */
  it('suit une navigation vers l’adresse sans filtre', async () => {
    const { fixture, router, requests } = await mount(TOTAL, '/journal?actorId=stf_1');
    await settled(fixture);

    await router.navigateByUrl('/journal');
    await settled(fixture);

    expect(requests.at(-1)?.actorId).toBeUndefined();
    expect(chips(fixture)).toHaveLength(0);
  });
});
