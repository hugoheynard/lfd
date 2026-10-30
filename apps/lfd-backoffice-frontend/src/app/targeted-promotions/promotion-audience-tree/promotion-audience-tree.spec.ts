import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PromotionAudienceTargetView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PromotionAudienceTree } from './promotion-audience-tree';

@Component({
  imports: [PromotionAudienceTree],
  template: `<app-promotion-audience-tree
    [audiences]="audiences()"
    (audiencesChange)="audiences.set($event)"
  >
    <p individualsLabels>libellés particuliers</p>
    <p prosLabels>libellés pros</p>
  </app-promotion-audience-tree>`,
})
class Host {
  readonly audiences = signal<PromotionAudienceTargetView[]>([
    { kind: 'individuals_registered', companyId: null },
  ]);
}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root: HTMLElement = fixture.nativeElement;
  const box = (label: string): HTMLInputElement => {
    const found = [...root.querySelectorAll('label')].find(
      (node) => node.textContent?.trim() === label,
    );
    const input = found?.querySelector('input') ?? null;
    if (input === null) {
      throw new Error(`Case ${label} introuvable.`);
    }
    return input;
  };
  return { fixture, root, box };
}

describe('PromotionAudienceTree', () => {
  it('rend la branche partielle et ne projette que les libellés de la branche touchée', () => {
    const { root, box } = render();
    expect(box('Particuliers').indeterminate).toBe(true);
    expect(box('Inscrits').checked).toBe(true);
    expect(root.textContent).toContain('libellés particuliers');
    expect(root.textContent).not.toContain('libellés pros');
  });

  it('un parent coché grise ses enfants ; « Tout le monde » grise tout', async () => {
    const { fixture, box } = render();
    box('Invités (sans compte)').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(box('Particuliers').checked).toBe(true);
    expect(box('Inscrits').disabled).toBe(true);
    box('Tout le monde').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.audiences()).toEqual([{ kind: 'everyone', companyId: null }]);
    expect(box('Pros').disabled).toBe(true);
  });
});
