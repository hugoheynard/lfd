import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { LegalDocumentFileView, SalesTermsDocument } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { PlatformContentService } from '../../platform-content.service';
import { LegalPdfCard } from './legal-pdf-card';

// Des dates comparées entre elles seulement, jamais à l'horloge.
const CURRENT: LegalDocumentFileView = {
  id: 'ldf_2',
  document: 'salesTermsPro',
  sizeBytes: 250_000,
  sha256: 'a'.repeat(64),
  uploadedAt: '2026-10-12T08:30:00.000Z',
  uploadedByName: 'Camille Martin',
  supersededAt: null,
};
const OLD: LegalDocumentFileView = {
  ...CURRENT,
  id: 'ldf_1',
  uploadedAt: '2026-10-01T08:30:00.000Z',
  supersededAt: '2026-10-12T08:30:00.000Z',
};

class SilentNotify {
  success(): void {}
  error(): void {}
  refused(): void {}
}

async function render(
  files: readonly LegalDocumentFileView[],
  options: { readonly textUpdatedAt?: string | null; readonly canWrite?: boolean } = {},
): Promise<{ element: HTMLElement; asked: SalesTermsDocument[] }> {
  const asked: SalesTermsDocument[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: NotifyService, useClass: SilentNotify },
      {
        provide: PlatformContentService,
        useValue: {
          legalFileHistory: (document: SalesTermsDocument) => {
            asked.push(document);
            return Promise.resolve({ document, files });
          },
          depositLegalFile: () => Promise.resolve({ id: 'ldf_3' }),
        } satisfies Pick<PlatformContentService, 'legalFileHistory' | 'depositLegalFile'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(LegalPdfCard);
  fixture.componentRef.setInput('document', 'salesTermsPro');
  fixture.componentRef.setInput('textUpdatedAt', options.textUpdatedAt ?? null);
  fixture.componentRef.setInput('canWrite', options.canWrite ?? true);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement, asked };
}

describe('LegalPdfCard', () => {
  it('lit l’historique du texte ouvert, et montre le PDF en vigueur', async () => {
    const { element, asked } = await render([CURRENT, OLD]);

    expect(asked).toEqual(['salesTermsPro']);
    expect(element.querySelector('[data-current-pdf]')?.textContent).toContain('Camille Martin');
    expect(element.querySelector('fold-data-table')).not.toBeNull();
  });

  it('signale un texte modifié APRÈS le dépôt du PDF en vigueur', async () => {
    const { element } = await render([CURRENT], { textUpdatedAt: '2026-10-13T10:00:00.000Z' });

    expect(element.querySelector('[data-text-newer]')?.textContent).toContain('13/10/2026');
  });

  it('ne signale rien quand le PDF est plus récent que le texte', async () => {
    const { element } = await render([CURRENT], { textUpdatedAt: '2026-10-11T10:00:00.000Z' });

    expect(element.querySelector('[data-text-newer]')).toBeNull();
  });

  it('sans PDF, le dit ; et sans droit d’écriture, n’ouvre pas le dépôt', async () => {
    const { element } = await render([], { canWrite: false });

    expect(element.querySelector('[data-current-pdf]')).toBeNull();
    expect(element.textContent).toContain('Aucun PDF n’est déposé');
    expect(element.querySelector('fold-file-dropzone')).toBeNull();
  });

  it('avec le droit d’écriture, propose de remplacer le PDF en vigueur', async () => {
    const { element } = await render([CURRENT]);

    expect(element.querySelector('fold-file-dropzone')).not.toBeNull();
  });
});
