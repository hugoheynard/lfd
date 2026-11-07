import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import {
  MailTrialDialog,
  type MailTrialChoice,
  type MailTrialDialogData,
} from './mail-trial-dialog';

async function render(send: MailTrialDialogData['send'], cases = 2) {
  const closedWith: (boolean | undefined)[] = [];
  TestBed.configureTestingModule({
    imports: [MailTrialDialog],
    providers: [
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef<boolean>(1, (result) => closedWith.push(result)),
      },
    ],
  });
  const fixture = TestBed.createComponent(MailTrialDialog);
  fixture.componentRef.setInput('data', {
    locale: 'fr',
    caseId: 'paid',
    source: 'draft',
    locales: [
      { value: 'fr', label: 'Français' },
      { value: 'en', label: 'Anglais' },
    ],
    cases: [
      { value: 'paid', label: 'Payée' },
      { value: 'due', label: 'À régler' },
    ].slice(0, cases),
    send,
  } satisfies MailTrialDialogData);
  fixture.detectChanges();
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const confirm = () => element.querySelector<HTMLButtonElement>('button[data-confirm]');
  return { fixture, element, closedWith, confirm };
}

describe('MailTrialDialog — la fenêtre « M’envoyer un essai »', () => {
  it('reprend les choix de la page, les laisse changer, envoie et ferme', async () => {
    const send = vi.fn((_choice: MailTrialChoice) => Promise.resolve<string | null>(null));
    const { fixture, element, closedWith, confirm } = await render(send);
    expect(element.querySelector('[data-trial-case]')).not.toBeNull();
    expect(element.querySelector('[data-recipient]')?.textContent).toContain('votre adresse');
    fixture.componentInstance.locale.set('en');
    fixture.componentInstance.source.set('published');
    confirm()?.click();
    await fixture.whenStable();
    expect(send).toHaveBeenCalledWith({ locale: 'en', caseId: 'paid', source: 'published' });
    expect(closedWith).toEqual([true]);
  });

  it('un seul cas : pas de choix de cas ; un refus reste dans la fenêtre', async () => {
    const send = vi.fn(() => Promise.resolve<string | null>('L’essai n’a pas pu être envoyé.'));
    const { fixture, element, closedWith, confirm } = await render(send, 1);
    expect(element.querySelector('[data-trial-case]')).toBeNull();
    confirm()?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('[data-error]')?.textContent).toContain('pas pu être envoyé');
    expect(closedWith).toEqual([]);
  });
});
