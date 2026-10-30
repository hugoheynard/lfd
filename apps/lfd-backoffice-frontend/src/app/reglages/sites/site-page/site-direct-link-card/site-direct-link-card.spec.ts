import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FoldInputComponent } from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { pickupDirectLink, SHOP_PUBLIC_URL_TOKEN } from '../../pickup-direct-link';
import { SiteDirectLinkCard } from './site-direct-link-card';

describe('pickupDirectLink', () => {
  it('écrit le point en paramètre de requête sur la boutique', () => {
    expect(pickupDirectLink('https://boutique.example', 'pa_labo')).toBe(
      'https://boutique.example/boutique?retrait=pa_labo',
    );
  });

  it('ignore un chemin ou une barre finale dans l’adresse configurée', () => {
    expect(pickupDirectLink('https://boutique.example/', 'pa_1')).toBe(
      'https://boutique.example/boutique?retrait=pa_1',
    );
  });

  it('ne fabrique rien sans adresse, ou sur une adresse mal formée', () => {
    expect(pickupDirectLink('', 'pa_1')).toBeNull();
    expect(pickupDirectLink('boutique', 'pa_1')).toBeNull();
  });
});

describe('SiteDirectLinkCard', () => {
  function render(shopUrl: string) {
    const notify = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: SHOP_PUBLIC_URL_TOKEN, useValue: shopUrl },
        { provide: NotifyService, useValue: notify },
      ],
    });
    const fixture = TestBed.createComponent(SiteDirectLinkCard);
    fixture.componentRef.setInput('pickupId', 'pa_labo');
    fixture.detectChanges();
    return { fixture, notify };
  }

  it('montre le lien en lecture seule et le copie', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { fixture, notify } = render('https://boutique.example');
    const field = fixture.debugElement.query(By.directive(FoldInputComponent))
      .componentInstance as FoldInputComponent;
    expect(field.value()).toBe('https://boutique.example/boutique?retrait=pa_labo');
    expect(field.readOnly()).toBe(true);
    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();
    await fixture.whenStable();
    expect(writeText).toHaveBeenCalledWith('https://boutique.example/boutique?retrait=pa_labo');
    expect(notify.success).toHaveBeenCalledWith('Lien copié.');
  });

  it('dit que l’adresse de la boutique manque, sans lien ni bouton', () => {
    const { fixture } = render('');
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('fold-input')).toBeNull();
    expect(host.querySelector('button')).toBeNull();
    expect(host.textContent).toContain('pas configurée');
  });
});
