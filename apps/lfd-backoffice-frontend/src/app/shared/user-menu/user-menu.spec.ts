import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { UserMenu } from './user-menu';

/** La bulle de la personne connectée, dans l'en-tête (2026-10-28). */
describe('UserMenu', () => {
  function mount() {
    TestBed.configureTestingModule({ imports: [UserMenu] });
    const fixture = TestBed.createComponent(UserMenu);
    fixture.componentRef.setInput('name', 'Hugo Heynard');
    fixture.componentRef.setInput('email', 'hugo@lfc.test');
    fixture.componentRef.setInput('roleLabel', 'Administrateur');
    let out = 0;
    fixture.componentInstance.loggedOut.subscribe(() => (out += 1));
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement, outs: () => out };
  }

  it('montre les initiales, et ouvre l’adresse, le rôle et la déconnexion', async () => {
    const { fixture, root } = mount();

    expect(root.querySelector('[data-user-menu]')?.textContent).toContain('HH');
    root.querySelector<HTMLButtonElement>('[data-user-menu]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const panel = document.querySelector('[data-user-menu-panel]');
    expect(panel?.textContent).toContain('hugo@lfc.test');
    expect(panel?.textContent).toContain('Administrateur');
  });

  it('« Déconnexion » remonte le geste', async () => {
    const { fixture, outs } = mount();
    (document.querySelector('[data-user-menu]') as HTMLButtonElement | null)?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    (document.querySelector('[data-user-menu-logout]') as HTMLButtonElement | null)?.click();

    expect(outs()).toBe(1);
  });
});
