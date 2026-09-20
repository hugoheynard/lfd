import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { FR } from '../../../copy/fr';
import { asRole, bootCard, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { KbisPanel } from '../kbis-panel/kbis-panel';
import { KbisDeskCard } from './kbis-desk-card';

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('KbisDeskCard', () => {
  /** Le fil ne porte ni la date de vérification ni son auteur : on ne les invente pas. */
  it('dit si l’extrait est certifié, son fichier et sa date de dépôt', () => {
    const el = bootCard(KbisDeskCard, [TOMMEUSES]).nativeElement as HTMLElement;

    expect(el.querySelector('.kbis-verified')?.textContent).toContain(FR.account.kbisCertified);
    expect(el.textContent).toContain('kbis-tommeuses.pdf');
    expect(el.textContent).toContain('12/02/2026');
  });

  /** Rétablis le 2026-09-14 : « Ouvrir » et « Remplacer », inertes d'origine, ouvrent le panneau. */
  it('« Ouvrir » à tout membre, « Remplacer » à qui peut déposer — les deux ouvrent le panneau', () => {
    const labels = (el: HTMLElement): string[] =>
      Array.from(el.querySelectorAll('.acts button')).map((b) => b.textContent?.trim() ?? '');

    expect(labels(bootCard(KbisDeskCard, [asRole('orders')]).nativeElement as HTMLElement)).toEqual(
      [FR.account.kbisOpen],
    );

    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const el = bootCard(KbisDeskCard, [TOMMEUSES]).nativeElement as HTMLElement;
    expect(labels(el)).toEqual([FR.account.kbisOpen, FR.account.kbisReplace]);
    el.querySelectorAll<HTMLButtonElement>('.acts button')[1]?.click();
    expect(openedPanel()?.component).toBe(KbisPanel);
  });

  it('sans extrait, n’offre le dépôt qu’à qui peut déposer — et le dépôt ouvre le panneau', () => {
    const none = { ...TOMMEUSES, kbis: null };
    const reader = bootCard(KbisDeskCard, [asRole('orders', none)]).nativeElement as HTMLElement;
    expect(reader.querySelector('button')).toBeNull();

    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const writer = bootCard(KbisDeskCard, [none]).nativeElement as HTMLElement;
    const upload = writer.querySelector<HTMLButtonElement>('button.upload');
    expect(upload?.textContent).toContain(FR.account.kbisUpload);
    upload?.click();

    expect(openedPanel()?.component).toBe(KbisPanel);
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', kbis: null, canManage: true });
  });
});
