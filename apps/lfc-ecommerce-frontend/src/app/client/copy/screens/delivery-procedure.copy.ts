import type { DeliveryProcedureEditorLabels } from '@lfd/b2b-ui/company';

import type { LocaleCode } from '../../client-locale.service';
import { DELIVERY_PROCEDURE_EN } from './delivery-procedure.en';
import { DELIVERY_PROCEDURE_FR } from './delivery-procedure.fr';
import { DELIVERY_PROCEDURE_IT } from './delivery-procedure.it';

/**
 * Ce que dit la **procédure de livraison** d'une adresse, dans `/mon-compte` :
 * l'entrée sous chaque livraison, le dialogue, et l'éditeur partagé.
 *
 * 🔴 **Pas rangée dans `ClientCopy`, et c'est voulu.** Le dictionnaire est chargé
 * d'emblée (le shell lit `ClientCopyService`) ; le français de l'éditeur est une
 * VALEUR de `@lfd/b2b-ui/company`, dont le barrel ne s'élague pas pour ses
 * composants. Rangée là, elle tirait dans le bundle initial l'éditeur, son
 * formulaire, et par eux le contrat entier et zod : 1,16 Mo → 1,62 Mo, au-delà
 * du budget d'erreur de 1,60 Mo (deux `stats.json`, mesuré le 2026-09-15). Lue par
 * {@link deliveryProcedureCopy}, elle ne vit que dans le morceau de `/mon-compte`,
 * comme `proAccountCopy`.
 *
 * La parité des trois langues, que `client-copy.spec.ts` ne voit donc pas, est
 * tenue par `delivery-procedure.copy.spec.ts`.
 */
export interface DeliveryProcedureCopy {
  /** « Procédure de livraison » — l'entrée sous l'adresse, et le titre du dialogue. */
  readonly entry: string;
  /** Aucune étape, vu par un gestionnaire : c'est une invitation à l'écrire. */
  readonly toWrite: string;
  /** Aucune étape, vu par qui ne peut pas l'écrire. */
  readonly stepsNone: string;
  readonly stepsOne: string;
  /** `{n}` : le nombre d'étapes. */
  readonly steps: string;
  /** Les mots de la confirmation de suppression d'une étape (`fold-danger-zone`). */
  readonly removeBusy: string;
  readonly removeGroup: string;
  readonly editor: DeliveryProcedureEditorLabels;
}

const COPIES: Record<LocaleCode, DeliveryProcedureCopy> = {
  fr: DELIVERY_PROCEDURE_FR,
  en: DELIVERY_PROCEDURE_EN,
  it: DELIVERY_PROCEDURE_IT,
};

/** La copie de la procédure dans la langue de l'écran. */
export function deliveryProcedureCopy(locale: LocaleCode): DeliveryProcedureCopy {
  return COPIES[locale];
}
