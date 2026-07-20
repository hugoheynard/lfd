import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:is-public';

/**
 * Ouvre une route au public : le guard global la laisse passer sans jeton.
 * L'API est protégée par défaut — ouvrir est un acte explicite.
 */
export const Public = (): CustomDecorator<string> =>
  SetMetadata(IS_PUBLIC_KEY, true);
