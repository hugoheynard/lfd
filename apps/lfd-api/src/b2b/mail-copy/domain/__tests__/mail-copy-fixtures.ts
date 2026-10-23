import type { MailCopyStamp } from "../mail-copy-entry.js";
import { MailCopyManifest, type MailCopyManifestEntry } from "../mail-copy-manifest.js";

/** L'objet d'une confirmation : `{ref}` permise ET obligatoire. */
export const SUBJECT: MailCopyManifestEntry = {
  mail: "customer.order-placed",
  path: "subject",
  defaults: {
    fr: "Votre commande {ref}",
    en: "Your order {ref}",
    it: "Il suo ordine {ref}",
  },
  allowed: ["ref"],
  required: ["ref"],
};

/** Un titre où le prénom est permis, sans être obligatoire. */
export const TITLE: MailCopyManifestEntry = {
  mail: "customer.company-attached",
  path: "title",
  defaults: { fr: "Bonjour,", en: "Hello,", it: "Buongiorno," },
  allowed: ["firstName"],
  required: [],
};

/** Un texte sans variable. */
export const KICKER: MailCopyManifestEntry = {
  mail: "customer.order-placed",
  path: "kicker",
  defaults: { fr: "Confirmée", en: "Confirmed", it: "Confermato" },
  allowed: [],
  required: [],
};

export const MANIFEST = MailCopyManifest.of(
  [SUBJECT, KICKER, TITLE],
  [
    { mail: "customer.order-placed", family: "order", followsLocale: true },
    { mail: "customer.company-attached", family: "account", followsLocale: false },
  ],
);

export function stamp(at: Date, staffId = "fiche-colette"): MailCopyStamp {
  return { at, staffId };
}
