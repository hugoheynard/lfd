import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import {
  NO_MAIL_SEND_FILTERS,
  type MailSendFilters as Filters,
} from '../../rules/mail-send-labels';
import { MailSendFilters } from './mail-send-filters';

type Exposed = MailSendFilters & {
  change(patch: Partial<Filters>): void;
  changeDay(edge: 'from' | 'to', day: string): void;
  changeProbes(probes: boolean): void;
  reset(): void;
  templateOptions: readonly { value: string; label: string }[];
};

function setup(filters: Filters) {
  TestBed.configureTestingModule({ imports: [MailSendFilters] });
  const fixture = TestBed.createComponent(MailSendFilters);
  fixture.componentRef.setInput('filters', filters);
  const emitted: Filters[] = [];
  fixture.componentInstance.filtersChange.subscribe((value) => emitted.push(value));
  fixture.detectChanges();
  return {
    component: fixture.componentInstance as Exposed,
    emitted,
    element: fixture.nativeElement as HTMLElement,
  };
}

describe('MailSendFilters — les critères du suivi', () => {
  it('rend les critères entiers à chaque changement', () => {
    const { component, emitted } = setup({ ...NO_MAIL_SEND_FILTERS, space: 'lfc' });
    component.change({ state: 'failed' });
    expect(emitted).toEqual([{ ...NO_MAIL_SEND_FILTERS, space: 'lfc', state: 'failed' }]);
  });

  it('un jour effacé est l’absence de borne', () => {
    const { component, emitted } = setup({ ...NO_MAIL_SEND_FILTERS, from: '2026-11-01' });
    component.changeDay('from', '');
    expect(emitted[0]?.from).toBeNull();
  });

  it('la bascule des sondes change la portée, et « Effacer » la garde', () => {
    const { component, emitted } = setup({
      ...NO_MAIL_SEND_FILTERS,
      scope: 'probes',
      state: 'failed',
    });
    component.changeProbes(false);
    component.reset();
    expect(emitted[0]?.scope).toBe('regular');
    expect(emitted[1]).toEqual({ ...NO_MAIL_SEND_FILTERS, scope: 'probes' });
  });

  it('propose les modèles par leur intitulé, la clé en valeur', () => {
    const { component, element } = setup(NO_MAIL_SEND_FILTERS);
    expect(component.templateOptions).toContainEqual({
      value: 'customer.order-placed',
      label: 'Commande passée',
    });
    expect(element.textContent).toContain('Retour du fournisseur');
  });
});
