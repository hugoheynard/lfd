import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import {
  type ServiceChange,
  ServiceChangeDialog,
  type ServiceChangeData,
} from './service-change-dialog';

function boot(data: ServiceChangeData): {
  readonly labels: string[];
  readonly click: (label: string) => void;
  readonly closed: (ServiceChange | undefined)[];
} {
  const closed: (ServiceChange | undefined)[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ServiceChangeDialog],
    providers: [
      {
        provide: FoldPanelRef,
        useValue: { close: (v: ServiceChange | undefined) => closed.push(v) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ServiceChangeDialog);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  const buttons = (): HTMLButtonElement[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.choices button'));
  return {
    labels: buttons().map((b) => (b.textContent ?? '').trim()),
    click: (label) =>
      buttons()
        .find((b) => (b.textContent ?? '').includes(label))
        ?.click(),
    closed,
  };
}

describe('ServiceChangeDialog', () => {
  it('au retrait : la date, l’heure, la maison s’il y en a plusieurs, et la livraison', () => {
    const { labels, click, closed } = boot({
      mode: 'pickup',
      otherOpen: true,
      severalPlaces: true,
    });

    expect(labels).toEqual([
      'Changer la date',
      'Changer l’heure',
      'Changer le point de retrait',
      'Me faire livrer',
    ]);
    click('Changer l’heure');
    click('Me faire livrer');
    expect(closed).toEqual(['time', 'mode']);
  });

  it('en livraison : la date et l’adresse ; pas de bascule quand le retrait est fermé', () => {
    const { labels } = boot({ mode: 'delivery', otherOpen: false, severalPlaces: true });

    expect(labels).toEqual(['Changer la date', 'Changer l’adresse ou le créneau']);
  });

  it('une seule maison : pas de « point de retrait » à changer', () => {
    const { labels } = boot({ mode: 'pickup', otherOpen: false, severalPlaces: false });

    expect(labels).toEqual(['Changer la date', 'Changer l’heure']);
  });
});
