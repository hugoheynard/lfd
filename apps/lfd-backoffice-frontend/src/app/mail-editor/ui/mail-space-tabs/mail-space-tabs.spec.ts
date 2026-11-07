import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { MailSpaceTabs } from './mail-space-tabs';

describe('MailSpaceTabs — les onglets d’un espace d’e-mails', () => {
  it('mène, dans cet ordre, à Templates, Charte et Expéditeur de l’espace', () => {
    TestBed.configureTestingModule({ imports: [MailSpaceTabs], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(MailSpaceTabs);
    fixture.componentRef.setInput('space', 'lfd');
    fixture.detectChanges();
    const links = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')];
    expect(links.map((link) => [link.textContent?.trim(), link.getAttribute('href')])).toEqual([
      ['Templates', '/emails/espaces/lfd/templates'],
      ['Charte', '/emails/espaces/lfd/charte'],
      ['Expéditeur', '/emails/espaces/lfd/expediteur'],
    ]);
  });
});
