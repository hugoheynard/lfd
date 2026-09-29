import { TestBed } from '@angular/core/testing';
import type { LegalDocumentParagraphPayload } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { EMPTY_LEGAL_PARAGRAPH, LegalParagraphForm } from './legal-paragraph-form';

function fill(control: Element | null, value: string): void {
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    control.value = value;
    control.dispatchEvent(new Event('input'));
  }
}

describe('LegalParagraphForm', () => {
  it('part du texte initial, nomme ce qui manque, et rend la saisie entière', () => {
    const fixture = TestBed.createComponent(LegalParagraphForm);
    fixture.componentRef.setInput('submitLabel', 'Valider');
    fixture.componentRef.setInput('initial', {
      ...EMPTY_LEGAL_PARAGRAPH,
      fr: { title: 'Départ', body: '' },
    });
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const submitted: LegalDocumentParagraphPayload[] = [];
    fixture.componentInstance.submitted.subscribe((payload) => submitted.push(payload));

    const blocks = [...host.querySelectorAll('fold-fieldset')];
    const first = blocks[0]?.querySelector('input');
    expect(first instanceof HTMLInputElement ? first.value : '').toBe('Départ');
    expect(host.textContent).toContain('Encore à écrire : Français, English, Italiano');

    const submit = [...host.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Valider'),
    );
    expect(submit?.disabled).toBe(true);

    blocks.forEach((block, index) => {
      if (index > 0) {
        fill(block.querySelector('input'), `T${index}`);
      }
      fill(block.querySelector('textarea'), `C${index}`);
    });
    fixture.detectChanges();

    expect(submit?.disabled).toBe(false);
    submit?.click();
    expect(submitted).toEqual([
      {
        fr: { title: 'Départ', body: 'C0' },
        en: { title: 'T1', body: 'C1' },
        it: { title: 'T2', body: 'C2' },
      },
    ]);
  });
});
