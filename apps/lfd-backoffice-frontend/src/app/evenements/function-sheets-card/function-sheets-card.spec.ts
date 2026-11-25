import { TestBed } from '@angular/core/testing';
import type { FunctionSheetView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../notify.service';
import { EventsService } from '../events.service';
import { FunctionSheetsCard } from './function-sheets-card';

const SHEET: FunctionSheetView = {
  id: 'fs_1',
  fileName: 'deroule.pdf',
  sizeBytes: 320_000,
  uploadedBy: 'stf_1',
  uploadedAt: '2026-11-24T09:00:00.000Z',
};

async function render(sheets: readonly FunctionSheetView[], canWrite = true) {
  const deposited: { file: File; key: string }[] = [];
  const archived: string[] = [];
  const replaced: { sheetId: string; file: File; key: string }[] = [];
  const refusals: (string | undefined)[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: NotifyService,
        useValue: {
          success: () => {},
          error: () => {},
          refused: (_error: unknown, fallback?: string) => {
            refusals.push(fallback);
          },
        },
      },
      {
        provide: EventsService,
        useValue: {
          depositSheet: async (_eventId: string, file: File, key: string) => {
            deposited.push({ file, key });
            return { id: 'fs_2' };
          },
          archiveSheet: async (_eventId: string, sheetId: string) => {
            archived.push(sheetId);
          },
          replaceSheet: async (_eventId: string, sheetId: string, file: File, key: string) => {
            replaced.push({ sheetId, file, key });
            return { id: 'fs_3' };
          },
          sheetFile: async () => new Blob(['%PDF']),
        } satisfies Pick<
          EventsService,
          'depositSheet' | 'replaceSheet' | 'archiveSheet' | 'sheetFile'
        >,
      },
    ],
  });
  const fixture = TestBed.createComponent(FunctionSheetsCard);
  fixture.componentRef.setInput('eventId', 'evt_1');
  fixture.componentRef.setInput('sheets', sheets);
  fixture.componentRef.setInput('canWrite', canWrite);
  let changed = 0;
  fixture.componentInstance.changed.subscribe(() => {
    changed += 1;
  });
  fixture.detectChanges();
  await fixture.whenStable();
  return {
    root: fixture.nativeElement as HTMLElement,
    card: fixture.componentInstance,
    deposited,
    archived,
    replaced,
    refusals,
    changed: () => changed,
  };
}

describe('FunctionSheetsCard', () => {
  it('liste les fiches et dit le vide', async () => {
    expect((await render([SHEET])).root.textContent).toContain('deroule.pdf');
    expect((await render([])).root.textContent).toContain('Aucune fiche de fonction');
  });

  it('refuse un Excel sans rien envoyer', async () => {
    const { card, deposited, refusals } = await render([]);
    await card.picked([new File(['x'], 'fiche.xlsx', { type: 'application/vnd.ms-excel' })]);
    expect(deposited).toHaveLength(0);
    expect(refusals[0]).toContain('exportez la fiche en PDF');
  });

  it('dépose un PDF sous une clé, puis prévient le parent', async () => {
    const { card, deposited, changed } = await render([]);
    await card.picked([new File(['%PDF'], 'fiche.pdf', { type: 'application/pdf' })]);
    expect(deposited).toHaveLength(1);
    expect(deposited[0]?.key).toMatch(/.+/u);
    expect(changed()).toBe(1);
  });

  it('sans le droit d’écrire, ni dépôt ni retrait', async () => {
    const { root } = await render([SHEET], false);
    expect(root.querySelector('fold-file-dropzone')).toBeNull();
    expect(root.querySelector('[data-sheet-archive]')).toBeNull();
    expect(root.querySelector('[data-sheet-download]')).not.toBeNull();
  });

  it('retire une fiche, puis prévient le parent', async () => {
    const { card, archived, changed } = await render([SHEET]);
    await card.archive(SHEET);
    expect(archived).toEqual(['fs_1']);
    expect(changed()).toBe(1);
  });

  it('remplace la fiche choisie : le dépôt suivant part en remplacement', async () => {
    const { card, deposited, replaced, changed } = await render([SHEET]);
    card.replacing.set(SHEET);
    await card.picked([new File(['%PDF'], 'v2.pdf', { type: 'application/pdf' })]);
    expect(deposited).toHaveLength(0);
    expect(replaced.map((r) => r.sheetId)).toEqual(['fs_1']);
    expect(card.replacing()).toBeNull();
    expect(changed()).toBe(1);
  });

  it('refuse un remplacement qui n’est pas un PDF', async () => {
    const { card, replaced } = await render([SHEET]);
    card.replacing.set(SHEET);
    await card.picked([new File(['x'], 'v2.xlsx', { type: 'application/vnd.ms-excel' })]);
    expect(replaced).toHaveLength(0);
    expect(card.replacing()).toEqual(SHEET);
  });
});
