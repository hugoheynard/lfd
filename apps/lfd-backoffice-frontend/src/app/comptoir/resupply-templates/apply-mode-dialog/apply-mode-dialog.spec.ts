import { TestBed } from '@angular/core/testing';
import type { ResupplyTemplateApplyMode } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ApplyModeDialog } from './apply-mode-dialog';

function mount(): { closed: (ResupplyTemplateApplyMode | undefined)[]; root: HTMLElement } {
  const closed: (ResupplyTemplateApplyMode | undefined)[] = [];
  TestBed.configureTestingModule({
    imports: [ApplyModeDialog],
    providers: [
      {
        provide: FoldPanelRef,
        useValue: { close: (mode?: ResupplyTemplateApplyMode) => closed.push(mode) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ApplyModeDialog);
  fixture.componentRef.setInput('data', { templateName: 'Base matin', lineCount: 3 });
  fixture.detectChanges();
  return { closed, root: fixture.nativeElement as HTMLElement };
}

function click(root: HTMLElement, selector: string): void {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (button === null) {
    throw new Error(`absent : ${selector}`);
  }
  button.click();
}

describe('ApplyModeDialog — remplacer ou ajouter', () => {
  it('dit ce que compte déjà la demande', () => {
    expect(mount().root.textContent).toContain('3 article(s)');
  });

  it('rend « replace » sur Remplacer', () => {
    const { closed, root } = mount();
    click(root, '[data-apply-mode="replace"]');
    expect(closed).toEqual(['replace']);
  });

  it('rend « add » sur Ajouter', () => {
    const { closed, root } = mount();
    click(root, '[data-apply-mode="add"]');
    expect(closed).toEqual(['add']);
  });
});
