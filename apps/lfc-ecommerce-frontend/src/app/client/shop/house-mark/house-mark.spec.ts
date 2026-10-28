import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { HOUSE_MARK, HouseMark } from './house-mark';

@Component({
  selector: 'app-house-mark-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HouseMark],
  template: '<img [src]="src()" [appHouseMark]="src()" alt="" />',
})
class Host {
  readonly src = signal(HOUSE_MARK);
}

function render(src: string): HTMLImageElement {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.src.set(src);
  fixture.detectChanges();
  const img = (fixture.nativeElement as HTMLElement).querySelector('img');
  if (img === null) throw new Error('image absente');
  return img;
}

describe('HouseMark — le logo à la place de la photo absente', () => {
  it('cadre le logo entier, en retrait des bords', () => {
    const img = render(HOUSE_MARK);
    expect(img.hasAttribute('data-house-mark')).toBe(true);
    expect(img.style.objectFit).toBe('contain');
    expect(img.style.padding).toBe('12%');
  });

  it('ne touche pas une vraie photo', () => {
    const img = render('https://media.example/products/croissant.jpg');
    expect(img.hasAttribute('data-house-mark')).toBe(false);
    expect(img.style.objectFit).toBe('');
    expect(img.style.padding).toBe('');
  });
});
