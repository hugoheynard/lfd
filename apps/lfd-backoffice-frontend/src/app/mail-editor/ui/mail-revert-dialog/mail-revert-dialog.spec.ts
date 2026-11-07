import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { MailRevertDialog } from './mail-revert-dialog';

describe('MailRevertDialog — la fenêtre « Revenir au modèle d’origine »', () => {
  it('dit ce qui est effacé, revient et ferme ; un refus reste dans la fenêtre', async () => {
    const closedWith: (boolean | undefined)[] = [];
    const revert = vi
      .fn()
      .mockResolvedValueOnce('Quelqu’un a écrit entre-temps.')
      .mockResolvedValueOnce(null);
    TestBed.configureTestingModule({
      imports: [MailRevertDialog],
      providers: [
        {
          provide: FoldPanelRef,
          useValue: new FoldPanelRef<boolean>(1, (result) => closedWith.push(result)),
        },
      ],
    });
    const fixture = TestBed.createComponent(MailRevertDialog);
    fixture.componentRef.setInput('data', { erased: ['Le brouillon est effacé.'], revert });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-erased]')?.textContent).toContain(
      'Le brouillon est effacé.',
    );
    const confirm = element.querySelector<HTMLButtonElement>('button[data-confirm]');
    confirm?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('[data-error]')?.textContent).toContain('entre-temps');
    expect(closedWith).toEqual([]);
    confirm?.click();
    await fixture.whenStable();
    expect(closedWith).toEqual([true]);
  });
});
