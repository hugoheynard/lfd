import type { PosedMercurialeView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { mercurialeCsv, mercurialeFileName } from '../mercuriale-csv';
import { gapBp, type MercurialeRowView } from '../mercuriale-rows';

/**
 * **Une mercuriale exportée** — le fichier qu'on envoie au client, ou qu'on
 * relit hors de l'écran.
 *
 * Ce que ces cas tiennent est ce qui casse un export sans qu'on s'en aperçoive :
 * une échelle de prix arrondie, un séparateur avalé par un nom d'article, un
 * tableau qui ne se rattache plus à personne.
 */

const MERCURIALE: PosedMercurialeView = {
  id: 'merc_1',
  label: 'Mercuriale Club Med',
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: '2026-12-31T00:00:00.000Z',
  status: 'active',
  ruleCount: 1,
  skuCount: 1,
  createdBy: 'staff|marie',
  lines: [],
};

function row(overrides: Partial<MercurialeRowView> = {}): MercurialeRowView {
  const catalogMillicents = overrides.catalogMillicents ?? 213_270;
  const negotiatedMillicents = overrides.negotiatedMillicents ?? 173_270;
  return {
    sku: 'VIE-012',
    productName: 'Abricotin',
    catalogMillicents,
    negotiatedMillicents,
    gapBp: gapBp(catalogMillicents, negotiatedMillicents),
    minQuantity: 1,
    ...overrides,
  };
}

describe('ce qu’un tableur français doit pouvoir ouvrir', () => {
  it('sépare par des points-virgules', () => {
    // Excel en locale française ouvre un fichier `,` en une seule colonne.
    expect(mercurialeCsv(MERCURIALE, [row()])).toContain('VIE-012;Abricotin;');
  });

  it('écrit les décimales à la VIRGULE', () => {
    // Sans quoi le tableur lit du texte et n'additionne rien.
    expect(mercurialeCsv(MERCURIALE, [row()])).toContain('1,73270');
  });

  it('commence par le BOM UTF-8', () => {
    // Sans lui, Excel lit les accents en latin-1 et « Août » devient « AoÃ»t ».
    expect(mercurialeCsv(MERCURIALE, [row()]).startsWith('﻿')).toBe(true);
  });
});

describe('les prix', () => {
  it('🔴 sortent à CINQ décimales, jamais arrondis au centime', () => {
    // Un prix unitaire négocié se pose avec ses décimales — « 2,13456 € » est
    // une saisie normale sur un grand compte. Arrondir ferait d'un export un
    // document qui ne correspond plus au tarif appliqué.
    const csv = mercurialeCsv(MERCURIALE, [row({ negotiatedMillicents: 213_456 })]);

    expect(csv).toContain('2,13456');
  });

  it('laisse la colonne du tarif VIDE quand le catalogue ne connaît plus l’article', () => {
    // Un zéro se lirait « offert ». Une case vide dit « on ne sait pas ».
    const csv = mercurialeCsv(MERCURIALE, [row({ catalogMillicents: null, gapBp: null })]);

    expect(csv).toContain('VIE-012;Abricotin;;1,73270;;');
  });

  it('dit le sens de l’écart en toutes lettres', () => {
    // 213270 → 173270, soit 18,8 % de moins. Le signe est INVERSÉ par rapport
    // aux points de base : un écart positif est une baisse.
    expect(mercurialeCsv(MERCURIALE, [row()])).toContain('-18,8 %');
  });
});

describe('ce qui rattache le fichier à quelqu’un', () => {
  it('porte le nom, la fenêtre et l’auteur AVANT les colonnes', () => {
    // Un tableau de prix sans son entête ne se rattache plus à personne dès
    // qu'il a quitté l'écran — et c'est précisément ce qu'un export sert à faire.
    const [first] = mercurialeCsv(MERCURIALE, [row()]).split('\r\n');

    expect(first).toContain('Mercuriale Club Med');
    expect(first).toContain('du 01/01/2026 au 31/12/2026');
    expect(first).toContain('staff|marie');
  });

  it('dit « sans terme » plutôt que de laisser un vide', () => {
    const csv = mercurialeCsv({ ...MERCURIALE, validTo: null }, [row()]);

    expect(csv).toContain('sans terme');
  });
});

describe('l’échappement', () => {
  it('🔴 entoure un nom qui porte un point-virgule', () => {
    // Un nom d'article en contient rarement — et « rarement » est exactement la
    // fréquence à laquelle un fichier se casse sans qu'on comprenne pourquoi.
    const csv = mercurialeCsv(MERCURIALE, [row({ productName: 'Pain; graines' })]);

    expect(csv).toContain('"Pain; graines"');
  });

  it('double les guillemets d’un nom qui en porte', () => {
    const csv = mercurialeCsv(MERCURIALE, [row({ productName: 'Pain "maison"' })]);

    expect(csv).toContain('"Pain ""maison"""');
  });
});

describe('le nom du fichier', () => {
  it('assainit le libellé — il finit dans un système de fichiers', () => {
    // Le libellé est libre, et un `/` y couperait un chemin.
    expect(mercurialeFileName({ ...MERCURIALE, label: 'Été 2026 / Club Med' })).toBe(
      'mercuriale-ete-2026-club-med.csv',
    );
  });

  it('reste nommable quand le libellé ne laisse rien', () => {
    expect(mercurialeFileName({ ...MERCURIALE, label: '///' })).toBe('mercuriale-sans-nom.csv');
  });
});
