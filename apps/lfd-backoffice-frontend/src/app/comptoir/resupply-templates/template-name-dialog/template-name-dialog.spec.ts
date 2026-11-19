import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { TemplateNameDialog, type TemplateNameDialogData } from './template-name-dialog';

interface Mounted {
  readonly closed: (string | undefined)[];
  readonly saved: string[];
  readonly root: HTMLElement;
  readonly settle: () => Promise<void>;
  readonly type: (name: string) => void;
}

function mount(refusal: string | null = null): Mounted {
  const closed: (string | undefined)[] = [];
  const saved: string[] = [];
  TestBed.configureTestingModule({
    imports: [TemplateNameDialog],
    providers: [
      { provide: FoldPanelRef, useValue: { close: (name?: string) => closed.push(name) } },
    ],
  });
  const fixture = TestBed.createComponent(TemplateNameDialog);
  const data: TemplateNameDialogData = {
    summary: 'Pour demain · 2 article(s)',
    initialName: '',
    save: (name) => {
      saved.push(name);
      return Promise.resolve(refusal);
    },
  };
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return {
    closed,
    saved,
    root,
    settle: async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    },
    type: (name) => {
      const field = root.querySelector<HTMLInputElement>('[data-template-name] input');
      if (field === null) {
        throw new Error('champ absent');
      }
      field.value = name;
      field.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    },
  };
}

function saveButton(root: HTMLElement): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>('[data-template-name-save]');
  if (button === null) {
    throw new Error('bouton absent');
  }
  return button;
}

describe('TemplateNameDialog — le nom du modèle', () => {
  it("n'enregistre pas sans nom", () => {
    const { root } = mount();
    expect(saveButton(root).disabled).toBe(true);
  });

  it('enregistre le nom rogné, puis ferme en le rendant', async () => {
    const mounted = mount();
    mounted.type('  Base matin  ');
    saveButton(mounted.root).click();
    await mounted.settle();
    expect(mounted.saved).toEqual(['Base matin']);
    expect(mounted.closed).toEqual(['Base matin']);
  });

  it('garde le refus du serveur dans le dialogue, ouvert', async () => {
    const mounted = mount('Un modèle actif porte déjà ce nom à ce point.');
    mounted.type('Base matin');
    saveButton(mounted.root).click();
    await mounted.settle();
    expect(mounted.closed).toEqual([]);
    expect(mounted.root.querySelector('[data-template-name-refusal]')?.textContent).toContain(
      'déjà ce nom',
    );
  });
});
