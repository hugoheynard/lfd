import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { contactDialogCopy } from '../../copy/screens/contact-dialog.copy';
import { ContactDialog } from '../contact-dialog/contact-dialog';
import { CallDialog } from './call-dialog';

/** **« Nous appeler »** — une ligne `tel:` par contact, et la bascule vers « Nous écrire ». */

const FR = contactDialogCopy('fr');

function mount(): {
  fixture: ComponentFixture<CallDialog>;
  closed: unknown[];
  opened: unknown[];
} {
  const closed: unknown[] = [];
  const opened: unknown[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CallDialog],
    providers: [
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (result) => closed.push(result)) },
      {
        provide: FoldPanelHostService,
        useValue: { open: (component: unknown) => opened.push(component) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CallDialog);
  fixture.componentRef.setInput('data', {
    phones: [
      { label: 'Service commercial', number: '04 79 00 00 01' },
      { label: '', number: '+33 4 79 00 00 02' },
    ],
  });
  fixture.detectChanges();
  return { fixture, closed, opened };
}

describe('CallDialog', () => {
  it('une ligne `tel:` par contact, libellé et numéro', () => {
    const el = mount().fixture.nativeElement as HTMLElement;
    const lines = Array.from(el.querySelectorAll('fold-panel-body a[foldButton]'));

    expect(lines.map((a) => a.getAttribute('href'))).toEqual([
      'tel:0479000001',
      'tel:+33479000002',
    ]);
    expect(lines[0]?.textContent).toContain('Service commercial · 04 79 00 00 01');
    expect(lines[1]?.textContent?.trim()).toBe('+33 4 79 00 00 02');
  });

  it('« Écrire plutôt » ferme et ouvre « Nous écrire »', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { fixture, closed, opened } = mount();
    const write = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find((b) => b.textContent?.includes(FR.callWrite));

    write?.click();

    expect(closed).toEqual([undefined]);
    expect(opened).toEqual([ContactDialog]);
    vi.unstubAllGlobals();
  });
});
