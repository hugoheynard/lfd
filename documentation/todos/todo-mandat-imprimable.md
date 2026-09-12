# Le mandat doit s'imprimer avec sa RUM

**Ouvert le 2026-09-12 au soir**, après la livraison de la frappe.
🔴 Bloque la seule chose qui manque à la chaîne : un document que le client peut
signer.

## Le fait

La RUM est frappée, persistée, unique, et elle voyage jusqu'au fichier de
prélèvement. **Elle n'atteint pas le papier.**

| Constat                                                  | Où                                       |
| -------------------------------------------------------- | ---------------------------------------- |
| `renderSepaMandatePdf` n'a **aucun paramètre de RUM**    | `sepa-mandate-pdf.ts:820`                |
| `DebtorSnapshot` ne porte **aucune référence de mandat** | `debtor-snapshot.ts:21`                  |
| `watermark()` tamponne EXEMPLE **sans condition**        | `sepa-mandate-pdf.ts:788`                |
| l'aperçu client ne lit aucun mandat                      | `preview-customer-mandate.handler.ts:65` |

_(Les quatre vérifiés le 2026-09-12 au soir.)_

## Ce que ça produit aujourd'hui

Un commercial peut frapper un mandat — la RUM existe en base — puis ouvrir
l'aperçu et n'y trouver aucune référence, sous un filigrane EXEMPLE. Le document
qu'il imprimerait **n'est pas signable** : un mandat sans RUM est une
autorisation que le débiteur ne peut opposer à sa banque, et que nous ne pouvons
rattacher à aucun prélèvement.

## Ce qu'il faut faire

1. `DebtorSnapshot` porte la RUM du mandat — ou le rendu la prend à part.
2. `renderSepaMandatePdf` l'imprime dans la case prévue, au peigne **26**
   caractères (voir [`../comptabilite/rum.md`](../comptabilite/rum.md) §2).
3. `watermark()` devient **conditionnel** : EXEMPLE si et seulement s'il n'y a
   pas de RUM.
4. L'aperçu client lit le mandat courant et passe sa référence.

## La garde

🔴 **Le filigrane est une sécurité, pas une décoration.** Le retirer sans lier sa
disparition à la présence d'une RUM ferait sortir un document d'apparence
signable et sans référence — que le client signerait, et qui ne vaudrait rien. La
condition et le retrait se font dans le même geste, jamais l'un avant l'autre.

⚠️ Le rendu est **déterministe** (date figée, métadonnées en dur) parce que des
tests comparent ses octets. Une RUM qui entre dans le document rend chaque rendu
différent : les tests d'octets devront viser le cas **sans** RUM, et le cas avec
s'éprouve sur le texte extrait, pas sur le binaire.

## Ce que ce TODO ne couvre pas

Hors périmètre, et volontairement laissé hors de ce fichier pour qu'il reste le
seul à lire :

- **le balayage de caducité** — aucun mandat ne passe à `expired` après 36 mois ;
- **la séquence `FRST`/`SMNDA`** et l'historique des changements de compte, que
  le CFONB exige (voir [`../comptabilite/prelevement-sepa.md`](../comptabilite/prelevement-sepa.md) §7) ;
- **les trois objections bloquantes** 1, 3 et 4 du §10 du même document ;
- **le palier 3** du scellement de `creditor_iban` — supprimer la colonne
  claire, après ressaisie ;
- **les dix questions à la Caisse d'Épargne**, dont aucune ne se répond depuis
  le dépôt.
