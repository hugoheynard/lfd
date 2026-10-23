import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { MailCopyService } from '../../data/mail-copy.service';
import { mailAdminView, mailView } from '../../mail-copy.testing';
import { MailCopyStore } from '../../state/mail-copy-store';
import { MailList } from './mail-list';

async function render() {
  const pending = {
    ...mailView('customer.payment-failed', [], { family: 'payment' }),
    pendingCount: 2,
  };
  TestBed.configureTestingModule({
    imports: [MailList],
    providers: [
      MailCopyStore,
      {
        provide: MailCopyService,
        useValue: {
          load: () =>
            Promise.resolve(
              mailAdminView([
                mailView('customer.order-placed', []),
                pending,
                mailView('staff.invited', [], { audience: 'team', family: 'team' }),
              ]),
            ),
        },
      },
      { provide: NotifyService, useValue: { error: vi.fn() } },
      { provide: PermissionsStore, useValue: { can: (_: StaffPermission) => true } },
    ],
  });
  const store = TestBed.inject(MailCopyStore);
  await store.load();
  const fixture = TestBed.createComponent(MailList);
  await fixture.whenStable();
  return { fixture, store, element: fixture.nativeElement as HTMLElement };
}

describe('MailList — par destinataire, puis par moment', () => {
  it('range les e-mails sous leur destinataire et leur moment, en intitulés lisibles', async () => {
    const { element } = await render();
    const text = element.textContent ?? '';
    expect(text.indexOf('Clients')).toBeLessThan(text.indexOf('Équipe'));
    expect(text).toContain('Paiement');
    const labels = [...element.querySelectorAll('button[fold-menu-item]')].map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual([
      'Commande passée',
      expect.stringContaining('Paiement refusé'),
      'Invitation au back-office',
    ]);
  });

  it('montre ce qui attend « Publier », et ouvre l’e-mail cliqué', async () => {
    const { element, fixture, store } = await render();
    expect(element.textContent).toContain('2 à publier');
    [...element.querySelectorAll<HTMLButtonElement>('button[fold-menu-item]')]
      .find((b) => b.textContent?.includes('Invitation au back-office'))
      ?.click();
    await fixture.whenStable();
    expect(store.current()?.mail).toBe('staff.invited');
  });
});
