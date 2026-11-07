import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { MailTemplateTabs } from './mail-template-tabs';

describe('MailTemplateTabs — les onglets de la page d’un e-mail', () => {
  async function render(active: 'edit' | 'history') {
    TestBed.configureTestingModule({ imports: [MailTemplateTabs], providers: [provideRouter([])] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(MailTemplateTabs);
    fixture.componentRef.setInput('template', 'customer.order-placed');
    fixture.componentRef.setInput('active', active);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const tab = (label: string) =>
      [...element.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent?.trim() === label,
      );
    return { navigate, tab };
  }

  it('montre Édition puis Historique, et mène à l’historique', async () => {
    const { navigate, tab } = await render('edit');
    expect(tab('Édition')).toBeDefined();
    tab('Historique')?.click();
    expect(navigate).toHaveBeenCalledWith(['/emails', 'customer.order-placed', 'historique']);
  });

  it('depuis l’historique, ramène à l’édition', async () => {
    const { navigate, tab } = await render('history');
    tab('Édition')?.click();
    expect(navigate).toHaveBeenCalledWith(['/emails', 'customer.order-placed']);
  });
});
