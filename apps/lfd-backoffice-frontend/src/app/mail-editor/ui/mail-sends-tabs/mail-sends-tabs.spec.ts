import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { MailSendsTabs } from './mail-sends-tabs';

describe('MailSendsTabs — les onglets du suivi (C4)', () => {
  it('mène aux envois et aux désinscriptions et accords', () => {
    TestBed.configureTestingModule({ imports: [MailSendsTabs], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(MailSendsTabs);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const links = [...element.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(links).toEqual(['/emails/envois', '/emails/desinscriptions']);
    expect(element.textContent).toContain('Désinscriptions et accords');
  });
});
