import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { MailSendersService } from '../../data/mail-senders.service';
import { MailSenderPage } from './mail-sender-page';

function setup(space: string) {
  const api = { load: vi.fn(() => new Promise(() => undefined)) };
  TestBed.configureTestingModule({
    imports: [MailSenderPage],
    providers: [
      provideRouter([]),
      { provide: MailSendersService, useValue: api },
      { provide: PermissionsStore, useValue: { can: () => false } },
    ],
  });
  const fixture = TestBed.createComponent(MailSenderPage);
  fixture.componentRef.setInput('space', space);
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement, api };
}

describe('MailSenderPage — l’onglet Expéditeur d’un espace', () => {
  it('montre la carte de l’expéditeur sous les onglets de l’espace', () => {
    const { element, api } = setup('lfc');
    expect(api.load).toHaveBeenCalledWith('lfc');
    expect(element.querySelector('fold-back-link a')?.getAttribute('href')).toBe('/emails');
    expect(
      element.querySelector('app-mail-space-tabs a[href="/emails/espaces/lfc/expediteur"]'),
    ).not.toBeNull();
    expect(element.querySelector('app-mail-sender-card')).not.toBeNull();
  });

  it('refuse un segment qui n’est pas un espace, sans rien demander', () => {
    const { element, api } = setup('ailleurs');
    expect(api.load).not.toHaveBeenCalled();
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
    expect(element.querySelector('app-mail-space-tabs')).toBeNull();
  });
});
