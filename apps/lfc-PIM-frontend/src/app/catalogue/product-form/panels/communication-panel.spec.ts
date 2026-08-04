import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { CommunicationPanel } from './communication-panel';

const EDITORIAL = {
  descriptionShort: 'Torréfaction douce',
  descriptionLong: '',
  story: '',
  pairing: '',
  brand: '',
  seoTitle: '',
  seoDescription: '',
};

describe('CommunicationPanel', () => {
  it('reflète l’éditorial fourni', () => {
    const fixture = TestBed.createComponent(CommunicationPanel);
    fixture.componentRef.setInput('editorial', EDITORIAL);
    fixture.detectChanges();
    expect(fixture.componentInstance.editorial().descriptionShort).toBe(
      'Torréfaction douce',
    );
  });

  it('émet save quand saveable', () => {
    const fixture = TestBed.createComponent(CommunicationPanel);
    fixture.componentRef.setInput('editorial', EDITORIAL);
    fixture.componentRef.setInput('saveable', true);
    fixture.detectChanges();
    let saved = false;
    fixture.componentInstance.save.subscribe(() => (saved = true));
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '.section-footer button',
    );
    (button as HTMLButtonElement).click();
    expect(saved).toBe(true);
  });
});
