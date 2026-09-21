import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { of, throwError } from 'rxjs';
import { afterEach, vi } from 'vitest';

import { AccountService } from '../../../../account/account.service';
import { FR } from '../../../copy/fr';
import { matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { KbisPanel, type KbisPanelData } from './kbis-panel';

const FILED: KbisPanelData = {
  companyId: 'cmp_1',
  kbis: {
    fileName: 'kbis-tommeuses.pdf',
    uploadedAt: '2026-02-12T00:00:00.000Z',
    certified: false,
  },
  canManage: true,
};

interface Wire {
  uploads: { companyId: string; name: string }[];
  answer: string | null;
  fetchFails: boolean;
  closes: unknown[];
}

let wire: Wire;

function boot(data: KbisPanelData): ComponentFixture<KbisPanel> {
  wire = { uploads: [], answer: null, fetchFails: false, closes: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [KbisPanel],
    providers: [
      {
        provide: AccountService,
        useValue: {
          saveKbis: (companyId: string, file: File): Promise<string | null> => {
            wire.uploads.push({ companyId, name: file.name });
            return Promise.resolve(wire.answer);
          },
          fetchKbis: () => (wire.fetchFails ? throwError(() => new Error('404')) : of(new Blob())),
        },
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(KbisPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

describe('KbisPanel', () => {
  let fixture: ComponentFixture<KbisPanel>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const drop = async (): Promise<void> => {
    const file = new File(['%PDF'], 'kbis-2026.pdf', { type: 'application/pdf' });
    fixture.debugElement
      .query(By.css('fold-file-dropzone'))
      .triggerEventHandler('filesPicked', [file]);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('dit l’état, le fichier et sa date, avec Ouvrir et Télécharger', () => {
    fixture = boot(FILED);

    expect(el().querySelector('fold-badge')?.textContent).toContain(FR.account.kbisPending);
    expect(el().textContent).toContain('kbis-tommeuses.pdf');
    expect(el().textContent).toContain('12/02/2026');
    const labels = Array.from(el().querySelectorAll('button[foldButton]')).map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual([FR.account.kbisOpen, FR.account.kbisDownload]);
  });

  it('ne propose le dépôt qu’à qui gère la société', () => {
    fixture = boot({ ...FILED, canManage: false });
    expect(el().querySelector('fold-file-dropzone')).toBeNull();

    fixture = boot({ ...FILED, kbis: null });
    expect(el().querySelector('fold-file-dropzone')).not.toBeNull();
    expect(el().textContent).toContain(FR.account.kbisNone);
  });

  it('dépose le fichier choisi et se ferme avec `true`', async () => {
    fixture = boot(FILED);
    await drop();

    expect(wire.uploads).toEqual([{ companyId: 'cmp_1', name: 'kbis-2026.pdf' }]);
    expect(wire.closes).toEqual([true]);
  });

  it('sur un refus, reste ouvert et montre le message du serveur', async () => {
    fixture = boot(FILED);
    wire.answer = 'Le fichier dépasse 10 Mo.';
    await drop();

    expect(wire.closes).toEqual([]);
    const callout = el().querySelector('fold-callout');
    expect(callout?.textContent).toContain(FR.account.kbisSaveFailed);
    expect(callout?.textContent).toContain('Le fichier dépasse 10 Mo.');
  });

  it('dit l’échec de récupération du fichier au lieu de ne rien faire', async () => {
    fixture = boot(FILED);
    wire.fetchFails = true;
    el().querySelector<HTMLButtonElement>('button[foldButton]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('fold-callout')?.textContent).toContain(FR.account.kbisFetchFailed);
  });

  describe('open()', () => {
    afterEach(() => {
      TestBed.inject(FoldPanelHostService).dismissAll();
      vi.unstubAllGlobals();
    });

    /** Un dépôt est une saisie : feuille du bas sous le pli, dialogue centré au-delà. */
    it('monte du bas sous le pli, et se centre au-delà', () => {
      boot(FILED);
      const panels = TestBed.inject(FoldPanelHostService);

      vi.stubGlobal('matchMedia', matchMediaAt(true));
      KbisPanel.open(panels, TOMMEUSES);
      expect(openedPanel()?.component).toBe(KbisPanel);
      expect(openedPanel()?.side).toBe('bottom');
      expect(openedPanel()?.data).toEqual({
        companyId: 'cmp_1',
        kbis: TOMMEUSES.kbis,
        canManage: true,
      });

      panels.dismissAll();
      vi.stubGlobal('matchMedia', matchMediaAt(false));
      KbisPanel.open(panels, TOMMEUSES);
      expect(openedPanel()?.side).toBe('center');
    });
  });
});
