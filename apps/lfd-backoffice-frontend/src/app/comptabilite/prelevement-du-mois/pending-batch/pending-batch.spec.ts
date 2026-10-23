import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CollectionBatchView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { collectionBatch, DOWNLOADED_AT } from '../../__tests__/collection-batch-fixture';
import { PendingBatch } from './pending-batch';

/**
 * La carte du lot : sa rangée de gestes suit la règle partagée avec l'onglet
 * « Fichier » de la procédure (2026-10-23) — « Marquer déposé » fermé tant que
 * le fichier n'a pas été téléchargé, « Annuler » jamais sur un lot déposé, et
 * aucune rangée quand l'hôte pose sa propre barre.
 */
async function render(
  batch: CollectionBatchView,
  inputs: { readonly actions?: boolean; readonly canWrite?: boolean } = {},
): Promise<ComponentFixture<PendingBatch>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [PendingBatch] });
  const fixture = TestBed.createComponent(PendingBatch);
  fixture.componentRef.setInput('batch', batch);
  fixture.componentRef.setInput('canWrite', inputs.canWrite ?? true);
  fixture.componentRef.setInput('actions', inputs.actions ?? true);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function button(fixture: ComponentFixture<PendingBatch>, label: string) {
  const all = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button');
  return Array.from(all).find((node) => node.textContent?.trim() === label);
}

describe('la carte du lot à déposer', () => {
  it('fichier jamais téléchargé : « Marquer déposé » fermé, la raison dite', async () => {
    const fixture = await render(collectionBatch());

    expect(button(fixture, 'Marquer déposé')?.disabled).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-deposit-closed]')?.textContent,
    ).toContain('Téléchargez d’abord le fichier de remise.');
  });

  it('fichier téléchargé : « Marquer déposé » ouvert, et il émet le geste', async () => {
    const fixture = await render(collectionBatch({ lastDownloadedAt: DOWNLOADED_AT }));
    const emitted: string[] = [];
    fixture.componentInstance.gesture.subscribe((gesture) => emitted.push(gesture));

    button(fixture, 'Marquer déposé')?.click();

    expect(button(fixture, 'Marquer déposé')?.disabled).toBe(false);
    expect(emitted).toEqual(['deposit']);
  });

  it('un lot déposé ne propose pas « Annuler »', async () => {
    const fixture = await render(
      collectionBatch({ status: 'deposited', lastDownloadedAt: DOWNLOADED_AT }),
    );

    expect(button(fixture, 'Annuler')).toBeUndefined();
    expect(button(fixture, 'Marquer déposé')?.disabled).toBe(true);
  });

  it('sans rangée de gestes quand l’hôte pose sa barre', async () => {
    const fixture = await render(collectionBatch(), { actions: false });

    expect(button(fixture, 'Fichier')).toBeUndefined();
    expect(button(fixture, 'Annuler')).toBeUndefined();
  });

  /** Plan `plan-lot-rejete-par-la-banque.md` § 7 : un lot déposé seulement. */
  it('un lot déposé propose « La banque a rejeté ce fichier », et il émet le geste', async () => {
    const fixture = await render(
      collectionBatch({ status: 'deposited', lastDownloadedAt: DOWNLOADED_AT }),
    );
    const emitted: string[] = [];
    fixture.componentInstance.gesture.subscribe((gesture) => emitted.push(gesture));

    button(fixture, 'La banque a rejeté ce fichier')?.click();

    expect(emitted).toEqual(['rejected-by-bank']);
    expect(
      button(await render(collectionBatch()), 'La banque a rejeté ce fichier'),
    ).toBeUndefined();
  });
});
