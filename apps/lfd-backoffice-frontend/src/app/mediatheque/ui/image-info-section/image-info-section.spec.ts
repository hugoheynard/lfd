import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { AddressCopy } from '../../gestures/address-copy';
import type { ImageDescription } from '../../rules/image-description';
import { ImageInfoSection } from './image-info-section';

const IMAGE: ImageDescription = {
  url: 'https://media.test/products/abc.png',
  name: 'Croissant',
  alt: { fr: '' },
  focal: null,
  tags: [],
  series: null,
  facts: {
    width: 800,
    height: 600,
    bytes: 2048,
    contentType: 'image/png',
    depositedAt: '2026-09-23T08:00:00.000Z',
    uses: 1,
  },
};

function section(image: ImageDescription): { screen: ImageInfoSection; copied: string[] } {
  const copied: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: AddressCopy,
        useValue: {
          copy: vi.fn((url: string) => {
            copied.push(url);
            return Promise.resolve();
          }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ImageInfoSection);
  fixture.componentRef.setInput('image', image);
  fixture.detectChanges();
  return { screen: fixture.componentInstance, copied };
}

describe('les informations d’une image', () => {
  it('met en forme ce que le dépôt a mesuré', () => {
    const { screen } = section(IMAGE);

    expect(screen['facts']()).toMatchObject({
      format: 'PNG',
      dimensions: '800 × 600 px',
      fileName: 'abc.png',
      usesWording: '1 emploi',
    });
  });

  it('ne dit rien quand le dépôt n’a rien mesuré', () => {
    const { facts: _facts, ...unmeasured } = IMAGE;
    const { screen } = section(unmeasured);

    expect(screen['facts']()).toBeNull();
  });

  it('copie l’adresse de l’image montrée', async () => {
    const { screen, copied } = section(IMAGE);

    await screen['copyAddress']();

    expect(copied).toEqual([IMAGE.url]);
  });
});
