import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { MailPublishDialog, type MailPublishDialogData } from './mail-publish-dialog';

async function render(overrides: Partial<MailPublishDialogData> = {}) {
  const closedWith: (boolean | undefined)[] = [];
  const publish = vi.fn(() => Promise.resolve<string | null>(null));
  const data: MailPublishDialogData = {
    recipients: 'les clients',
    issues: signal<readonly string[]>([]),
    pendingPhrases: signal(2),
    saveRefusal: signal<string | null>(null),
    publish,
    ...overrides,
  };
  TestBed.configureTestingModule({
    imports: [MailPublishDialog],
    providers: [
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef<boolean>(1, (result) => closedWith.push(result)),
      },
    ],
  });
  const fixture = TestBed.createComponent(MailPublishDialog);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const confirm = () =>
    element.querySelector<HTMLButtonElement>('[data-confirm] button, button[data-confirm]');
  return { fixture, element, closedWith, publish: data.publish, confirm };
}

describe('MailPublishDialog — la fenêtre de « Publier »', () => {
  it('sans refus : dit ce qui part et les phrases qui partent avec, publie et ferme', async () => {
    const { fixture, element, closedWith, publish, confirm } = await render();
    expect(element.querySelector('[data-message]')?.textContent).toContain(
      'Dès le prochain envoi, les clients recevront cet e-mail',
    );
    expect(element.querySelector('[data-pending]')?.textContent).toContain(
      '2 phrases en brouillon',
    );
    expect(element.querySelector('[data-issues]')).toBeNull();
    expect(confirm()?.disabled).toBe(false);
    confirm()?.click();
    await fixture.whenStable();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(closedWith).toEqual([true]);
  });

  it('avec des refus : les liste, et le bouton est désactivé', async () => {
    const { element, publish, confirm } = await render({
      issues: signal(['Le bloc « Bonjour » n’est pas traduit en anglais.']),
    });
    expect(element.querySelector('[data-issues]')?.textContent).toContain('pas traduit en anglais');
    expect(confirm()?.disabled).toBe(true);
    confirm()?.click();
    expect(publish).not.toHaveBeenCalled();
  });

  it('brouillon refusé : le dit, et rien ne se publie', async () => {
    const { element, confirm } = await render({ saveRefusal: signal('Un bloc est vide.') });
    expect(element.querySelector('[data-save-refusal]')?.textContent).toContain(
      'Un bloc est vide.',
    );
    expect(confirm()?.disabled).toBe(true);
  });

  it('le refus du serveur reste dans la fenêtre', async () => {
    const { fixture, element, closedWith, confirm } = await render({
      publish: vi.fn(() => Promise.resolve<string | null>('Rien à publier.')),
    });
    confirm()?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('[data-error]')?.textContent).toContain('Rien à publier.');
    expect(closedWith).toEqual([]);
  });
});
