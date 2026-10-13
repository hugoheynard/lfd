import { GLOSSARY_A_B } from './glossary-a-b';
import { GLOSSARY_C } from './glossary-c';
import { GLOSSARY_D_H } from './glossary-d-h';
import { GLOSSARY_I_L } from './glossary-i-l';
import { GLOSSARY_M_O } from './glossary-m-o';
import { GLOSSARY_ORDER_CANCEL } from './glossary-order-cancel';
import { GLOSSARY_P } from './glossary-p';
import { GLOSSARY_Q_R } from './glossary-q-r';
import { GLOSSARY_S } from './glossary-s';
import { GLOSSARY_T_W } from './glossary-t-w';

/**
 * Le glossaire des segments de clé : ce que chaque texte de la boutique EST,
 * en français, et non la traduction de son identifiant. Découpé par initiale
 * pour rester lisible ; la spec `copy-labels.spec.ts` exige que tout segment
 * du manifeste y figure (ou parmi les rôles génériques de `copy-labels.ts`).
 */
export const SHOP_COPY_GLOSSARY: Readonly<Record<string, string>> = {
  ...GLOSSARY_ORDER_CANCEL,
  ...GLOSSARY_A_B,
  ...GLOSSARY_C,
  ...GLOSSARY_D_H,
  ...GLOSSARY_I_L,
  ...GLOSSARY_M_O,
  ...GLOSSARY_P,
  ...GLOSSARY_Q_R,
  ...GLOSSARY_S,
  ...GLOSSARY_T_W,
};
