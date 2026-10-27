import { TestBed } from '@angular/core/testing';
import type { StorefrontAllergenDisplay, StorefrontSettingsView } from '@lfd/contracts';

import { NotifyService } from '../../notify.service';
import { StorefrontService } from '../storefront.service';
import { StorefrontAllergenSetting } from './storefront-allergen-setting';

/** Le serveur doublé à la main : le réglage lu, et ce qui est écrit. */
class FakeSettings {
  current: StorefrontAllergenDisplay = 'sheet';
  readonly written: StorefrontAllergenDisplay[] = [];
  failure: unknown = null;

  async settings(): Promise<StorefrontSettingsView> {
    return { allergenDisplay: this.current, updatedAt: null };
  }

  async saveAllergenDisplay(value: StorefrontAllergenDisplay): Promise<void> {
    this.written.push(value);
    if (this.failure !== null) {
      throw this.failure;
    }
  }
}

async function mount(api: FakeSettings, canWrite: boolean) {
  const notes: string[] = [];
  TestBed.configureTestingModule({
    imports: [StorefrontAllergenSetting],
    providers: [
      { provide: StorefrontService, useValue: api },
      {
        provide: NotifyService,
        useValue: {
          success: (m: string) => notes.push(m),
          error: (_e: unknown, m: string) => notes.push(m),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(StorefrontAllergenSetting);
  fixture.componentRef.setInput('canWrite', canWrite);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, notes };
}

describe('StorefrontAllergenSetting', () => {
  it('montre le réglage lu, nommé « Allergènes en boutique »', async () => {
    const { fixture } = await mount(new FakeSettings(), true);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Allergènes en boutique');
  });

  it('enregistre un nouveau choix tout de suite', async () => {
    const api = new FakeSettings();
    const { fixture, notes } = await mount(api, true);

    await fixture.componentInstance.choose('gallery');

    expect(api.written).toEqual(['gallery']);
    expect(notes[0]).toContain('enregistrée');
  });

  it('revient à la valeur d’avant quand le serveur refuse', async () => {
    const api = new FakeSettings();
    api.failure = new Error('refus');
    const { fixture, notes } = await mount(api, true);

    await fixture.componentInstance.choose('gallery');
    await fixture.componentInstance.choose('gallery');

    expect(api.written).toEqual(['gallery', 'gallery']);
    expect(notes).toContain('La place des allergènes n’a pas pu être enregistrée.');
  });
});
