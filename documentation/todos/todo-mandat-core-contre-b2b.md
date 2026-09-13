# Le mandat imprimé est un CORE, le lot déclare B2B

**Ouvert le 2026-09-13.**
🔴 Bloque le premier prélèvement réel, et engage juridiquement.

Ce fichier **remplace** le TODO précédent de ce dossier, livré le même jour : la
RUM s'imprime, le filigrane tombe avec elle, et le mandat part au client par
courriel.

## Le fait

| Où                             | Ce qui est déclaré                                  |
| ------------------------------ | --------------------------------------------------- |
| `pain008.ts`                   | `<LclInstrm><Cd>B2B</Cd></LclInstrm>`               |
| `sepa-mandate-pdf.ts`          | **rien** — ni « interentreprises », ni B2B, ni CORE |
| le texte imprimé sur le mandat | « droit d'être remboursé… **dans les 8 semaines** » |

_(Les trois vérifiés le 2026-09-13.)_

Le paragraphe de remboursement **EST** la signature du schéma CORE. Le formulaire
interentreprises dit l'inverse.

## Ce que ça produit

1. **La banque du débiteur refuse.** Recevant un lot `B2B`, elle cherche le
   mandat dans son registre. Rien sur le papier ne dit au client qu'il doit l'y
   déclarer — le courriel d'envoi le dit depuis le 2026-09-12, le document non.
2. **Le papier gagne en litige.** On prélèverait sous un schéma sans
   remboursement, sur une autorisation dont le texte signé **accorde** le
   remboursement à huit semaines.

## Ce qu'il faut faire — et pourquoi ce n'est pas une retouche

Le formulaire B2B n'est pas le formulaire CORE avec un mot changé. Il doit
porter :

- la mention **« INTERENTREPRISES »**, lisible, dans le titre ;
- l'énoncé **explicite** que le débiteur ne peut pas demander le remboursement
  d'un prélèvement autorisé ;
- la phrase qui dit au débiteur de **déclarer le mandat à sa banque** — c'est le
  geste sans lequel le premier débit est refusé.

🔴 **Un seul endroit doit décider du schéma.** Aujourd'hui `LclInstrm` est écrit
en dur dans le rendu du lot, et le formulaire n'en sait rien : c'est ce qui a
permis la divergence. La bascule doit les faire lire la même valeur, pour que la
question « quel schéma ? » n'ait plus qu'une réponse dans le dépôt.

## Ce qui commande, et qui n'est pas nous

⚠️ **Le schéma B2B s'ouvre sur contrat séparé avec la banque du créancier.**
C'est la Caisse d'Épargne qui confirmera le formulaire qu'elle attend — et c'est
une des questions déjà en attente (cf.
[`../comptabilite/prelevement-sepa.md`](../comptabilite/prelevement-sepa.md)
§12). Basculer le formulaire avant sa réponse, c'est risquer de le refaire.

**La question à lui poser**, en une phrase : _le contrat SDD B2B est-il ouvert
sur notre compte, et quel modèle de mandat attendez-vous — le vôtre, ou le modèle
EPC interentreprises ?_

## Ce qui est déjà signé, et qu'il faudra refaire

Tout mandat imprimé avant la bascule porte le texte CORE. Au 2026-09-13, un seul
existe en développement (`LFC-6KTQAT-260913-HZMF98`, brouillon) — **l'état de la
production n'a pas été vérifié**.

## Ce que ce TODO ne couvre pas

- **le balayage de caducité** — aucun mandat ne passe à `expired` après 36 mois ;
- **la séquence `FRST`/`SMNDA`** après un changement de banque du débiteur, et
  l'historique des changements de compte que le CFONB exige ;
- **les trois objections bloquantes** 1, 3 et 4 du §10 ;
- **le palier 3** du scellement de `creditor_iban` — supprimer la colonne
  claire, après ressaisie ;
- **les dix questions à la Caisse d'Épargne**, dont aucune ne se répond depuis le
  dépôt.
