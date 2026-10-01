import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProofPhoto } from './proof-photo';

const PHOTO = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'porte.jpg', { type: 'image/jpeg' });

async function boot(): Promise<ComponentFixture<ProofPhoto>> {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(ProofPhoto);
  fixture.componentRef.setInput('prompt', 'Prendre la photo du dépôt');
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function root(fixture: ComponentFixture<ProofPhoto>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('ProofPhoto — la photo d’une remise à la porte', () => {
  it('dit son libellé, prend la photo de l’appareil, et la retire', async () => {
    const fixture = await boot();
    expect(root(fixture).querySelector('[data-handover-photo]')?.textContent).toContain(
      'Prendre la photo du dépôt',
    );

    const input = root(fixture).querySelector('[data-handover-photo-input]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('champ photo introuvable');
    }
    Object.defineProperty(input, 'files', { value: { item: () => PHOTO }, configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance.photo()).toBe(PHOTO);
    expect(root(fixture).textContent).toContain('Photo jointe : porte.jpg');

    root(fixture).querySelector<HTMLButtonElement>('button')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.photo()).toBeNull();
    expect(root(fixture).querySelector('[data-handover-photo]')).not.toBeNull();
  });
});
