import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { MailCharterColorField } from './mail-charter-color-field';

function setup(value: string, readOnly = false) {
  TestBed.configureTestingModule({ imports: [MailCharterColorField] });
  const fixture = TestBed.createComponent(MailCharterColorField);
  fixture.componentRef.setInput('label', 'Texte');
  fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('readOnly', readOnly);
  fixture.componentRef.setInput('violations', [
    { code: 'charter-contrast-too-low', field: 'colors.text', message: 'Contraste de 2,10:1' },
  ]);
  const emitted: string[] = [];
  fixture.componentInstance.valueChange.subscribe((next) => emitted.push(next));
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement, emitted };
}

describe('MailCharterColorField', () => {
  it('donne au sélecteur la couleur bien formée, et remonte la saisie en minuscules', () => {
    const { element, emitted } = setup('#1A3157');
    const picker = element.querySelector<HTMLInputElement>('[data-picker]');
    expect(picker?.value).toBe('#1a3157');
    if (picker !== null) {
      picker.value = '#ff0000';
      picker.dispatchEvent(new Event('input'));
    }
    expect(emitted).toEqual(['#ff0000']);
  });

  it('montre les refus du réglage sous le champ', () => {
    const { element } = setup('#1a3157');
    expect(element.querySelector('[data-violation]')?.textContent).toContain('2,10:1');
  });

  it('en lecture seule, pas de sélecteur', () => {
    const { element } = setup('#1a3157', true);
    expect(element.querySelector('[data-picker]')).toBeNull();
  });
});
