import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { MailCopyService } from '../../data/mail-copy.service';
import {
  mailAdminView,
  mailTextView,
  mailView,
  previewView,
  sectionText,
  sectionView,
} from '../../mail-copy.testing';
import { MailCopyPage } from './mail-copy-page';

const PENDING = mailView('customer.order-placed', [
  mailTextView('customer.order-placed', 'subject', 'A', {
    locales: {
      fr: { draftState: 'set', draftText: 'B' },
      en: { draftState: 'set', draftText: 'C' },
    },
  }),
]);

async function render(
  load: () => Promise<unknown>,
  permissions: readonly StaffPermission[] = ['b2b_storefront:write'],
) {
  TestBed.configureTestingModule({
    imports: [MailCopyPage],
    providers: [
      {
        provide: MailCopyService,
        useValue: {
          load: vi.fn(load),
          preview: () => Promise.resolve(previewView()),
          publish: () => Promise.resolve({ version: 4 }),
        },
      },
      { provide: NotifyService, useValue: { error: vi.fn(), success: vi.fn() } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(MailCopyPage);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('MailCopyPage — Textes des e-mails', () => {
  it('annonce ce qui attend, avec « Publier », et ouvre le premier e-mail', async () => {
    const element = await render(() => Promise.resolve(mailAdminView([PENDING])));
    expect(element.querySelector('fold-callout')?.textContent).toContain(
      '2 modifications en attente',
    );
    expect(element.textContent).toContain('Publier');
    expect(element.textContent).toContain('Commande passée');
    expect(element.textContent).toContain('Le client, quand il passe sa commande');
  });

  it('sans le droit d’écrire, le bandeau reste mais pas « Publier »', async () => {
    const element = await render(
      () => Promise.resolve(mailAdminView([PENDING])),
      ['b2b_storefront:read'],
    );
    expect(element.textContent).toContain('2 modifications en attente');
    expect(element.querySelector('fold-inline-confirm')).toBeNull();
  });

  it('dit qu’un e-mail part toujours en français', async () => {
    const element = await render(() =>
      Promise.resolve(mailAdminView([mailView('staff.invited', [], { followsLocale: false })])),
    );
    expect(element.textContent).toContain('Cet e-mail part toujours en français');
  });

  it('un échec de lecture passe par l’état d’erreur fold', async () => {
    const element = await render(() => Promise.reject(new Error('réseau')));
    expect(element.querySelector('fold-empty-state')?.textContent).toContain(
      'Les textes des e-mails n’ont pas pu être lus',
    );
  });

  it('aucun e-mail : l’état vide fold', async () => {
    const element = await render(() => Promise.resolve(mailAdminView([])));
    expect(element.querySelector('fold-empty-state')?.textContent).toContain('Aucun e-mail');
  });

  it('les cadres en tête, puis une carte par section dans l’ordre du brouillon', async () => {
    const key = 'customer.order-placed';
    const mail = mailView(key, [mailTextView(key, 'subject', 'Commande {ref}')], {
      frames: { subject: [sectionText('subject')], header: [] },
      sections: [
        sectionView('summary', 'Récapitulatif', 0, [], 'system'),
        sectionView('title', 'Titre', 1),
      ],
      sectionOrder: { draftState: 'set', draft: ['summary', 'title'] },
    });
    const element = await render(() => Promise.resolve(mailAdminView([mail])));
    const cards = [...element.querySelectorAll('[data-card]')].map((card) =>
      card.getAttribute('data-card'),
    );
    expect(cards).toEqual(['frame:subject', 'frame:header', 'section:summary', 'section:title']);
    expect(element.textContent).toContain('Ordre modifié');
    expect(element.textContent).toContain('Rétablir l’ordre');
  });
});
