import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { MailSectionView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { MailCopyService } from '../../data/mail-copy.service';
import {
  mailAdminView,
  mailTextView,
  mailView,
  sectionText,
  sectionView,
} from '../../mail-copy.testing';
import { MailCopyStore } from '../../state/mail-copy-store';
import { MailDraftWriter } from '../../state/mail-draft-writer';
import { MailSectionCard } from './mail-section-card';

const KEY = 'customer.order-placed';
const TITLE = sectionView('title', 'Titre', 0, [
  sectionText('title.paid', 'Commande payée par carte'),
  sectionText('title.due', 'Commande à régler'),
]);
const SUMMARY = sectionView('summary', 'Récapitulatif', 1, [], 'system');
const FOOTER = sectionView('footer', 'Pied', 2, [sectionText('footer')]);
const MAIL = mailView(
  KEY,
  [
    mailTextView(KEY, 'subject', 'Commande {ref}'),
    mailTextView(KEY, 'title.paid', 'Payée'),
    mailTextView(KEY, 'title.due', 'À régler'),
    mailTextView(KEY, 'footer', 'À bientôt', {
      locales: {
        it: { publishedText: 'A presto', defaultChangedSince: { previousDefault: 'Ciao' } },
      },
    }),
  ],
  {
    frames: { subject: [sectionText('subject')], header: [] },
    sections: [TITLE, SUMMARY, FOOTER],
    sectionOrder: { revision: 2 },
  },
);

async function render(
  inputs: { section?: MailSectionView; frame?: 'subject'; index?: number },
  permissions: readonly StaffPermission[] = ['b2b_storefront:write'],
  saveSectionOrder: () => Promise<void> = () => Promise.resolve(),
) {
  const api = {
    load: vi.fn(() => Promise.resolve(mailAdminView([MAIL]))),
    saveSectionOrder: vi.fn(saveSectionOrder),
  };
  TestBed.configureTestingModule({
    imports: [MailSectionCard],
    providers: [
      MailCopyStore,
      MailDraftWriter,
      { provide: MailCopyService, useValue: api },
      { provide: NotifyService, useValue: { error: vi.fn(), success: vi.fn() } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  const store = TestBed.inject(MailCopyStore);
  await store.load();
  const fixture = TestBed.createComponent(MailSectionCard);
  fixture.componentRef.setInput('mail', MAIL);
  if (inputs.section) {
    fixture.componentRef.setInput('section', inputs.section);
  }
  if (inputs.frame) {
    fixture.componentRef.setInput('frame', inputs.frame);
  }
  fixture.componentRef.setInput('index', inputs.index ?? 0);
  fixture.componentRef.setInput('count', 3);
  await fixture.whenStable();
  fixture.detectChanges();
  return { api, store, fixture, element: fixture.nativeElement as HTMLElement };
}

function button(element: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.getAttribute('aria-label')?.startsWith(label),
  );
}

describe('MailSectionCard — une carte par section', () => {
  it('une section de texte : badge « Texte », ses variantes sous leur nom, le chemin au survol seulement', async () => {
    const { element } = await render({ section: TITLE });
    expect(element.querySelector('fold-badge')?.textContent).toContain('Texte');
    expect(element.textContent).toContain('Commande payée par carte');
    expect(element.textContent).toContain('Commande à régler');
    expect(element.textContent).not.toContain('title.paid');
    expect(element.querySelector('[data-text-path="title.paid"]')?.getAttribute('title')).toBe(
      'Chemin technique : title.paid',
    );
    expect(element.querySelectorAll('fold-textarea')).toHaveLength(6);
  });

  it('une section système : badge « Système », et ce qu’elle montre', async () => {
    const { element } = await render({ section: SUMMARY, index: 1 });
    expect(element.querySelector('fold-badge')?.textContent).toContain('Système');
    expect(element.textContent).toContain('Produit par les données');
  });

  it('un cadre : ni badge, ni flèches', async () => {
    const { element } = await render({ frame: 'subject' });
    expect(element.textContent).toContain('Objet');
    expect(element.querySelector('fold-badge')).toBeNull();
    expect(button(element, 'Monter')).toBeUndefined();
  });

  it('la première ne monte pas ; descendre écrit l’ordre en brouillon avec la révision lue', async () => {
    const { api, element, fixture } = await render({ section: TITLE });
    expect(button(element, 'Monter')?.disabled).toBe(true);
    button(element, 'Descendre')?.click();
    await fixture.whenStable();
    expect(api.saveSectionOrder).toHaveBeenCalledWith({
      mail: KEY,
      order: ['summary', 'title', 'footer'],
      expectedRevision: 2,
    });
    expect(api.load).toHaveBeenCalledTimes(2);
  });

  it('un ordre refusé (400) s’affiche tel que le serveur le dit', async () => {
    const refusal = new HttpErrorResponse({
      status: 400,
      error: { message: 'Ordre invalide : title, summary, footer attendus.' },
    });
    const { element, fixture, store } = await render({ section: TITLE }, undefined, () =>
      Promise.reject(refusal),
    );
    button(element, 'Descendre')?.click();
    await fixture.whenStable();
    expect(store.orderRefusal()).toContain('Ordre invalide');
  });

  it('sans le droit d’écrire, pas de flèches', async () => {
    const { element } = await render({ section: TITLE }, ['b2b_storefront:read']);
    expect(button(element, 'Monter')).toBeUndefined();
  });

  it('désignée dans l’aperçu, elle s’encadre, et le texte désigné aussi', async () => {
    const { element, fixture, store } = await render({ section: TITLE });
    store.spot.set({ card: 'section:title', path: 'title.due' });
    fixture.detectChanges();
    expect(element.querySelector('.sc-spotted')).not.toBeNull();
    expect(element.querySelector('[data-text-path="title.due"]')?.classList).toContain(
      'te-spotted',
    );
  });

  it('survolée, elle fait encadrer sa section dans l’aperçu', async () => {
    const { element, store } = await render({ section: SUMMARY, index: 1 });
    const frame = element.querySelector<HTMLElement>('[data-card]');
    frame?.dispatchEvent(new MouseEvent('mouseenter'));
    expect(store.hoveredSection()).toBe('summary');
    frame?.dispatchEvent(new MouseEvent('mouseleave'));
    expect(store.hoveredSection()).toBeNull();
  });

  it('une carte dont un texte a vu son texte d’origine changer porte le badge ; les autres non', async () => {
    const footer = await render({ section: FOOTER, index: 2 });
    const header = footer.element.querySelector('fold-element-title');
    expect(header?.textContent).toContain('Texte d’origine changé');
    TestBed.resetTestingModule();
    const title = await render({ section: TITLE });
    expect(title.element.querySelector('fold-element-title')?.textContent).not.toContain(
      'Texte d’origine changé',
    );
  });
});
