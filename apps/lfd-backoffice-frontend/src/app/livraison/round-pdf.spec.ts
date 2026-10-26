import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeliveryRoundsService } from './delivery-rounds.service';
import { RoundPdf } from './round-pdf';

/** Le serveur doublé : un PDF pour chaque demande. */
class Papers {
  async roundPdf(): Promise<Blob> {
    return new Blob(['%PDF-'], { type: 'application/pdf' });
  }

  async dayDossierPdf(): Promise<Blob> {
    return new Blob(['%PDF-'], { type: 'application/pdf' });
  }
}

function mount(): RoundPdf {
  TestBed.configureTestingModule({
    providers: [RoundPdf, { provide: DeliveryRoundsService, useValue: new Papers() }],
  });
  return TestBed.inject(RoundPdf);
}

describe('RoundPdf — le lien de repli d’un onglet bloqué', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:papier');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    // Le navigateur bloque l'onglet.
    vi.spyOn(window, 'open').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('nomme le dossier du jour comme le serveur', async () => {
    const pdf = mount();

    await pdf.printDay('2026-10-26');

    expect(pdf.blockedUrl()).toBe('blob:papier');
    expect(pdf.blockedFileName()).toBe('dossier-de-livraison-du-26-octobre-2026.pdf');
  });

  it('garde le nom d’une feuille seule', async () => {
    const pdf = mount();
    await pdf.printDay('2026-10-26');

    await pdf.print('r_1');

    expect(pdf.blockedFileName()).toBe('tournee.pdf');
  });
});
