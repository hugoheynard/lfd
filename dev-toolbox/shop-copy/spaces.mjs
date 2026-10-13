/**
 * Les espaces du recueil des textes de la boutique, DANS L'ORDRE où il les
 * présente (plan `documentation/contenu-ecommerce/plan-textes-de-la-boutique.md`,
 * §7 bis) : le parcours de commande d'abord, le reste ensuite.
 *
 * Deux sortes d'espaces :
 *
 * - `dictionary` : une clé de premier niveau du dictionnaire général
 *   (`ClientCopy`, `fr.ts` / `en.ts` / `it.ts`) ;
 * - `screen` : une fonction d'écran de `copy/screens/` (`xxxCopy(locale)`),
 *   appelée pour chaque langue — c'est elle que l'écran lit, fusions comprises.
 *
 * La liste est écrite plutôt que devinée, parce que l'ORDRE et le TITRE sont
 * des décisions de lecture. Ce qu'elle oublierait ne passe pas en silence :
 * `build.mjs` refuse une clé du dictionnaire général ou un fichier d'écran que
 * personne ne range ici.
 */

/** Le parcours de commande, de l'arrivée du visiteur à la confirmation. */
export const ORDER_JOURNEY = [
  {
    kind: "screen",
    space: "accueilPublic",
    title: "Accueil public — le visiteur sans compte",
    file: "screens/accueil-public.copy.ts",
    fn: "accueilPublicCopy",
  },
  {
    kind: "screen",
    space: "steps",
    title: "Les trois étapes du parcours (où, quand, quoi)",
    file: "screens/steps.copy.ts",
    fn: "stepsCopy",
  },
  { kind: "dictionary", space: "hero", title: "Accueil — l'en-tête de bienvenue" },
  { kind: "dictionary", space: "doors", title: "Accueil — les portes d'entrée" },
  { kind: "dictionary", space: "event", title: "Accueil — la carte d'événement" },
  { kind: "dictionary", space: "signup", title: "Connexion et création de compte" },
  { kind: "dictionary", space: "commande", title: "Commander — l'écran d'entrée de la commande" },
  { kind: "dictionary", space: "shop", title: "Rayon / boutique" },
  { kind: "dictionary", space: "product", title: "Rayon — la fiche produit" },
  {
    kind: "screen",
    space: "commandTerms",
    title: "Barre de commande — la maison et l’heure retenues",
    file: "screens/command-terms.copy.ts",
    fn: "commandTermsCopy",
  },
  {
    kind: "screen",
    space: "housePicker",
    title: "Choix du lieu — la maison",
    file: "screens/house-picker.copy.ts",
    fn: "housePickerCopy",
  },
  {
    kind: "dictionary",
    space: "dialog",
    title: "Choix du lieu et de l’heure — le dialogue commun",
  },
  { kind: "dictionary", space: "pickupDialog", title: "Choix du lieu — le retrait" },
  { kind: "dictionary", space: "addressDialog", title: "Choix du lieu — l’adresse de livraison" },
  {
    kind: "screen",
    space: "deliveryAddress",
    title: "Choix du lieu — la saisie d’une adresse de livraison",
    file: "screens/delivery-address.copy.ts",
    fn: "deliveryAddressCopy",
  },
  {
    kind: "screen",
    space: "slotPicker",
    title: "Choix de l’heure — le sélecteur de créneau",
    file: "screens/slot-picker.copy.ts",
    fn: "slotPickerCopy",
  },
  { kind: "dictionary", space: "slotStep", title: "Choix de l’heure — l’étape du créneau" },
  { kind: "dictionary", space: "rappel", title: "Choix de l’heure — le rappel téléphonique" },
  { kind: "dictionary", space: "cart", title: "Panier, connexion et saisie invité" },
  { kind: "dictionary", space: "pay", title: "Règlement" },
  { kind: "dictionary", space: "done", title: "Confirmation" },
  { kind: "dictionary", space: "qr", title: "Confirmation — le QR de retrait" },
];

/** Tout ce qui n'est pas le parcours de commande. */
export const OTHER_SPACES = [
  {
    kind: "dictionary",
    space: "chrome",
    title: "Le cadre — bandeaux, installation, erreurs générales",
  },
  { kind: "dictionary", space: "nav", title: "La navigation" },
  { kind: "dictionary", space: "aside", title: "La colonne d’accompagnement" },
  { kind: "dictionary", space: "orders", title: "Mes commandes", file: "screens/orders.copy.ts" },
  {
    kind: "screen",
    space: "orderCancel",
    title: "Annuler une commande — Mes commandes et la page invité",
    file: "screens/order-cancel.copy.ts",
    fn: "orderCancelCopy",
  },
  { kind: "dictionary", space: "loyalty", title: "Fidélité", file: "screens/loyalty.copy.ts" },
  {
    kind: "dictionary",
    space: "account",
    title: "Mon compte (factures comprises)",
    file: "screens/account.{fr,en,it}.ts · screens/account-invoices.copy.ts",
  },
  { kind: "dictionary", space: "pro", title: "Le compte pro — le dictionnaire général" },
  {
    kind: "screen",
    space: "proAccount",
    title: "Le compte pro — l’écran",
    file: "screens/pro-account.copy.ts",
    fn: "proAccountCopy",
  },
  {
    kind: "screen",
    space: "deliveryProcedure",
    title: "La procédure de livraison d’une adresse",
    file: "screens/delivery-procedure.copy.ts · .fr/.en/.it.ts",
    fn: "deliveryProcedureCopy",
    entry: "screens/delivery-procedure.copy.ts",
  },
  {
    kind: "screen",
    space: "contactDialog",
    title: "Le dialogue « Nous écrire »",
    file: "screens/contact-dialog.copy.ts",
    fn: "contactDialogCopy",
  },
  { kind: "dictionary", space: "legalDocument", title: "Les documents légaux" },
];

/**
 * Les fichiers d'écran qui n'ont PAS d'espace propre, et où leurs textes sont
 * recensés : ils sont greffés dans le dictionnaire général (`fr.ts` les importe).
 */
export const GRAFTED_SCREEN_FILES = {
  "screens/account.copy.ts": "account",
  "screens/account.fr.ts": "account",
  "screens/account.en.ts": "account",
  "screens/account.it.ts": "account",
  "screens/account-invoices.copy.ts": "account.invoices",
  "screens/orders.copy.ts": "orders",
  "screens/loyalty.copy.ts": "loyalty",
  "screens/delivery-procedure.fr.ts": "deliveryProcedure",
  "screens/delivery-procedure.en.ts": "deliveryProcedure",
  "screens/delivery-procedure.it.ts": "deliveryProcedure",
};
