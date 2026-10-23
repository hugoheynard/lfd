import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { MailCopyService } from '../../data/mail-copy.service';
import { mailAdminView, mailView, previewView } from '../../mail-copy.testing';
import { MailCopyStore } from '../../state/mail-copy-store';
import { MailDraftWriter } from '../../state/mail-draft-writer';
import { MailPreview } from './mail-preview';

const MAIL = mailView('customer.order-placed', [], { followsLocale: false });

async function render(permissions: readonly StaffPermission[] = ['b2b_storefront:write']) {
  const api = {
    load: vi.fn(() => Promise.resolve(mailAdminView([MAIL]))),
    preview: vi.fn(() =>
      Promise.resolve(
        previewView({
          attachments: [
            { filename: 'mandat.pdf', contentType: 'application/pdf', inline: false },
            { filename: 'logo.png', contentType: 'image/png', inline: true },
          ],
        }),
      ),
    ),
    sendTrial: vi.fn(() => Promise.resolve()),
  };
  const notify = { error: vi.fn(), success: vi.fn() };
  TestBed.configureTestingModule({
    imports: [MailPreview],
    providers: [
      MailCopyStore,
      MailDraftWriter,
      { provide: MailCopyService, useValue: api },
      { provide: NotifyService, useValue: notify },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  await TestBed.inject(MailCopyStore).load();
  const fixture = TestBed.createComponent(MailPreview);
  fixture.componentRef.setInput('mail', MAIL);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  return { api, notify, fixture, element: fixture.nativeElement as HTMLElement };
}

describe('MailPreview — le vrai gabarit, des données d’exemple', () => {
  it('rend l’objet et le corps dans un cadre isolé, avec les pièces jointes nommées', async () => {
    const { api, element } = await render();
    expect(api.preview).toHaveBeenCalledWith('customer.order-placed', 'fr', 'draft');
    expect(element.textContent).toContain('Commande EXEMPLE-1 reçue');
    const frame = element.querySelector('iframe');
    expect(frame?.getAttribute('sandbox')).toBe('');
    expect(frame?.getAttribute('srcdoc')).toContain('Bonjour EXEMPLE');
    expect(element.textContent).toContain('mandat.pdf');
    expect(element.textContent).not.toContain('logo.png');
  });

  it('dit qu’un e-mail qui ne suit pas la langue part toujours en français', async () => {
    const { element } = await render();
    expect(element.textContent).toContain('Part toujours en français');
  });

  it('relit l’aperçu dans la source choisie', async () => {
    const { api, fixture } = await render();
    (fixture.componentInstance as MailPreview).source.set('published');
    await fixture.whenStable();
    expect(api.preview).toHaveBeenLastCalledWith('customer.order-placed', 'fr', 'published');
  });

  it('« M’envoyer un essai » envoie l’aperçu affiché', async () => {
    const { api, element, fixture, notify } = await render();
    const button = [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('M’envoyer un essai'),
    );
    button?.click();
    await fixture.whenStable();
    expect(api.sendTrial).toHaveBeenCalledWith('customer.order-placed', 'fr', 'draft');
    expect(notify.success).toHaveBeenCalled();
  });

  it('pas d’essai sans le droit d’écrire', async () => {
    const { element } = await render(['b2b_storefront:read']);
    expect(element.textContent).not.toContain('M’envoyer un essai');
  });
});
