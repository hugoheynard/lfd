import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { TemplateNameForm } from './template-name-form';

describe('TemplateNameForm', () => {
  it('émet nom et description, part des valeurs initiales, et se désarme à vide', () => {
    const fixture = TestBed.createComponent(TemplateNameForm);
    fixture.componentRef.setInput('initial', 'Noël');
    fixture.componentRef.setInput('initialDescription', 'Pour les fêtes');
    const emitted: unknown[] = [];
    fixture.componentInstance.submitted.subscribe((name) => emitted.push(name));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const submit = root.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submit?.disabled).toBe(false);
    root.querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(emitted).toEqual([{ name: 'Noël', description: 'Pour les fêtes' }]);

    fixture.componentRef.setInput('initial', '   ');
    fixture.detectChanges();
    expect(submit?.disabled).toBe(true);
  });
});
