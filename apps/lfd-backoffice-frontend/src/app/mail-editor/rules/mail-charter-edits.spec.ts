import { validateMailCharterForPublication, type MailCharterSettings } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import {
  contrastReport,
  ratioLabel,
  violationsByField,
  withColor,
  withFooter,
  withFont,
  withShopFonts,
  withLogoAlt,
  withLogoSource,
  withOriginalLogo,
} from './mail-charter-edits';

const SETTINGS: MailCharterSettings = {
  logo: null,
  colors: {
    page: '#f4f1ea',
    card: '#ffffff',
    text: '#1a1a1a',
    mutedText: '#555555',
    primary: '#24448f',
    band: '#1a3157',
    border: '#dddddd',
  },
  darkColors: { page: '#111111', card: '#1c1c1c', text: '#f0f0f0', border: '#333333' },
  headingFont: null,
  textFont: null,
  footer: { fr: 'La Folie Douce' },
};

describe('les gestes de la charte', () => {
  it('change une couleur claire ou sombre sans toucher l’autre palette', () => {
    const light = withColor(SETTINGS, { palette: 'colors', key: 'text' }, '#000000');
    expect(light.colors.text).toBe('#000000');
    expect(light.darkColors).toBe(SETTINGS.darkColors);
    const dark = withColor(SETTINGS, { palette: 'darkColors', key: 'card' }, '#222222');
    expect(dark.darkColors.card).toBe('#222222');
    expect(dark.colors).toBe(SETTINGS.colors);
  });

  it('garde le texte de remplacement quand on change de logo, et revient au logo d’origine', () => {
    const chosen = withLogoAlt(withLogoSource(SETTINGS, 'https://cdn/a.png'), 'fr', 'La Folie');
    const changed = withLogoSource(chosen, 'https://cdn/b.png');
    expect(changed.logo).toEqual({ src: 'https://cdn/b.png', alt: { fr: 'La Folie' } });
    expect(withOriginalLogo(changed).logo).toBeNull();
    expect(withLogoAlt(SETTINGS, 'fr', 'x')).toBe(SETTINGS);
  });

  it('écrit le pied par langue et la police champ par champ', () => {
    expect(withFooter(SETTINGS, 'en', 'Hello').footer).toEqual({
      fr: 'La Folie Douce',
      en: 'Hello',
    });
    const font = withFont(SETTINGS, 'headingFont', { family: 'Chunk', url: '', fallback: '' });
    expect(font.headingFont?.family).toBe('Chunk');
    expect(font.textFont).toBeNull();
  });

  it('règle la police du texte sans toucher celle des titres', () => {
    const text = withFont(SETTINGS, 'textFont', {
      family: 'Pogonia',
      url: '',
      fallback: 'Arial, sans-serif',
    });
    expect(text.textFont?.fallback).toBe('Arial, sans-serif');
    expect(text.headingFont).toBeNull();
    expect(withFont(text, 'textFont', null).textFont).toBeNull();
  });

  it('pose les polices de la boutique dans les deux réglages, que la charte admet', () => {
    const shop = withShopFonts(SETTINGS, {
      heading: {
        family: 'Chunk',
        url: 'https://lfc.test/brand/fonts/chunk-400.woff2',
        fallback: "'Arial Black', Impact, sans-serif",
      },
      text: {
        family: 'Pogonia',
        url: 'https://lfc.test/brand/fonts/pogonia-400.woff2',
        fallback: "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
      },
    });
    expect(shop.headingFont?.family).toBe('Chunk');
    expect(shop.textFont?.family).toBe('Pogonia');
    expect(shop.colors).toBe(SETTINGS.colors);
    expect(validateMailCharterForPublication(shop, ['fr'])).toEqual([]);
  });

  it('range les refus du paquet par réglage', () => {
    const grey = withColor(SETTINGS, { palette: 'colors', key: 'text' }, '#cccccc');
    const byField = violationsByField(validateMailCharterForPublication(grey, ['fr']));
    expect(byField.get('colors.text')?.map((violation) => violation.code)).toEqual([
      'charter-contrast-too-low',
      'charter-contrast-too-low',
    ]);
  });

  it('calcule le rapport de chaque paire, et dit celles qui ne passent pas', () => {
    const report = contrastReport(
      withColor(SETTINGS, { palette: 'colors', key: 'text' }, '#cccccc'),
    );
    expect(report).toHaveLength(8);
    expect(report[0]?.passes).toBe(false);
    expect(report[5]?.passes).toBe(true);
    expect(report[5]?.label).toBe('Texte blanc du bandeau');
    expect(ratioLabel(21)).toBe('21,00:1');
    const broken = contrastReport(withColor(SETTINGS, { palette: 'colors', key: 'card' }, 'bleu'));
    expect(broken[0]).toEqual({ label: 'Texte sur la carte', ratio: null, passes: false });
  });
});
