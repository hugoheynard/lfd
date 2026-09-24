import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { OperationView } from '@lfd/pim-contracts';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { operationView } from '../operation-view.testing';
import { OperationsService } from '../operations.service';
import { PrepareOperationPanel } from '../prepare-operation-panel/prepare-operation-panel';
import { OperationsPage } from './operations-page';

class FakePanels {
  readonly opened: unknown[] = [];
  result: string | undefined = undefined;

  open(component: unknown): FoldPanelRef<string> {
    this.opened.push(component);
    const ref = new FoldPanelRef<string>(1, () => undefined);
    ref.close(this.result);
    return ref;
  }
}

async function render(list: () => Promise<readonly OperationView[]>, panels = new FakePanels()) {
  TestBed.configureTestingModule({
    imports: [OperationsPage],
    providers: [
      provideRouter([]),
      { provide: OperationsService, useValue: { list } },
      { provide: FoldPanelHostService, useValue: panels },
    ],
  });
  const fixture = TestBed.createComponent(OperationsPage);
  await fixture.whenStable();
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, panels };
}

describe('OperationsPage', () => {
  it('liste les opérations, leur état en pastille et un lien vers leur page', async () => {
    const { root } = await render(async () => [
      operationView({ state: 'open' }),
      operationView({
        key: 'galette-2027',
        name: { fr: 'Galette 2027' },
        archivedAt: '2027-02-01T10:00:00.000Z',
        state: 'ended',
      }),
    ]);
    const text = root.textContent ?? '';
    expect(text).toContain('Noël 2026');
    expect(text).toContain('Ouverte');
    expect(text).toContain('Archivée');
    expect(text).toContain('du mer. 23 déc. 2026 au jeu. 24 déc. 2026');
    const link = root.querySelector<HTMLAnchorElement>('a.operation-name');
    expect(link?.getAttribute('href')).toBe('/pim/operations/noel-2026');
  });

  it('sans opération, dit l’état vide', async () => {
    const { root } = await render(async () => []);
    expect(root.textContent).toContain('Aucune opération');
  });

  it('un échec de lecture se dit en alerte, avec Réessayer', async () => {
    const { root } = await render(async () => {
      throw new Error('réseau');
    });
    expect(root.textContent).toContain('Impossible de charger les opérations');
    expect(root.textContent).toContain('Réessayer');
  });

  it('préparer ouvre le panneau, puis la page de l’opération créée', async () => {
    const panels = new FakePanels();
    panels.result = 'paques-2027';
    const { fixture } = await render(async () => [], panels);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance['prepare']();
    await fixture.whenStable();
    expect(panels.opened).toEqual([PrepareOperationPanel]);
    expect(navigate).toHaveBeenCalledWith(['/pim', 'operations', 'paques-2027']);
  });

  it('renoncer ne navigue nulle part', async () => {
    const { fixture } = await render(async () => []);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance['prepare']();
    await fixture.whenStable();
    expect(navigate).not.toHaveBeenCalled();
  });
});
