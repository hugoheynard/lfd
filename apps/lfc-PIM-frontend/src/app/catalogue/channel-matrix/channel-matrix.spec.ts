import { TestBed } from '@angular/core/testing';

import type { SalesChannels } from '../../data/models';
import { ChannelMatrix } from './channel-matrix';

const CHANNELS: SalesChannels = {
  b1: { emporter: true, surPlace: true },
  b2: { emporter: true, surPlace: false },
};

function render(inherited: boolean) {
  const fixture = TestBed.createComponent(ChannelMatrix);
  fixture.componentRef.setInput('channels', CHANNELS);
  fixture.componentRef.setInput('inherited', inherited);
  fixture.detectChanges();
  return fixture;
}

describe('ChannelMatrix', () => {
  it('shows the inherited badge and no revert control when inherited', () => {
    const text = render(true).nativeElement.textContent ?? '';
    expect(text).toContain('Hérité de la gamme');
    expect(text).not.toContain('Revenir au défaut');
  });

  it('exposes a revert control when personnalisé, and emits on click', () => {
    const fixture = render(false);
    let reverted = false;
    fixture.componentInstance.revert.subscribe(() => (reverted = true));

    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button');
    expect(button?.textContent).toContain('Revenir au défaut');

    button?.click();
    expect(reverted).toBe(true);
  });
});
