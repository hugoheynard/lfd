import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { MailSenderPayload, MailSenderView } from '@lfd/mail-blocks';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { MailSendersService } from '../../data/mail-senders.service';
import { identityOf, MailSenderCard } from './mail-sender-card';

const FALLBACK_VIEW: MailSenderView = {
  space: 'lfd',
  identity: null,
  fallback: { fromAddress: 'no-reply@lafoliecoffee.info', replyToAddress: null },
  revision: 0,
  changed: null,
  verifiedDomains: ['lafoliecoffee.info', 'lfd-backoffice.com'],
};

async function setup(options: {
  readonly view?: MailSenderView;
  readonly canWrite?: boolean;
  readonly change?: () => Promise<void>;
}) {
  const api = {
    load: vi.fn(() => Promise.resolve(options.view ?? FALLBACK_VIEW)),
    change: vi.fn<(space: string, payload: MailSenderPayload, key: string) => Promise<void>>(
      options.change ?? (() => Promise.resolve()),
    ),
  };
  TestBed.configureTestingModule({
    imports: [MailSenderCard],
    providers: [
      { provide: MailSendersService, useValue: api },
      { provide: PermissionsStore, useValue: { can: () => options.canWrite ?? true } },
    ],
  });
  const fixture = TestBed.createComponent(MailSenderCard);
  fixture.componentRef.setInput('space', 'lfd');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const component = fixture.componentInstance;
  const element = fixture.nativeElement as HTMLElement;
  const type = async (selector: string, value: string) => {
    const input = element.querySelector<HTMLInputElement>(`${selector} input`);
    if (input === null) throw new Error(`champ ${selector} absent`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { api, component, element, type, settle };
}

describe('MailSenderCard — l’expéditeur d’un espace', () => {
  it('dit l’identité par défaut quand l’espace n’en a pas, et les domaines vérifiés', async () => {
    const { element } = await setup({});
    expect(element.querySelector('[data-current]')?.textContent).toContain(
      'Par défaut : no-reply@lafoliecoffee.info',
    );
    expect(element.textContent).toContain(
      'Domaines vérifiés chez Resend : lafoliecoffee.info, lfd-backoffice.com.',
    );
  });

  it('montre l’identité de l’espace quand il en a une', async () => {
    const { element } = await setup({
      view: {
        ...FALLBACK_VIEW,
        identity: {
          senderName: 'La Folie Douce',
          fromAddress: 'no-reply@lfd-backoffice.com',
          replyToAddress: null,
        },
        revision: 2,
      },
      canWrite: false,
    });
    expect(element.querySelector('[data-current]')?.textContent).toContain(
      'La Folie Douce <no-reply@lfd-backoffice.com> — réponses à no-reply@lfd-backoffice.com',
    );
    expect(element.querySelector('[data-sender-name]')).toBeNull();
  });

  it('montre les refus de forme avant l’envoi, et retient l’enregistrement', async () => {
    const { component, element, type, api } = await setup({});
    await type('[data-sender-name]', 'La Folie Douce');
    await type('[data-from-address]', 'pas-une-adresse');
    expect(element.querySelector('[data-violation]')?.textContent).toContain(
      'pas une adresse e-mail',
    );
    await component.save();
    expect(api.change).not.toHaveBeenCalled();
  });

  /** Décision du 2026-11-07 : l'adresse de réponse est obligatoire, un no-reply est refusé. */
  it('refuse avant l’envoi une adresse de réponse absente ou en no-reply', async () => {
    const { component, element, type, api } = await setup({});
    await type('[data-sender-name]', 'La Folie Douce');
    await type('[data-from-address]', 'no-reply@lfd-backoffice.com');
    const lost = 'Les réponses à vos e-mails seraient perdues';
    expect(element.querySelector('[data-violation]')?.textContent).toContain(lost);
    await type('[data-reply-to]', 'ne-pas-repondre@lfd-backoffice.com');
    expect(element.querySelector('[data-violation]')?.textContent).toContain(lost);
    await component.save();
    expect(api.change).not.toHaveBeenCalled();
  });

  it('enregistre avec la révision lue, et renvoie la même clé d’intention au réessai', async () => {
    let attempt = 0;
    const { component, element, type, api, settle } = await setup({
      change: () => {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(
              new HttpErrorResponse({
                status: 409,
                error: { message: 'lfd-backoffice.com n’est pas vérifié chez Resend.' },
              }),
            )
          : Promise.resolve();
      },
    });
    await type('[data-sender-name]', 'La Folie Douce');
    await type('[data-from-address]', 'no-reply@lfd-backoffice.com');
    await type('[data-reply-to]', 'support@lfd-backoffice.com');
    await component.save();
    await settle();
    expect(element.querySelector('[data-gesture-error]')?.textContent).toContain(
      'pas vérifié chez Resend',
    );
    await component.save();
    await settle();
    expect(api.change).toHaveBeenCalledTimes(2);
    const [first, second] = api.change.mock.calls;
    expect(first?.[1]).toEqual({
      identity: {
        senderName: 'La Folie Douce',
        fromAddress: 'no-reply@lfd-backoffice.com',
        replyToAddress: 'support@lfd-backoffice.com',
      },
      expectedRevision: 0,
    });
    expect(second?.[2]).toBe(first?.[2]);
    expect(element.querySelector('[data-saved]')).not.toBeNull();
  });

  it('une adresse de réponse vide vaut « aucune »', () => {
    expect(identityOf({ senderName: 'A', fromAddress: ' a@b.fr ', replyToAddress: '  ' })).toEqual({
      senderName: 'A',
      fromAddress: 'a@b.fr',
      replyToAddress: null,
    });
  });
});
