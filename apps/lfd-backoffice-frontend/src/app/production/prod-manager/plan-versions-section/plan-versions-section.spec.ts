import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { DossierDispatchView, PlanVersionDiffView, PlanVersionView } from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DossierPrintService } from '../../dossier-print.service';
import { PlanVersionsService } from '../../plan-versions/plan-versions.service';
import { defaultRange, PlanVersionsSection } from './plan-versions-section';

/**
 * **Le panneau des versions** : la liste (la plus récente d'abord), la
 * comparaison par défaut (la courante contre la précédente), le papier qui ne
 * s'ouvre que pour la courante, les destinataires pas à jour, et les états.
 * Instants comparés à aucune horloge : absolus.
 */

function version(
  n: number,
  cause: PlanVersionView['cause'],
  paper: PlanVersionView['paper'] = { version: n, dossier: true, count: true },
): PlanVersionView {
  return {
    version: n,
    cause,
    recordedAt: '2026-11-27T18:10:00.000Z',
    author: { kind: 'system' },
    closedAt: '2026-11-27T16:00:00.000Z',
    printRun: 1,
    shipmentCount: 2,
    paper,
  };
}

const DIFF: PlanVersionDiffView = {
  from: {
    version: 1,
    cause: 'closed',
    recordedAt: '2026-11-27T16:00:00.000Z',
    recordedBy: { kind: 'system' },
    closedAt: '2026-11-27T16:00:00.000Z',
  },
  to: {
    version: 2,
    cause: 'order_withdrawn',
    recordedAt: '2026-11-27T18:10:00.000Z',
    recordedBy: { kind: 'system' },
    closedAt: '2026-11-27T16:00:00.000Z',
  },
  baselineUnknown: false,
  production: [],
  changes: [],
  resupplies: [],
  toCheck: [],
};

interface Doubles {
  readonly compared: [string, number, number][];
  readonly pdfs: string[];
}

async function render(
  versions: readonly PlanVersionView[] | Error,
  dispatches: readonly DossierDispatchView[] | Error = [],
): Promise<{ fixture: ComponentFixture<PlanVersionsSection>; doubles: Doubles }> {
  const doubles: Doubles = { compared: [], pdfs: [] };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: PlanVersionsService,
        useValue: {
          list: async () => {
            if (versions instanceof Error) throw versions;
            return versions;
          },
          dispatches: async () => {
            if (dispatches instanceof Error) throw dispatches;
            return dispatches;
          },
          compare: async (date: string, from: number, to: number) => {
            doubles.compared.push([date, from, to]);
            return DIFF;
          },
        },
      },
      {
        provide: DossierPrintService,
        useValue: {
          frozenPdf: async (date: string) => {
            doubles.pdfs.push(date);
            return new Blob(['%PDF']);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PlanVersionsSection);
  fixture.componentRef.setInput('date', '2026-11-27');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, doubles };
}

describe('defaultRange', () => {
  it('compare la courante à la précédente', () => {
    expect(defaultRange([{ version: 1 }, { version: 2 }, { version: 3 }])).toEqual({
      from: 2,
      to: 3,
    });
  });

  it('une seule version se compare à elle-même, aucune ne se compare pas', () => {
    expect(defaultRange([{ version: 1 }])).toEqual({ from: 1, to: 1 });
    expect(defaultRange([])).toBeNull();
  });
});

describe('PlanVersionsSection', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:papier');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('liste les versions, la plus récente d’abord, avec cause, auteur et papier', async () => {
    const { fixture } = await render([
      version(1, 'closed', { version: 1, dossier: false, count: false }),
      version(2, 'order_withdrawn', { version: 1, dossier: false, count: false }),
    ]);
    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-version-row]')];
    expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual([
      'Version 2 · tirage 1',
      'Version 1 · tirage 1',
    ]);
    expect(rows[0]?.textContent).toContain('Commande annulée');
    expect(rows[0]?.textContent).toContain('19 h 10 · automatique');
    expect(rows[0]?.textContent).toContain('Même papier que la version 1');
    expect(rows[1]?.textContent).toContain('Papier non rangé');
  });

  it('compare par défaut la courante à la précédente', async () => {
    const { doubles } = await render([version(1, 'closed'), version(2, 'retaken')]);
    expect(doubles.compared).toEqual([['2026-11-27', 1, 2]]);
  });

  it('n’offre le lien du papier que pour la version courante rangée, et l’ouvre', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { fixture, doubles } = await render([version(1, 'closed'), version(2, 'retaken')]);
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'button.pvs-open-paper',
    );
    expect(buttons).toHaveLength(1);
    buttons[0]?.click();
    await fixture.whenStable();
    expect(doubles.pdfs).toEqual(['2026-11-27']);
    expect(open).toHaveBeenCalledWith('blob:papier', '_blank');
  });

  it('signale les destinataires qui n’ont pas la version courante', async () => {
    const { fixture } = await render(
      [version(1, 'closed'), version(2, 'retaken')],
      [
        {
          recipientId: 'r1',
          name: 'Fournil',
          lastReceived: { at: '2026-11-27T16:01:00.000Z', planVersion: 1 },
          lastAttempt: { at: '2026-11-27T16:01:00.000Z', planVersion: 1, outcome: 'sent' },
        },
        {
          recipientId: 'r2',
          name: 'Labo',
          lastReceived: { at: '2026-11-27T18:11:00.000Z', planVersion: 2 },
          lastAttempt: { at: '2026-11-27T18:11:00.000Z', planVersion: 2, outcome: 'sent' },
        },
      ],
    );
    const rows = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-dispatch-row]'),
    ];
    expect(rows[0]?.textContent).toContain('A reçu la version 1 — dépassée');
    expect(rows[0]?.querySelector('fold-badge')).not.toBeNull();
    expect(rows[1]?.querySelector('fold-badge')).toBeNull();
  });

  it('dit la journée sans version', async () => {
    const { fixture, doubles } = await render([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Aucune version pour cette journée',
    );
    expect(doubles.compared).toEqual([]);
  });

  it('dit l’échec de la liste, et garde la liste si seuls les envois échouent', async () => {
    const failed = await render(new Error('500'));
    expect((failed.fixture.nativeElement as HTMLElement).textContent).toContain(
      'Impossible de lire les versions du plan',
    );
    TestBed.resetTestingModule();
    const partial = await render([version(1, 'closed')], new Error('500'));
    const el = partial.fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[data-version-row]')).toHaveLength(1);
    expect(el.textContent).toContain('Les envois du dossier n’ont pas pu être lus');
  });
});
