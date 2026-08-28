import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { FR } from '../../copy/fr';
import { MOCK_LEDGER } from '../../mock-statement';
import { FacturesPage } from './factures-page';

describe('FacturesPage', () => {
  let fixture: ComponentFixture<FacturesPage>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FacturesPage],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(FacturesPage);
    fixture.detectChanges();
  });

  it('dit ce qu’il est AVANT de montrer une ligne', () => {
    // L'encart d'honnêteté est la première ligne de l'écran, pas une note de
    // bas de page : appeler « factures » une liste de commandes ferait chercher
    // un PDF qui n'existe pas.
    expect(el().querySelector('.honesty')?.textContent).toContain(FR.invoices.honesty);
  });

  it('porte les trois montants, et jamais leur somme', () => {
    const values = Array.from(el().querySelectorAll('.tile-value')).map((n) => n.textContent);
    expect(values).toEqual(['248,60 €', '408,60 €', '80,10 €']);
  });

  it('coupe par exercice sans dupliquer un mois', () => {
    const years = Array.from(el().querySelectorAll('.year')).map((n) => n.textContent?.trim());
    expect(years).toEqual(['2026', '2025']);
    expect(el().querySelectorAll('app-ledger-month').length).toBe(MOCK_LEDGER.length);
  });

  it('le mois OUVERT n’a pas de facture, et le dit à sa place', () => {
    // Aucun bouton grisé : un bouton mort se lit comme une panne.
    const pending = el().querySelectorAll('.doc-pending');
    expect(pending.length).toBe(1);
    expect(pending[0]?.textContent).toContain(FR.invoices.invoicePending);
  });

  it('un mois sans régime à la commande le DIT', () => {
    // Une cellule absente se lirait comme une donnée manquante.
    expect(el().querySelectorAll('.void').length).toBe(1);
  });
});
