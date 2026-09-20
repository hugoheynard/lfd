import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LangSwitch, type Lang } from './lang-switch';

@Component({
  standalone: true,
  imports: [LangSwitch],
  template: `<app-lang-switch [(lang)]="lang" [missing]="missing()" [hint]="hint()" />`,
})
class HostComponent {
  readonly lang = signal<Lang>('fr');
  readonly missing = signal<readonly Lang[]>([]);
  readonly hint = signal<string | undefined>(undefined);
}

function render() {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
}

describe('LangSwitch', () => {
  it('propose les trois langues, dans l’ordre', () => {
    const { root } = render();
    const labels = [...root.querySelectorAll('.vt-btn')].map((b) => b.textContent?.trim() ?? '');
    expect(labels).toEqual(['FR', 'EN', 'IT']);
  });

  it('marque d’un point AMBRE la seule langue incomplète', () => {
    const { fixture, host, root } = render();
    host.missing.set(['it']);
    fixture.detectChanges();

    const dotted = [...root.querySelectorAll('.vt-btn')].filter((b) => b.querySelector('.vt-dot'));
    expect(dotted.length).toBe(1);
    expect(dotted[0]?.textContent?.trim()).toBe('IT');
    expect(dotted[0]?.querySelector('.vt-dot')?.classList.contains('warning')).toBe(true);
  });

  it('nomme le point pour un lecteur d’écran — un point ne dit rien tout seul', () => {
    const { fixture, host, root } = render();
    host.missing.set(['en']);
    fixture.detectChanges();

    const segment = [...root.querySelectorAll('.vt-btn')].find(
      (b) => b.textContent?.trim() === 'EN',
    );
    expect(segment?.getAttribute('aria-label')).toBe('EN — traduction incomplète');
  });

  it('n’affiche la phrase d’explication que si on la donne', () => {
    const { fixture, host, root } = render();
    expect(root.querySelector('.ls-hint')).toBeNull();

    host.hint.set('IT : le nom et la description manquent.');
    fixture.detectChanges();
    expect(root.querySelector('.ls-hint')?.textContent).toContain('le nom et la description');
  });

  it('remonte la langue choisie à l’appelant', () => {
    const { fixture, host, root } = render();
    const en = [...root.querySelectorAll<HTMLButtonElement>('.vt-btn')].find(
      (b) => b.textContent?.trim() === 'EN',
    );
    en?.click();
    fixture.detectChanges();
    expect(host.lang()).toBe('en');
  });

  it('ne montre que les langues demandées', () => {
    // Une section peut n'être traduisible que partiellement — le composant ne
    // décide pas des langues, il les reçoit.
    @Component({
      standalone: true,
      imports: [LangSwitch],
      template: `<app-lang-switch [langs]="['fr', 'en']" />`,
    })
    class TwoLangHost {}

    const fixture = TestBed.createComponent(TwoLangHost);
    fixture.detectChanges();
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.vt-btn')].map(
      (b) => b.textContent?.trim() ?? '',
    );
    expect(labels).toEqual(['FR', 'EN']);
  });
});
