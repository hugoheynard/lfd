import { describe, expect, it } from 'vitest';

import { clientNumber } from '../client-number';

describe('le numéro court d’un compte client', () => {
  it('prend les six derniers caractères du cuid, en majuscules', () => {
    expect(clientNumber('cmhd2k7xq0000abcdx9f3k2')).toBe('X9F3K2');
  });

  it('rend le même numéro pour le même compte', () => {
    expect(clientNumber('cmhd2k7xq0000abcdx9f3k2')).toBe(clientNumber('cmhd2k7xq0000abcdx9f3k2'));
  });

  it('garde un identifiant plus court tel quel', () => {
    expect(clientNumber('usr_1')).toBe('USR_1');
  });

  it('ne fabrique rien sans identifiant', () => {
    expect(clientNumber('')).toBeNull();
    expect(clientNumber('  ')).toBeNull();
  });
});
