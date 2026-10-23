import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CollectionBatchView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { collectionBatch, DOWNLOADED_AT } from '../../__tests__/collection-batch-fixture';
import { ProcedureBatchActions } from './procedure-batch-actions';

/**
 * La barre d'actions de l'onglet « Fichier » (Hugo, 2026-10-23) : télécharger,
 * « J'ai déposé » fermé avant téléchargement, contrôle CSV, « Annuler »
 * seulement avant dépôt, et l'ordre rappelé en une ligne.
 */
async function render(
  batch: CollectionBatchView,
  canWrite = true,
): Promise<ComponentFixture<ProcedureBatchActions>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ProcedureBatchActions] });
  const fixture = TestBed.createComponent(ProcedureBatchActions);
  fixture.componentRef.setInput('batch', batch);
  fixture.componentRef.setInput('canWrite', canWrite);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const node = (fixture: ComponentFixture<ProcedureBatchActions>, selector: string) =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(selector);

function gestures(fixture: ComponentFixture<ProcedureBatchActions>): string[] {
  const emitted: string[] = [];
  fixture.componentInstance.gesture.subscribe((gesture) => emitted.push(gesture));
  return emitted;
}

describe('la barre d’actions du lot', () => {
  it('télécharge le fichier de remise et le contrôle CSV', async () => {
    const fixture = await render(collectionBatch());
    const emitted = gestures(fixture);

    node(fixture, '[data-download-file]')?.click();
    node(fixture, '[data-audit]')?.click();

    expect(node(fixture, '[data-download-file]')?.textContent).toContain(
      'Télécharger le fichier de remise',
    );
    expect(emitted).toEqual(['xml', 'csv']);
  });

  it('avant téléchargement : « J’ai déposé » fermé, la raison et l’ordre dits', async () => {
    const fixture = await render(collectionBatch());

    expect(node(fixture, '[data-deposit]')?.disabled).toBe(true);
    const help = node(fixture, '[data-order-help]')?.textContent ?? '';
    expect(help).toContain('Téléchargez d’abord le fichier de remise.');
    expect(help).toContain('puis seulement signer sur');
  });

  it('après téléchargement : « J’ai déposé » s’ouvre, derrière une confirmation', async () => {
    const fixture = await render(collectionBatch({ lastDownloadedAt: DOWNLOADED_AT }));

    expect(node(fixture, '[data-deposit]')?.disabled).toBe(false);
    expect(node(fixture, 'fold-inline-confirm [data-deposit]')).not.toBeNull();
  });

  it('un lot non déposable reste fermé, même téléchargé', async () => {
    const fixture = await render(
      collectionBatch({ lastDownloadedAt: DOWNLOADED_AT, depositable: false }),
    );

    expect(node(fixture, '[data-deposit]')?.disabled).toBe(true);
  });

  it('« Annuler le lot » avant dépôt seulement', async () => {
    const open = await render(collectionBatch());
    const emitted = gestures(open);
    node(open, '[data-cancel]')?.click();
    expect(emitted).toEqual(['cancel']);

    const deposited = await render(
      collectionBatch({ status: 'deposited', lastDownloadedAt: DOWNLOADED_AT }),
    );
    expect(node(deposited, '[data-cancel]')).toBeNull();
  });

  it('en lecture seule : ni « J’ai déposé », ni « Annuler »', async () => {
    const fixture = await render(collectionBatch({ lastDownloadedAt: DOWNLOADED_AT }), false);

    expect(node(fixture, '[data-deposit]')).toBeNull();
    expect(node(fixture, '[data-cancel]')).toBeNull();
    expect(node(fixture, '[data-download-file]')).not.toBeNull();
  });

  /** Plan `plan-lot-rejete-par-la-banque.md` : sur un lot déposé seulement. */
  it('« La banque a rejeté ce fichier » sur un lot déposé, jamais avant ni sans le droit', async () => {
    const deposited = await render(
      collectionBatch({ status: 'deposited', lastDownloadedAt: DOWNLOADED_AT }),
    );
    const emitted = gestures(deposited);
    node(deposited, '[data-rejected-by-bank]')?.click();
    expect(emitted).toEqual(['rejected-by-bank']);

    expect(node(await render(collectionBatch()), '[data-rejected-by-bank]')).toBeNull();
    expect(
      node(
        await render(collectionBatch({ status: 'deposited' }), false),
        '[data-rejected-by-bank]',
      ),
    ).toBeNull();
    expect(
      node(
        await render(collectionBatch({ status: 'rejected_by_bank' })),
        '[data-rejected-by-bank]',
      ),
    ).toBeNull();
  });

  it('un lot rejeté : « J’ai déposé » fermé, la raison invite à préparer de nouveau', async () => {
    const fixture = await render(
      collectionBatch({ status: 'rejected_by_bank', lastDownloadedAt: DOWNLOADED_AT }),
    );

    expect(node(fixture, '[data-deposit]')?.disabled).toBe(true);
    expect(node(fixture, '[data-order-help]')?.textContent).toContain('préparer le lot de nouveau');
    expect(node(fixture, '[data-cancel]')).toBeNull();
  });
});
