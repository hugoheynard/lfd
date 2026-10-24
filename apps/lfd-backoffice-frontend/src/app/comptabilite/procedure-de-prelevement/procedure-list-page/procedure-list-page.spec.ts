import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import type {
  CollectionProcedureListView,
  CollectionProcedureView,
  LegalEntityView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  procedureBatch,
  procedureRow,
  procedureView,
} from '../../__tests__/collection-procedure-fixture';
import {
  CollectionProcedureService,
  type ProcedureAddress,
} from '../../collection-procedure.service';
import { LegalEntitiesService } from '../../legal-entities.service';
import { ProcedureListPage } from './procedure-list-page';

/**
 * La table des procédures (§ 11) : une ligne par clôture, dans l'ordre du
 * serveur, avec son étape, sa limite (rouge si dépassée) et ses
 * avertissements ; une ligne ouvre son détail ; « Afficher les closes »
 * relit ; une ancienne adresse `?entite=&lot=` mène au détail du lot.
 */

const ENTITY: Partial<LegalEntityView> = {
  id: 'le1',
  name: 'La Folie Douce',
  archivedAt: null,
  depositCutoff: { businessDaysBefore: 1, time: '16:00' },
};
let entity: Partial<LegalEntityView>;

class FakeProcedures {
  list: CollectionProcedureListView = {
    legalEntityId: 'le1',
    today: '2026-10-23',
    closedSince: null,
    rows: [
      procedureRow({
        warnings: [
          { code: 'deadline_passed', count: null },
          { code: 'mandates_to_export', count: 2 },
        ],
      }),
      procedureRow({
        id: 'le1~2026-12-01',
        closureDay: '2026-12-01',
        code: 'PRL-261201-BM',
        closureModes: ['monthly', 'semimonthly'],
        periodLabel: 'du 1er au 30 novembre 2026',
        phase: 'upcoming',
        stage: 'file',
        batches: [],
        followedBatchId: null,
      }),
    ],
  };
  view: CollectionProcedureView = procedureView({
    followed: procedureBatch({ procedureId: 'le1~2026-10-01' }),
  });
  readonly listed: boolean[] = [];
  readonly read: { readonly address: ProcedureAddress; readonly batchId: string | null }[] = [];
  listOf = (_entityId: string, includeClosed: boolean): Promise<CollectionProcedureListView> => {
    this.listed.push(includeClosed);
    return Promise.resolve(this.list);
  };
  readOf = (
    address: ProcedureAddress,
    batchId: string | null,
  ): Promise<CollectionProcedureView> => {
    this.read.push({ address, batchId });
    return Promise.resolve(this.view);
  };
}

let procedures: FakeProcedures;
let navigations: unknown[][];

