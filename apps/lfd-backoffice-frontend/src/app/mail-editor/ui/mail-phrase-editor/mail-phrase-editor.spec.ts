import { TestBed } from '@angular/core/testing';
import type { MailEditorPhraseView, MailLocale } from '@lfd/mail-blocks';
import { describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { MailEditorService } from '../../data/mail-editor.service';
import { MailPhrasesStore } from '../../state/mail-phrases-store';
import { MailPhraseEditor } from './mail-phrase-editor';

const PHRASE: MailEditorPhraseView = {
  path: 'title.paid',
  variables: ['ref', 'name'],
  requiredVariables: ['ref'],
  locales: {
    fr: {
      default: 'Commande {ref} payée',
      draftState: 'set',
      draftText: 'Commande {ref} réglée',
      publishedText: null,
      revision: 1,
    },
    en: {
      default: 'Order {ref} paid',
      draftState: 'unchanged',
      draftText: null,
      publishedText: null,
      revision: 0,
    },
    it: {
      default: null,
      draftState: 'unchanged',
      draftText: null,
      publishedText: null,
      revision: 0,
    },
  },
};

async function render(locale: MailLocale, canWrite: boolean) {
  TestBed.configureTestingModule({
    imports: [MailPhraseEditor],
    providers: [
      MailPhrasesStore,
      { provide: MailEditorService, useValue: {} },
      { provide: NotifyService, useValue: { error: vi.fn(), success: vi.fn() } },
    ],
  });
  TestBed.inject(MailPhrasesStore).use('customer.order-placed', [PHRASE]);
  const fixture = TestBed.createComponent(MailPhraseEditor);
  fixture.componentRef.setInput('phrase', PHRASE);
  fixture.componentRef.setInput('locale', locale);
  fixture.componentRef.setInput('canWrite', canWrite);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('MailPhraseEditor — une phrase dans la langue choisie', () => {
  it('montre le brouillon, son état, le texte d’origine, « Rétablir » et les variables', async () => {
    const element = await render('fr', true);
    expect(element.querySelector('textarea')?.value).toBe('Commande {ref} réglée');
    expect(element.textContent).toContain('Brouillon');
    expect(element.textContent).toContain('Texte d’origine : Commande {ref} payée');
    expect(element.querySelector('[data-reset]')).not.toBeNull();
    expect(element.querySelector('[aria-label="Insérer {ref}, obligatoire"]')).not.toBeNull();
    expect(element.querySelector('[aria-label="Insérer {name}"]')).not.toBeNull();
  });

  it('suit la langue : l’anglais intact n’a rien à rétablir', async () => {
    const element = await render('en', true);
    expect(element.querySelector('textarea')?.value).toBe('Order {ref} paid');
    expect(element.querySelector('[data-reset]')).toBeNull();
  });

  it('sans le droit d’écrire : lecture seule, variables en badges', async () => {
    const element = await render('fr', false);
    expect(element.querySelector('textarea')?.readOnly).toBe(true);
    expect(element.querySelector('[data-reset]')).toBeNull();
    expect(element.textContent).toContain('Variables permises');
  });
});
