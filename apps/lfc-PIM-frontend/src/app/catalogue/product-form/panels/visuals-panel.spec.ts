import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { VisualsPanel } from './visuals-panel';

describe('VisualsPanel', () => {
  it('ajoute un visuel au clic', () => {
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.componentRef.setInput('media', []);
    fixture.detectChanges();
    const add = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ].find((b) => b.textContent?.includes('Ajouter'));
    (add as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.media()).toHaveLength(1);
    expect(fixture.componentInstance.media()[0]?.role).toBe('hero');
  });

  it('retire un visuel', () => {
    const fixture = TestBed.createComponent(VisualsPanel);
    fixture.componentRef.setInput('media', [{ role: 'hero', url: '' }]);
    fixture.detectChanges();
    const remove = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ].find((b) => b.textContent?.includes('Retirer'));
    (remove as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.media()).toHaveLength(0);
  });
});
