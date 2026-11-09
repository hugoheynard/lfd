import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { MailUnsubscribeFooter } from './mail-unsubscribe-footer';

function render() {
  TestBed.configureTestingModule({ imports: [MailUnsubscribeFooter] });
  const fixture = TestBed.createComponent(MailUnsubscribeFooter);
  fixture.componentRef.setInput('footer', {
    before: 'Vous recevez cet e-mail car vous êtes inscrit. ',
    label: 'Se désinscrire',
    after: '.',
  });
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('MailUnsubscribeFooter — le pied verrouillé (U4)', () => {
  it('dit la phrase système, lien compris, sans lien cliquable ni champ éditable', () => {
    const element = render();
    expect(element.querySelector('[data-unsubscribe-sentence]')?.textContent?.trim()).toBe(
      'Vous recevez cet e-mail car vous êtes inscrit. Se désinscrire.',
    );
    expect(element.querySelector('a')).toBeNull();
    expect(element.querySelector('[contenteditable]')).toBeNull();
    expect(element.textContent).toContain('non modifiable');
  });
});
