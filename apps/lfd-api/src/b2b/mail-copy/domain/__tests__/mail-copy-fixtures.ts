import type { MailCopyStamp } from "../mail-copy-entry.js";
import { MailCopyManifest, type MailCopyManifestEntry } from "../mail-copy-manifest.js";
import type { MailLayoutDescription } from "../mail-section-layout.js";

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

/** Les sections d'une confirmation : le titre en variantes, un QR système. */
export const ORDER_PLACED_LAYOUT: MailLayoutDescription = {
  mail: "customer.order-placed",
  subject: [{ path: "subject", variant: null }],
  header: [{ path: "kicker", variant: null }],
  sections: [
    {
      id: "title",
      label: "Titre",
      nature: "text",
      texts: [
        { path: "title.paid", variant: "Commande payée par carte" },
        { path: "title.due", variant: "Commande à régler" },
      ],
    },
    { id: "body", label: "Paragraphes", nature: "text", texts: [] },
    { id: "image", label: "QR de retrait", nature: "system", texts: [] },
    { id: "footer", label: "Pied", nature: "text", texts: [] },
  ],
};

/** L'ordre par défaut de la confirmation, et un autre, valide. */
export const DEFAULT_ORDER = ["title", "body", "image", "footer"] as const;
export const QR_FIRST = ["image", "title", "body", "footer"] as const;

export const MANIFEST = MailCopyManifest.of(
  [SUBJECT, KICKER, TITLE],
  [
    { mail: "customer.order-placed", family: "order", followsLocale: true },
    { mail: "customer.company-attached", family: "account", followsLocale: false },
  ],
  [ORDER_PLACED_LAYOUT],
);

export function stamp(at: Date, staffId = "fiche-colette"): MailCopyStamp {
  return { at, staffId };
}
