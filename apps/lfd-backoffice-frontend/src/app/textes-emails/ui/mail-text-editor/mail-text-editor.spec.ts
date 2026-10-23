import { TestBed } from '@angular/core/testing';
import type { MailCopyTextView, StaffPermission } from '@lfd/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { MailCopyService } from '../../data/mail-copy.service';
import { mailAdminView, mailTextView, mailView } from '../../mail-copy.testing';
import { MailCopyStore } from '../../state/mail-copy-store';
import { MailDraftWriter } from '../../state/mail-draft-writer';
import { MailTextEditor } from './mail-text-editor';

const MAIL = 'customer.order-placed';
const SUBJECT = mailTextView(MAIL, 'subject', 'Commande {ref}', {
  variables: ['ref', 'total'],
  requiredVariables: ['ref'],
  staleTranslations: ['it'],
  locales: { en: { publishedText: 'Order {ref}' } },
});

async function render(
  text: MailCopyTextView = SUBJECT,
  options: { followsLocale?: boolean; permissions?: readonly StaffPermission[] } = {},
) {
  const permissions = options.permissions ?? ['b2b_storefront:write'];
  TestBed.configureTestingModule({
    imports: [MailTextEditor],
    providers: [
      MailCopyStore,
      MailDraftWriter,
      {
        provide: MailCopyService,
        useValue: {
          load: () => Promise.resolve(mailAdminView([mailView(MAIL, [text])])),
          saveDraft: () => Promise.resolve(),
        },
      },
      { provide: NotifyService, useValue: { error: vi.fn() } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  await TestBed.inject(MailCopyStore).load();
  const fixture = TestBed.createComponent(MailTextEditor);
  fixture.componentRef.setInput('text', text);
  fixture.componentRef.setInput('followsLocale', options.followsLocale ?? true);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const field = (locale: string): HTMLTextAreaElement | null =>
    element.querySelector(`[data-locale="${locale}"] textarea`);
  return { fixture, element, field, writer: TestBed.inject(MailDraftWriter) };
}

describe('MailTextEditor — un texte, trois langues côte à côte', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('montre FR, EN et IT, chacune pré-remplie de ce que l’e-mail dira', async () => {
    const { element, field } = await render();
    expect(element.querySelectorAll('fold-textarea')).toHaveLength(3);
    expect(field('fr')?.value).toBe('Commande {ref}');
    expect(field('en')?.value).toBe('Order {ref}');
    expect(element.textContent).toContain('Objet');
    expect(element.textContent).toContain('Publié');
  });

  it('signale la traduction en retard, et les variables obligatoires', async () => {
    const { element } = await render();
    expect(element.querySelector('[data-locale="it"]')?.textContent).toContain(
      'Traduction en retard',
    );
    expect(element.querySelector('[data-locale="fr"]')?.textContent).not.toContain(
      'Traduction en retard',
    );
    expect(element.textContent).toContain('Obligatoire dans chaque langue : {ref}.');
  });

  it('insère une variable au curseur du dernier champ touché', async () => {
    const { element, field, fixture, writer } = await render();
    const en = field('en');
    en?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    en?.setSelectionRange(5, 5);
    await fixture.whenStable();
    const button = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === '{total}',
    );
    button?.click();
    await fixture.whenStable();
    expect(writer.textOf(SUBJECT, 'en')).toBe('Order{total} {ref}');
  });

  it('dit qu’un e-mail qui ne suit pas la langue part toujours en français', async () => {
    const { element } = await render(SUBJECT, { followsLocale: false });
    expect(element.querySelector('[data-locale="en"]')?.textContent).toContain(
      'part toujours en français',
    );
    expect(element.querySelector('[data-locale="fr"]')?.textContent).not.toContain(
      'part toujours en français',
    );
  });

  it('sans droit d’écrire : champs en lecture, ni « Rétablir » ni insertion', async () => {
    const { element, field } = await render(SUBJECT, { permissions: ['b2b_storefront:read'] });
    expect(field('fr')?.readOnly).toBe(true);
    expect(element.textContent).not.toContain('Rétablir');
    expect(element.textContent).toContain('Variables permises');
  });

  it('le texte d’origine changé depuis la modification : badge, avertissement, l’ancien et le nouveau', async () => {
    const drifted = mailTextView(MAIL, 'subject', 'Votre commande {ref}', {
      locales: {
        en: {
          publishedText: 'Order {ref}',
          defaultChangedSince: { previousDefault: 'Commande {ref}' },
        },
      },
    });
    const { element } = await render(drifted);
    const en = element.querySelector('[data-locale="en"]');
    expect(en?.textContent).toContain('Texte d’origine changé');
    expect(en?.textContent).toContain('Le texte d’origine a changé depuis votre modification');
    expect(en?.querySelector('s')?.textContent).toBe('Commande {ref}');
    expect(en?.textContent).toContain('Maintenant : Votre commande {ref}');
    expect(en?.textContent).toContain('Rétablir');
    expect(element.querySelector('[data-locale="fr"]')?.textContent).not.toContain(
      'Texte d’origine changé',
    );
  });
});
