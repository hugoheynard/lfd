import { z } from "zod";

import { WHOLE_GROUP_FIELD, WHOLE_GROUP_VALUE } from "./unsubscribe-page.js";

/** Le corps du POST « One-Click » de la RFC 8058 : `List-Unsubscribe=One-Click`. */
const ONE_CLICK_FIELD = "List-Unsubscribe";
const ONE_CLICK_VALUE = "One-Click";

/**
 * La FORME du corps du POST, indulgente par construction : le POST
 * n'exige rien d'autre que le jeton (RFC 8058 ; contradiction : « le POST
 * n'exige rien de plus »). Un corps absent, multipart ou inattendu vaut
 * « le bouton de la page, cet espace seulement » — jamais un 400, qui
 * ferait échouer le one-click d'une messagerie.
 */
export const unsubscribeFormSchema = z
  .object({
    [ONE_CLICK_FIELD]: z.string().optional().catch(undefined),
    [WHOLE_GROUP_FIELD]: z.string().optional().catch(undefined),
  })
  .catch({})
  .transform((form) => ({
    oneClick: form[ONE_CLICK_FIELD] === ONE_CLICK_VALUE,
    wholeGroup: form[WHOLE_GROUP_FIELD] === WHOLE_GROUP_VALUE,
  }));

export type UnsubscribeForm = z.output<typeof unsubscribeFormSchema>;
