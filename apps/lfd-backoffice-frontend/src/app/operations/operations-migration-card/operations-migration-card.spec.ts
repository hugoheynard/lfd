import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { OperationsMigrationReport } from '@lfd/contracts';
import { FoldInlineConfirmComponent } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { CommerceOperationsService } from '../commerce-operations.service';
import { OperationsMigrationCard } from './operations-migration-card';

function report(patch: Partial<OperationsMigrationReport> = {}): OperationsMigrationReport {
  return {
    readAt: '2026-10-16T08:00:00.000Z',
    counts: {
      referential: 1,
      mirror: 1,
      restrictions: 0,
      toWrite: 1,
      alreadyAtCommerce: 0,
      mirrorOnly: 0,
      blocked: 0,
    },
    blocked: false,
    operations: [
      {
        key: 'noel-2026',
        name: 'Noël 2026',
        outcome: 'adopt',
        fields: [
          {
            field: 'orderUntil',
            referential: '2026-12-21T11:00:00.000Z',
            mirror: '2026-12-20T11:00:00.000Z',
            result: '2026-12-21T11:00:00.000Z',
            restricted: false,
            explanation: 'referential_newer',
          },
        ],
        droppedSkus: [],
        restriction: null,
        problems: [],
      },
    ],
    ...patch,
  };
}

async function render(preview: OperationsMigrationReport) {
  const applyMigration = vi.fn(async () => report({ counts: { ...preview.counts, toWrite: 0 } }));
  TestBed.configureTestingModule({
    imports: [OperationsMigrationCard],
    providers: [
      {
        provide: CommerceOperationsService,
        useValue: { previewMigration: async () => preview, applyMigration },
      },
    ],
  });
  const fixture = TestBed.createComponent(OperationsMigrationCard);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement, applyMigration };
}

describe('OperationsMigrationCard', () => {
  it('dit ce que la reprise écrirait, champ par champ', async () => {
    const { root } = await render(report());
    expect(root.textContent).toContain('Sera reprise');
    expect(root.textContent).toContain('Clôture des commandes');
    expect(root.textContent).toContain('Le référentiel a changé depuis le dernier envoi');
  });

  it('ne propose rien quand une ligne est bloquée', async () => {
    const { root } = await render(report({ blocked: true }));
    expect(root.querySelector('fold-inline-confirm')).toBeNull();
    expect(root.textContent).toContain('la reprise refusera tout');
  });

  it('applique après confirmation et montre le relevé après', async () => {
    const { fixture, root, applyMigration } = await render(report());
    const applied = vi.fn();
    fixture.componentInstance.applied.subscribe(applied);
    expect(root.querySelector('fold-inline-confirm')).not.toBeNull();
    const confirm = fixture.debugElement.query(By.directive(FoldInlineConfirmComponent));
    (confirm.componentInstance as FoldInlineConfirmComponent).confirmed.emit('');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(applyMigration).toHaveBeenCalledOnce();
    expect(applied).toHaveBeenCalledOnce();
    expect(root.textContent).toContain('Relevé après application');
  });
});
