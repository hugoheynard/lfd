import { DELIVERY_PROCEDURE_EDITOR_LABELS_FR } from '@lfd/b2b-ui/company';

import type { DeliveryProcedureCopy } from './delivery-procedure.copy';

/** Le français de l'éditeur est celui du paquet : un seul texte, relu une fois. */
export const DELIVERY_PROCEDURE_FR: DeliveryProcedureCopy = {
  entry: 'Procédure de livraison',
  toWrite: 'à rédiger',
  stepsNone: 'aucune étape',
  stepsOne: '1 étape',
  steps: '{n} étapes',
  removeBusy: 'Suppression…',
  removeGroup: 'Confirmer la suppression de l’étape',
  editor: DELIVERY_PROCEDURE_EDITOR_LABELS_FR,
};
