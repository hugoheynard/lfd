import { TestBed } from '@angular/core/testing';
import type { MailEditorResources, ModelSectionId } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import { MailResourcesPanel } from './mail-resources-panel';

const RESOURCES: MailEditorResources = {
  values: [
    {
      name: 'ref',
      label: 'Référence de commande',
      description: 'le numéro de la commande',
      example: 'ORD-4812',
      phrases: ['subject'],
    },
    {
      name: 'site',
      label: 'Point de retrait',
      description: 'là où le client vient chercher',
      example: 'Boutique de Lyon',
      phrases: ['intro'],
    },
  ],
  links: [
    { slot: 'cta', label: 'Liste de ses commandes', description: 'la liste de ses commandes' },
  ],
  dataBlocks: [
    { block: 'summary', label: 'Récapitulatif de la commande', description: 'les lignes' },
  ],
};

function render() {
  const fixture = TestBed.createComponent(MailResourcesPanel);
  fixture.componentRef.setInput('resources', RESOURCES);
  fixture.componentRef.setInput('canWrite', true);
  fixture.componentRef.setInput('placeable', new Set(['ref']));
  fixture.componentRef.setInput('required', new Set(['ref']));
  fixture.detectChanges();
  const picked: string[] = [];
  const lit: (ModelSectionId | null)[] = [];
  fixture.componentInstance.valuePicked.subscribe((name) => picked.push(name));
  fixture.componentInstance.lit.subscribe((section) => lit.push(section));
  const element: HTMLElement = fixture.nativeElement;
  return { element, picked, lit };
}

describe('MailResourcesPanel — les ressources de cet e-mail', () => {
  it('range les ressources par sorte, chacune par sa fiche', () => {
    const { element } = render();
    const kinds = [...element.querySelectorAll('[data-resource-kind]')].map((kind) =>
      kind.getAttribute('data-resource-kind'),
    );
    expect(kinds).toEqual(['values', 'links', 'data-blocks']);
    const ref = element.querySelector('[data-value="ref"]');
    expect(ref?.textContent).toContain('Référence de commande');
    expect(ref?.textContent).not.toContain('{ref}');
    expect(ref?.closest('li')?.textContent).toContain('Exemple : ORD-4812');
    expect(ref?.getAttribute('aria-label')).toContain('obligatoire');
  });

  it('une valeur cliquée est remontée ; une valeur qu’aucune phrase modifiable ne reçoit est grisée', () => {
    const { element, picked } = render();
    element.querySelector<HTMLButtonElement>('[data-value="ref"]')?.click();
    expect(picked).toEqual(['ref']);
    expect(element.querySelector<HTMLButtonElement>('[data-value="site"]')?.disabled).toBe(true);
  });

  it('survoler un bloc de données ou un lien éclaire le bloc qui le porte', () => {
    const { element, lit } = render();
    const summary = element.querySelector('[data-data-block="summary"]');
    summary?.dispatchEvent(new Event('mouseenter'));
    summary?.dispatchEvent(new Event('mouseleave'));
    element.querySelector('[data-link="cta"]')?.dispatchEvent(new Event('focus'));
    expect(lit).toEqual(['summary', null, 'cta']);
  });
});