async function render(
  query: Record<string, string> = {},
): Promise<ComponentFixture<ProcedureListPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProcedureListPage],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
      },
      {
        provide: CollectionProcedureService,
        useValue: { list: procedures.listOf, read: procedures.readOf },
      },
      {
        provide: LegalEntitiesService,
        useValue: {
          list: (): Promise<readonly Partial<LegalEntityView>[]> => Promise.resolve([entity]),
        },
      },
    ],
  });
  const router = TestBed.inject(Router);
  router.navigate = (...args: unknown[]): Promise<boolean> => {
    navigations.push(args);
    return Promise.resolve(true);
  };
  const fixture = TestBed.createComponent(ProcedureListPage);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const root = (fixture: ComponentFixture<ProcedureListPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

beforeEach(() => {
  procedures = new FakeProcedures();
  navigations = [];
  entity = ENTITY;
});

describe('la table « Procédure de prélèvement »', () => {
  it('chaque ligne porte le code court de sa procédure', async () => {
    const fixture = await render();
    const codes = [...root(fixture).querySelectorAll('[data-code]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(codes).toEqual(['PRL-261101-M', 'PRL-261201-BM']);
  });

  it('« Mutualisée » à côté du rythme quand une clôture réunit plusieurs rythmes', async () => {
    const fixture = await render();
    const badges = [...root(fixture).querySelectorAll('[data-pooled]')];
    expect(badges).toHaveLength(1);
    expect(badges[0]?.textContent).toContain('Mutualisée');
    expect(badges[0]?.getAttribute('title')).toBe(
      'deux fois par mois + mensuel : une seule clôture, un seul lot',
    );
  });

  it('une ligne par procédure, dans l’ordre du serveur, titrée comme le détail', async () => {
    const fixture = await render();
    const titles = [...root(fixture).querySelectorAll('[data-row-title]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(titles).toEqual([
      'Mensuel · période du 1er au 31 octobre 2026',
      'Mensuel · période du 1er au 30 novembre 2026',
    ]);
    expect(procedures.listed).toEqual([false]);
  });

  it('dit l’étape, la limite dépassée en rouge et les avertissements', async () => {
    const fixture = await render();
    const text = root(fixture).textContent ?? '';
    expect(text).toContain('4 Fichier');
    expect(text).toContain('4 Fichier de prélèvement · à venir');
    expect(text).toContain('Limite de dépôt dépassée');
    expect(text).toContain('2 mandats non importés');
    const deadlines = root(fixture).querySelectorAll('[data-deadline]');
    expect(deadlines[0]?.classList.contains('pl-late')).toBe(true);
    expect(deadlines[1]?.classList.contains('pl-late')).toBe(false);
  });

  it('une clôture manquée : rendue à la place que le serveur lui donne, « Manquée » en alerte, et ce qu’il faut faire', async () => {
    procedures.list = {
      ...procedures.list,
      rows: [
        procedureRow({
          id: 'le1~2026-09-01',
          closureDay: '2026-09-01',
          periodLabel: 'du 1er au 31 août 2026',
          phase: 'missed',
          stage: 'file',
          batches: [],
          followedBatchId: null,
          warnings: [{ code: 'missed_closure', count: null }],
        }),
        ...procedures.list.rows,
      ],
    };
    const fixture = await render();
    const first = root(fixture).querySelector<HTMLElement>('tbody tr');
    expect(first?.textContent).toContain('Manquée');
    expect(first?.textContent).toContain('Jamais préparée — préparer la dernière clôture');
    first?.click();
    await fixture.whenStable();
    expect(navigations.at(-1)).toEqual([
      ['/comptabilite/procedure-de-prelevement', 'le1~2026-09-01'],
    ]);
  });

  it('une ligne ouvre le détail de sa procédure', async () => {
    const fixture = await render();
    const row = root(fixture).querySelector<HTMLElement>('tbody tr');
    row?.click();
    await fixture.whenStable();
    expect(navigations.at(-1)).toEqual([
      ['/comptabilite/procedure-de-prelevement', 'le1~2026-11-01'],
    ]);
  });

  it('« Afficher les closes » relit la table avec les closes', async () => {
    const fixture = await render();
    const box = root(fixture).querySelector<HTMLInputElement>('[data-show-closed] input');
    box?.click();
    await fixture.whenStable();
    expect(procedures.listed).toEqual([false, true]);
  });

  it('une ancienne adresse `?entite=&lot=` mène au détail du lot', async () => {
    await render({ entite: 'le1', lot: 'b1' });
    expect(procedures.read).toEqual([{ address: { legalEntityId: 'le1' }, batchId: 'b1' }]);
    expect(navigations.at(-1)).toEqual([
      ['/comptabilite/procedure-de-prelevement', 'le1~2026-10-01'],
      { queryParams: { lot: 'b1' }, replaceUrl: true },
    ]);
    expect(procedures.listed).toEqual([]);
  });

  it('la colonne « Commandes » : le compte servi, « — » quand il n’est pas calculé', async () => {
    procedures.list = {
      ...procedures.list,
      rows: [procedureRow({ orderCount: 12 }), procedureRow({ id: 'le1~x', orderCount: null })],
    };
    const fixture = await render();
    const counts = [...root(fixture).querySelectorAll('[data-order-count]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(counts).toEqual(['12', '—']);
  });

  it('limite de dépôt non réglée : l’avertissement et le lien vers l’entité', async () => {
    entity = { ...ENTITY, depositCutoff: null };
    const fixture = await render();
    const callout = root(fixture).querySelector('[data-cutoff-missing]');
    expect(callout?.textContent).toContain('La limite de dépôt n’est pas réglée');
    expect(callout?.querySelector('a')?.getAttribute('href')).toBe(
      '/comptabilite/entites-juridiques/le1#limite-de-depot',
    );
  });

  it('limite de dépôt réglée : aucun avertissement', async () => {
    const fixture = await render();
    expect(root(fixture).querySelector('[data-cutoff-missing]')).toBeNull();
  });
});
