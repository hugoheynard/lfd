import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PromotionAudienceTargetView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AdminCompany } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { PromotionAudienceTree } from './promotion-audience-tree';

/** La liste des comptes clients, servie ou refusée selon le test. */
class FakeCompanies {
  answer: () => Promise<readonly AdminCompany[]> = () => Promise.resolve([]);
  list(): Promise<readonly AdminCompany[]> {
    return this.answer();
  }
}

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
  let companies: FakeCompanies;

  beforeEach(() => {
    companies = new FakeCompanies();
    TestBed.configureTestingModule({
      providers: [{ provide: AdminCompaniesService, useValue: companies }],
    });
  });

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

  it('« Une société » se choisit dans la liste des comptes clients', async () => {
    const { fixture, root, box } = render();
    box('Une société').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('fold-combobox')).not.toBeNull();
    expect(root.textContent).not.toContain('Identifiant de la société');
  });

  it('sans la liste (droit absent), on colle l’identifiant, et on le dit', async () => {
    companies.answer = () => Promise.reject(new Error('403'));
    const { fixture, root, box } = render();
    box('Une société').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('fold-combobox')).toBeNull();
    expect(root.textContent).toContain('Identifiant de la société');
    expect(root.textContent).toContain('La liste des sociétés n');
  });
});
