# Le mandat imprimé est un CORE, le lot déclare B2B

**Ouvert le 2026-09-13.**
🔴 Bloque le premier prélèvement réel, et engage juridiquement.

Ce fichier **remplace** le TODO précédent de ce dossier, livré le même jour : la
RUM s'imprime, le filigrane tombe avec elle, et le mandat part au client par
courriel.

> ✅ **Tranché par Hugo le 2026-09-14 : on fait INTERENTREPRISES (B2B).** Le
> lot déclare déjà `B2B` : c'est le **formulaire** qui bascule, pas le lot. La
> bascule est le lot 0 de [`../b2b/plan-mandat-client.md`](../b2b/plan-mandat-client.md).
> ✅ **Le contrat SDD B2B avec la Caisse d'Épargne est signé** (dit par Hugo le
> 2026-09-14) : la bascule n'attend plus de réponse. ~~Mécanisme retenu : le schéma
> devient une propriété de chaque mandat (plan §7).~~ Abandonné le même jour pour
> la version simple du plan §8.
>
> ✅ **Bascule FAITE le 2026-09-14** (lot 0 du plan, version simple du §8 — le
> §7 et sa colonne `scheme` par mandat ont été abandonnés : aucun mandat en
> production, dit par Hugo le même jour). Le schéma est une constante unique,
> `SEPA_SCHEME` (`b2b/accounting/domain/value-objects/sepa-scheme.ts`), lue par
> `pain008.ts` ET par `sepa-mandate-pdf.ts` ; le texte du formulaire vit dans
> `sepa-mandate-wording.ts`, indexé par le schéma. Le formulaire porte
> « interentreprises » dans ses deux titres, le texte d'autorisation B2B et la
> consigne de déclarer le mandat à sa banque ; le courriel
> `customer.mandate-to-sign` dit le même vocabulaire. Tenu par
> `sepa-mandate-scheme.spec.ts`. Les tableaux « Le fait » ci-dessous décrivent
> l'état du 2026-09-13, avant la bascule.
>
> ⚠️ **Libellé non confronté au modèle de la banque** : le texte d'autorisation
> est la version la plus fidèle à ce document, pas une copie du modèle que la
> Caisse d'Épargne attend. À aligner au mot près quand elle l'aura fourni.
>
> ⚠️ **13 mois : retiré, à confirmer avec la banque** — ce délai vise les
> opérations non autorisées, pas le remboursement. Il est parti avec le
> paragraphe CORE entier (plan §8 et §9 #7).
>
> ~~Ce choix ne dispense pas du **contrat SDD B2B** avec la Caisse d'Épargne :~~
> sans lui, la banque du créancier refusera le lot. La question à la banque
> change de forme — « ouvrez le B2B, quel modèle attendez-vous ? » — elle ne
> disparaît pas.

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

## Le type de paiement — deux trous, ouverts le 2026-09-14

Tranché par Hugo le 2026-09-14 (plan §9 #6) : le lot **suit** le réglage de
l'entité émettrice (`LegalEntity.mandatePaymentType`) — `RCUR` pour `recurrent`,
`OOFF` pour `one_off` — au lieu d'écrire `RCUR` en dur. Le formulaire coche la
zone 12 selon ce même réglage. Ce que la bascule laisse ouvert :

- **Le réglage COURANT, pas ce qui a été imprimé.** Le mandat ne mémorise pas la
  case cochée sur son papier. Si le réglage de l'entité change après la
  signature, le lot suivant prélève sous une séquence que le papier signé
  n'autorise pas. Tranché au plus simple parce qu'aucun mandat n'existe en
  production (dit par Hugo le 2026-09-14) ; à fermer avant qu'un réglage change
  sur une entité qui a des mandats actifs — en figeant le type de paiement sur
  le mandat à la frappe, ou en refusant de changer le réglage tant qu'un mandat
  actif existe.
- **Un mandat ponctuel ne sert qu'à UN débit, et rien ne refuse le second.** Le
  lot (`pain008.ts`, via `DebtorMandateReader.activeFor`) ne connaît aucun débit
  déjà présenté : il n'existe pas d'historique des prélèvements par mandat
  (vérifié le 2026-09-14 — `DebtorMandate` ne porte que la RUM et l'IBAN, et les
  tentatives sont la tranche 9 de `prelevement-sepa.md`). Une entité réglée en
  ponctuel ferait donc repartir le même mandat `OOFF` à chaque cycle. À fermer
  avec l'historique des débits : un mandat ponctuel déjà présenté sort du lot
  (ou passe caduc).

## Ce que ce TODO ne couvre pas

- **le balayage de caducité** — aucun mandat ne passe à `expired` après 36 mois ;
- **la séquence `FRST`/`SMNDA`** après un changement de banque du débiteur, et
  l'historique des changements de compte que le CFONB exige ;
- **les trois objections bloquantes** 1, 3 et 4 du §10 ;
- **le palier 3** du scellement de `creditor_iban` — supprimer la colonne
  claire, après ressaisie ;
- **les dix questions à la Caisse d'Épargne**, dont aucune ne se répond depuis le
  dépôt.

## Un mandat ACTIF dont le staff change le RIB — aucun mécanisme

**Ajouté le 2026-09-14** (plan [`../b2b/plan-mandat-client.md`](../b2b/plan-mandat-client.md)
§9 #5), hors du Lot A qui l'a constaté.

Le mandat ne fige pas le compte qu'il nomme : le PDF et le lot lisent le RIB
**courant**. Depuis le Lot A :

- un **brouillon** est révoqué par toute écriture du RIB ou des zones 14/19
  (staff comme client), fait `payment_mandate.draft_voided` au journal, cloche
  staff ;
- côté **client**, remplacer le RIB est refusé en **409** tant qu'un mandat est
  actif ;
- côté **staff**, rien n'empêche de remplacer le RIB sous un mandat **actif** :
  le prochain lot prélèverait un compte que le papier signé ne nomme pas.
  `CompanyBankAccount.replaceWith` calcule déjà si le compte a réellement
  changé, et ce booléen reste ignoré.

Pourquoi ce n'est pas bloquant aujourd'hui : **aucun mandat actif en production**
(Hugo, 2026-09-14), et l'écran staff avertit déjà quand le RIB diffère du compte
mandaté (`mandateLast4`). Le geste à décider avec la banque : amendement sous la
même RUM (`AmdmntInd` + `OrgnlDbtrAcct`) ou nouveau mandat.
