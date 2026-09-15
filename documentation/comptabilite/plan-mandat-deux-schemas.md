# Plan — l'entité choisit le schéma de ses mandats : CORE ou interentreprises

> **Ouvert le 2026-09-15** à la demande de Hugo, soumis à `vitruve` (§9).
> ✅ **Construit et en production le 2026-09-15** (merge `174dae4c`). Les écarts
> restés à trancher sont au §11.

## 0. La demande

> « les mandats que nous fabriquons en ce moment sont étiquetés comme
> interentreprise mais ils sont en fait CORE, ça n'invalide pas le travail, mais
> nous avons besoin du format du document que je te donne […] que dans legal
> entity, on puisse sélectionner le type de mandat à produire par l'entité
> comme ça on aura les deux » — Hugo, 2026-09-15.

Le document fourni est le **mandat SEPA interentreprises de la DGFiP**
(`mandat_prelevement_sepa_interentreprise.pdf`, une page). Il sert de **gabarit
de mise en page**, pas de texte à recopier tel quel : il nomme la DGFiP comme
créancier (§3.2).

## 1. Ce qui existe (vérifié le 2026-09-15)

| Fait                                                                                                                                                                                      | Où                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Le schéma est **une constante globale** : `SepaScheme = "B2B"`, `SEPA_SCHEME = "B2B"`                                                                                                     | `b2b/accounting/domain/value-objects/sepa-scheme.ts`                                            |
| Le rendu (1009 lignes) dessine la **mise en page EPC CORE** : zones numérotées 1 à 20, phrase (A)/(B), cases de type de paiement, zones de contrat 14-20                                  | `b2b/accounting/domain/services/sepa-mandate-pdf.ts`                                            |
| Le **texte** B2B est posé dans cette mise en page CORE depuis `dfeca850` (2026-09-14) : titres, autorisation, consigne de déclaration                                                     | `sepa-mandate-wording.ts`, indexé par `SepaScheme`                                              |
| Le texte CORE d'origine (droit au remboursement, 8 semaines, 13 mois) est récupérable **au mot près** dans `dfeca850^`                                                                    | `git show dfeca850^:…/sepa-mandate-pdf.ts`, fonction `authorization`                            |
| Le lot écrit **un seul** `PmtInf`, `LclInstrm` = `SEPA_SCHEME`, `SeqTp` = type de paiement **courant de l'entité**                                                                        | `pain008.ts` l.139 et l.169                                                                     |
| Le lecteur du lot rend `{ reference, iban }` par société, **sans schéma** ; il lit les mandats `active` et le RIB **courant**                                                             | `prisma-debtor-mandate.reader.ts`                                                               |
| Le mandat **ne mémorise ni son schéma ni son type de paiement** (le §7 de `plan-mandat-client.md` l'avait prévu, abandonné au §8 faute de mandats en production)                          | `PaymentMandate` (Prisma), `payment_mandates`                                                   |
| Les réglages de mandat de l'entité : description (zone 20) et type de paiement (zone 12), une commande `SetMandateDefaults`, **un payload à `.default()`**                                | `MandateDefaults`, `setMandateDefaultsPayloadSchema` (`packages/contracts/src/legal-entity.ts`) |
| L'émetteur est **unique** : `soleIssuer()` partout (frappe, rendu client)                                                                                                                 | `mint-mandate-support.ts:92`, `customer-mandate-support.ts:59`                                  |
| `findHolder` ne sait de la société que raison sociale, e-mail, référence — **ni SIRET, ni forme juridique**                                                                               | `prisma-payment-mandate.repository.ts:156`                                                      |
| La société porte `raisonSociale`, `formeJuridique`, `siret` (**facultatif** à l'ouverture, chaîne vide = absence)                                                                         | `model Company`                                                                                 |
| Le lot **n'utilise pas** les zones 14 et 19 (`debtorReference`, `contractNumber`)                                                                                                         | grep vide sur `pain008.ts` et le port                                                           |
| « interentreprises » est écrit en dur dans **trois** textes hors formulaire : le courriel `customer.mandate-to-sign`, deux clés du copy client (`mandateNoneBody`, `mandateAwaitingBody`) | `mail-templates.ts:461-490`, `account.fr.ts:314-316`                                            |
| Tests du schéma : le lot et le formulaire lisent la même constante, instantané du texte B2B, absence de « 8 semaines »/« 13 mois »                                                        | `sepa-mandate-scheme.spec.ts`                                                                   |

⚠️ **Non vérifié** : l'existence de mandats frappés en production depuis le
déploiement `0abf7917` (le staff peut frapper ; le client non, drapeau fermé).
La réponse change le §5 — c'est la question Q1.

## 2. Ce que la demande veut dire, en une phrase

**Le schéma devient un réglage de l'entité, et chaque mandat fige le schéma sous
lequel il a été frappé.** Deux documents : l'actuel devient le **mandat CORE**
(texte CORE restauré), le gabarit DGFiP devient le **mandat interentreprises**.

🔴 Le second membre de la phrase n'est pas optionnel. Dès qu'un réglage peut
changer, « le lot lit le réglage courant » prélève des mandats CORE en B2B (la
banque du débiteur refuse : rien n'est déclaré chez elle) ou des mandats B2B en
CORE (le débiteur obtient 8 semaines de remboursement que son papier lui
refusait). Le trou que `todo-mandat-core-contre-b2b.md` a laissé ouvert
« parce qu'aucun réglage ne change » est **exactement** ce que la demande ouvre.

## 3. Les décisions proposées

### 3.1 Le modèle

- `SepaScheme = "CORE" | "B2B"`. `SEPA_MANDATE_WORDING` indexé par le type :
  ajouter `CORE` sans son texte ne compile pas (la garantie actuelle survit).
- **Sur l'entité** : `MandateDefaults` gagne `scheme`. Colonne
  `legal_entities.mandate_scheme`, enum Postgres `SepaScheme`, `NOT NULL DEFAULT
'B2B'` — le défaut est ce que le lot déclare aujourd'hui et le contrat signé
  avec la Caisse d'Épargne.
- **Sur le mandat** : `payment_mandates.scheme` **et**
  `payment_mandates.payment_type`, figés à la frappe depuis l'émetteur. Lignes
  existantes : `scheme = 'B2B'` (ce que leur papier dit depuis `dfeca850`),
  `payment_type = 'recurrent'` (seul réglage connu en production — **à
  confirmer par la lecture de Q1**).
- `SEPA_SCHEME` **disparaît**. Il ne reste aucune réponse globale à « quel
  schéma ? » : la question se pose toujours à un mandat ou à une entité.

### 3.2 Les deux documents

**CORE** — la mise en page actuelle, inchangée, avec le texte CORE restauré
depuis `dfeca850^` : titre « MANDAT DE PRÉLÈVEMENT SEPA », droit au
remboursement, 8 semaines, 13 mois, pas de consigne de déclaration à la banque.

**Interentreprises** — nouveau rendu d'après le gabarit DGFiP :

| Bloc du gabarit                                                                          | Ce qu'on imprime                                                                                                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| En-tête Marianne + logo Finances publiques                                               | **Retirés.** Notre logo d'entité à la place (cellule vide sans logo, comme aujourd'hui)                                                                |
| Titre encadré « MANDAT DE PRELEVEMENT SEPA INTERENTREPRISES »                            | Identique                                                                                                                                              |
| Bandeau gris « Vous devez compléter et signer… transmettre à votre établissement… RUM… » | Identique                                                                                                                                              |
| « vous autorisez la Direction Générale des Finances Publiques… »                         | Le **créancier imprimé** (`creditorNameOn` : titulaire du compte) aux deux occurrences                                                                 |
| Paragraphe « dédié aux prélèvements SEPA interentreprises… »                             | Identique, gras compris                                                                                                                                |
| Peigne RUM 35 cases, préfixe `nn` + `DGFIP`                                              | 35 cases, **notre RUM** sans préfixe (24 caractères aujourd'hui). Le refus « déborde du peigne » passe à 35                                            |
| SIREN (ou IDSP) du débiteur                                                              | **SIREN = 9 premiers chiffres du SIRET** ; peigne vide si le SIRET est vide (Q3)                                                                       |
| Raison sociale du débiteur                                                               | `Company.raisonSociale`                                                                                                                                |
| Titulaire : civilité/forme juridique, nom, adresse, pays                                 | Nom et adresse = RIB. **Forme juridique : vide** — le titulaire peut différer de la société, et le RIB ne porte pas de forme juridique (Q4)            |
| IBAN, BIC « seulement hors EEE »                                                         | IBAN en peigne ; BIC imprimé quand on l'a (inoffensif, et le lot en a besoin)                                                                          |
| Nom du créancier, ICS en peigne                                                          | `creditorNameOn`, `icsRow` réutilisé                                                                                                                   |
| Adresse créancier : « Nom du service gestionnaire », voie, CP/ville, FRANCE              | **Pas de service gestionnaire** (propre à la DGFiP) ; adresse du compte créancier ; pays depuis l'adresse, pas « FRANCE » en dur                       |
| Type de paiement : texte « Paiement récurrent »                                          | Texte selon le type **du mandat** (« Paiement récurrent » / « Paiement ponctuel »), pas de case                                                        |
| Lieu, Date JJMMAAAA, « Veuillez signer ici »                                             | Identique, vides                                                                                                                                       |
| Mention loi 78-17, articles 38 et suivants                                               | **Remplacée** par une mention RGPD au nom du créancier — l'article 38 cité n'est plus la base de ces droits depuis 2018. Texte à valider par Hugo (Q5) |
| _Absent du gabarit_ : zones 14, 19, 20 (code débiteur, n° et description du contrat)     | **Non imprimées** en interentreprises (Q2)                                                                                                             |
| Filigrane EXEMPLE sans RUM                                                               | Conservé : l'invariant « un seul paramètre commande RUM et filigrane » vaut pour les deux rendus                                                       |

Structure : `sepa-mandate-pdf.ts` devient un **aiguillage** sur le schéma ;
`core-mandate-pdf.ts` (le dessin actuel), `b2b-mandate-pdf.ts` (le nouveau),
`mandate-pdf-drawing.ts` (primitives partagées : `put`, `line`, `comb`,
`icsRow`, `watermark`, `creditorNameOn`…). Le fichier actuel dépasse déjà la
borne des 300 lignes : la coupe est due, pas cosmétique.

`DebtorSnapshot` gagne `siren` et `companyName` (le débiteur n'est pas le
titulaire) ; `MandateHolder` gagne `siret` ; `findHolder` les lit.

### 3.3 Le réglage, et ce qu'il fait en changeant

- **Commande dédiée** `SetMandateScheme`, route `PUT
/admin/accounting/legal-entities/:id/mandate-scheme`, **pas** un champ de plus dans
  `setMandateDefaultsPayloadSchema`. Raison : ce payload est à `.default()` ; un
  écran d'admin encore ouvert sur l'ancien bundle enverrait les deux champs
  connus, et le troisième retomberait à `B2B` en silence — un changement de
  schéma de prélèvement qu'aucun humain n'aurait décidé.
- **Fait au journal** `legal_entity.mandate_scheme_changed` (avant → après),
  dans la transaction.
- **Les brouillons de l'entité deviennent caducs** au changement de schéma
  **ou** de type de paiement : même mécanisme que la révocation par RIB
  (`draft-mandate-voiding.ts`, `payment_mandate.draft_voided`, cloche staff),
  avec un `reason` qui le dit. Sans ça, un client imprime un brouillon CORE
  alors que l'entité est passée B2B, et c'est ce papier-là que le staff activera.
- **Les mandats actifs ne bougent pas** : ils gardent leur schéma et leur type
  jusqu'à leur remplacement. L'écran de l'entité affiche « N mandats actifs
  restent sous CORE » après une bascule — compte, pas liste.
- Écran d'admin : `MandateSettingsCard`, sélecteur « Schéma du mandat » ouvert
  **en dialogue de confirmation** qui nomme la conséquence (remboursement 8
  semaines ou non, déclaration à la banque, brouillons caducs).

### 3.4 Le lot

- Le port `DebtorMandate` gagne `scheme` et `paymentType` ; le lecteur les lit
  **sur le mandat**.
- `SeqTp` suit le type **du mandat**, plus celui de l'entité.
- **Un fichier par schéma** (Q6) : l'export du cycle rend `pain008-CORE-…xml`
  et/ou `pain008-B2B-…xml`, chacun omis s'il est vide. Alternative : un
  `PmtInf` par couple (schéma, séquence) dans un seul fichier — permis par la
  norme, mais un bloc refusé peut faire rejeter le message entier, et la
  question 4 posée à la banque porte déjà sur ce découpage.
- L'audit du cycle (`pain008-audit.ts`) dit le schéma de chaque ligne.

### 3.5 Les textes autour du papier

- Courriel `customer.mandate-to-sign` : `footer` et titres **selon le schéma du
  mandat**, passé dans `data` (le mailer reste ignorant de la comptabilité : il
  reçoit un `scheme`, pas un import).
- Copy client : `mandateNoneBody` et `mandateAwaitingBody` en deux variantes ;
  `CustomerMandateView` gagne `scheme` (champ ajouté, rien retiré). fr/en/it.
- Carte « Options du mandat » (zones 14/19) côté client : **masquée** quand
  l'émetteur est en interentreprises, puisque le document ne les imprime pas
  (suit Q2).

## 4. Les lots

| Lot | Contenu                                                                                                                                                                                                                                                                 | Agent                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 0   | Migration additive (enum, deux colonnes mandat, une colonne entité, défauts §3.1) ; `SepaScheme` à deux valeurs ; frappe fige schéma + type ; lecteur du lot et `SeqTp` lisent le mandat ; `SEPA_SCHEME` supprimé. **Aucun changement visible** : tout le monde est B2B | batisseur + `lecteur-de-migrations` |
| 1   | Découpe du rendu en aiguillage + primitives ; rendu CORE = dessin actuel + texte `dfeca850^` ; le rendu B2B provisoire = dessin actuel + texte B2B actuel (état de production conservé)                                                                                 | batisseur                           |
| 2   | Rendu interentreprises d'après le gabarit DGFiP (§3.2) ; `DebtorSnapshot`/`MandateHolder` étendus ; une page ; vérification à l'œil sur deux PDF rendus envoyés à Hugo                                                                                                  | batisseur                           |
| 3   | `SetMandateScheme` + journal + caducité des brouillons (schéma **et** type de paiement) ; contrat ; carte d'admin et dialogue de confirmation                                                                                                                           | batisseur + pablo                   |
| 4   | Lot : un fichier par schéma, audit ; courriel et copy client par schéma ; carte options masquée                                                                                                                                                                         | batisseur + pablo                   |

Chaque lot se déploie seul. Le lot 0 rend l'état actuel explicite avant que
quoi que ce soit ne puisse changer ; le lot 3 est le seul qui rend la bascule
**possible** — il ne part pas avant 1, 2 et 4.

## 5. Tests qui tiennent le plan

- **Domaine** : `Rum` ≤ 35 dans les deux rendus ; texte d'autorisation complet
  par schéma (instantané) ; CORE contient 8 semaines et 13 mois, B2B ne contient
  ni l'un ni l'autre ; les deux tiennent sur une page ; filigrane sans RUM dans
  les deux ; le rendu B2B ne contient ni « Direction Générale », ni « DGFIP »,
  ni l'IBAN du créancier ; SIREN = 9 premiers chiffres, vide si SIRET vide.
- **Lot** : un mandat CORE et un mandat B2B du même cycle sortent dans deux
  fichiers, chacun avec son `LclInstrm` ; `SeqTp` d'un mandat récurrent sous une
  entité passée ponctuel reste `RCUR`.
- **Application** : la frappe copie schéma et type de l'émetteur ; changer le
  schéma ou le type rend caducs les brouillons, pas les actifs, et journalise ;
  le rendu d'un brouillon lit le schéma **du mandat**, pas de l'entité (entité
  basculée entre frappe et impression → caduc, donc plus imprimable).
- **Régression** nommée : « un mandat frappé en B2B ne part pas en CORE après
  une bascule de l'entité ».
- **E2E** : route `mandate-scheme` (401/403/200, journal), export du cycle à deux
  fichiers.

## 6. Ce que ce plan ne fait pas

- Plusieurs émetteurs (`soleIssuer` reste) ;
- la re-signature assistée des actifs CORE après une bascule (le compte s'affiche,
  le geste reste staff) ;
- l'historique des débits et le second débit d'un ponctuel (todo existante) ;
- le compte figé sur le mandat (todo existante : RIB changé sous un actif).

## 7. Questions à Hugo

1. **Quels mandats existent en production, et quand ont-ils été frappés ?** La
   frappe staff est en production depuis `544c54e6` (2026-09-13 09:17) ; le
   texte B2B n'y est arrivé qu'avec `0abf7917` (2026-09-14 22:11). Un mandat
   frappé entre les deux porte un papier **CORE**. Requête en lecture à lancer
   toi-même :
   `select reference, status, created_at from public.payment_mandates order by created_at;`
2. **Zones 14/19/20 en interentreprises** : ne pas les imprimer (le gabarit n'en
   a pas, recommandé), ou ajouter un bloc « informations complémentaires » sous
   la signature ?
3. **SIRET vide** : laisser le peigne SIREN vide à remplir à la main
   (recommandé, la frappe reste possible), ou refuser la frappe B2B sans SIRET ?
4. **Forme juridique du titulaire** : vide à remplir à la main (recommandé), ou
   préremplie avec celle de la société quand le titulaire du RIB porte la même
   raison sociale ?
5. **Mention données personnelles** : la remplacer par une mention RGPD à notre
   nom (recommandé), ou reprendre le texte du gabarit au nom du créancier ?
6. **Un fichier par schéma** (recommandé) ou un seul fichier à deux blocs ? À
   poser aussi à la Caisse d'Épargne, avec : le contrat couvre-t-il le **CORE**
   en plus du B2B ?
7. **Défaut à la migration** : `B2B` pour l'entité existante (ce que le lot
   déclare et le contrat signé) — confirmes-tu ?

## 8. Ce que ça périme, à corriger dans les lots

- `sepa-scheme.ts` (« le type ne connaît QUE B2B »), `sepa-mandate-pdf.ts`
  (bandeau « CE FORMULAIRE EST UN MANDAT INTERENTREPRISES »),
  `sepa-mandate-wording.ts`, `pain008.ts` l.162-175, `mail-templates.ts:475` ;
- `documentation/comptabilite/lexique.md` §1 (« Le document imprimé par ce dépôt
  est un B2B ») ;
- `todo-mandat-core-contre-b2b.md` : le trou « réglage courant » se ferme au lot
  0 ; `plan-mandat-client.md` §8 (« pas de colonne `scheme` ») renvoie ici.

## 9. Contradiction (vitruve)

Rendue le 2026-09-15. **Rien n'est encore corrigé dans le corps du plan** : les
corrections ci-dessous le priment là où elles divergent, et s'y reportent avant
le premier lot.

| #   | Niveau   | Objection                                                                                                                                                                                                                                                        | Correction retenue                                                                                                                                   |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | BLOQUANT | Défaut `scheme = 'B2B'` faux : la frappe staff est en prod depuis `544c54e6` (2026-09-13), le texte B2B depuis `0abf7917` (2026-09-14 soir) — ~37 h de papiers CORE                                                                                              | Q1 lit `created_at` ; le schéma de chaque ligne existante se décide sur sa date de frappe **avant** d'écrire la migration                            |
| 2   | BLOQUANT | Lot 0 inverse le trou : le lot lirait le type du mandat, le rendu du brouillon lit encore celui de l'entité (ligne 846 de `sepa-mandate-pdf.ts` avant sa découpe), et le réglage est déjà modifiable en ligne                                                    | Au lot 0, le rendu d'un brouillon lit schéma **et** type du mandat (`customer-mandate-support.ts:77`)                                                |
| 3   | BLOQUANT | Un fichier par schéma : une société sans mandat n'a pas de schéma, et `isDepositable` calculé par fichier rendrait « déposable » un lot qui l'omet en silence                                                                                                    | Caractère déposable calculé sur **tout le cycle** avant découpe ; les sociétés sans mandat restent visibles et gardent le bandeau sur chaque fichier |
| 4   | BLOQUANT | `MsgId` = `cycleTag` et `EndToEndId` = `cycleTag-rang` identiques dans deux fichiers du même cycle (`pain008.ts:138`, l.219)                                                                                                                                     | Le schéma entre dans `MsgId`, `PmtInfId`, `EndToEndId` (≤ 35 caractères revérifiés)                                                                  |
| 5   | SÉRIEUX  | Un `DEFAULT` SQL laissé sur `payment_mandates` rend l'oubli du schéma à la frappe silencieux                                                                                                                                                                     | `ADD COLUMN … DEFAULT` puis `DROP DEFAULT` dans la même migration, pas de `@default` Prisma                                                          |
| 6   | SÉRIEUX  | `payment_type = 'recurrent'` en constante ignore le réglage réel                                                                                                                                                                                                 | Remplissage par `UPDATE … FROM legal_entities` sur `creditor_id`                                                                                     |
| 7   | SÉRIEUX  | `scheme` dans `MandateDefaults` : `SetMandateDefaultsHandler` reconstruit la valeur entière, chaque édition de description remettrait B2B                                                                                                                        | Schéma **hors** de `MandateDefaults`, méthode `LegalEntity.changeMandateScheme()`                                                                    |
| 8   | SÉRIEUX  | La caducité en masse n'a pas de port : `writeVoidingDraft` vise une société et vit dans `payments` ; `accounting` n'a qu'un port de lecture ; la porte ne tient pas `accounting`↔`payments`                                                                      | Port d'écriture déclaré par `accounting`, implémenté par `payments`, N révocations dans l'unité de travail — à concevoir avant le lot 3              |
| 9   | SÉRIEUX  | Le front admin appelle un seul `draft.xml` et impose son propre nom de fichier (`tableau-de-bord-page.ts:228`)                                                                                                                                                   | `draft.xml` gardé en déprécié, `?scheme=` ajouté, le front respecte le nom rendu par le serveur                                                      |
| 10  | SÉRIEUX  | « le lot a besoin du BIC » est faux : `pain008.ts` n'écrit aucun `DbtrAgt` — probablement obligatoire dans le XSD (`NOTPROVIDED`), non vérifié                                                                                                                   | Justification retirée ; `DbtrAgt` ajouté au lot 4, à confirmer sur le XSD / guide de la banque                                                       |
| 11  | SÉRIEUX  | La mention RGPD doit couvrir l'art. 13 (responsable, finalité, base, destinataires, durée, droits, CNIL) : Q5 bloque le lot 2                                                                                                                                    | Lot 2 marqué bloqué par Q5, ou renvoi à la politique de confidentialité                                                                              |
| 12  | SÉRIEUX  | Masquer la carte 14/19 « quand l'émetteur est B2B » la retire à **tout le monde** tout de suite ; ces zones révoquent toujours le brouillon                                                                                                                      | Q2 tranché avant le lot 2 ; si confirmé, dit comme retrait de fonction et la révocation sur ces zones s'arrête en B2B                                |
| —   | MINEUR   | en/it portent les mêmes clés ; `SEPA_SCHEME` lu à 5 endroits du rendu ; zone 20 réimprimée sans caducité ; mise en page des brouillons B2B qui change sous la même RUM ; SIRET ancien non revalidé ; « SIREN (ou IDSP) » propre à la DGFiP, pas une exigence EPC | Pris en compte dans les lots concernés                                                                                                               |

**Non vérifié par vitruve** : l'état des mandats en production (Q1), le
caractère obligatoire de `DbtrAgt`, le refus d'un `MsgId` en double par la
Caisse d'Épargne, et ce que couvre son contrat (CORE en plus du B2B ?).

## 10. Contrat de construction — 2026-09-15

**Tranché par Hugo le 2026-09-15** : « aucun mandat en production, recommandé
partout, fais tout le plan ». Les réponses du §7 sont donc les recommandations :

| Q   | Décision                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Aucun mandat en production. Lignes existantes (dev) : `scheme = B2B`, `payment_type` = réglage de l'émetteur (migration `20260915090000`) — objections 1 et 6 closes               |
| 2   | Zones 14/19/20 **non imprimées** en interentreprises ; carte client des options masquée quand l'émetteur est B2B ; l'écriture de ces zones ne rend plus un brouillon **B2B** caduc |
| 3   | SIRET vide → peigne SIREN vide, la frappe reste possible                                                                                                                           |
| 4   | Forme juridique du titulaire : vide                                                                                                                                                |
| 5   | Mention RGPD à notre nom (texte ci-dessous, **à relire par Hugo**)                                                                                                                 |
| 6   | Un fichier par schéma                                                                                                                                                              |
| 7   | Défaut de l'entité : `B2B`                                                                                                                                                         |

Les corrections de vitruve (§9) **priment sur le corps du plan** (§3-§5).

### 10.1 Fondation — FAITE avant les lots (non commitée)

- Prisma : enum `SepaScheme { CORE B2B }` ; `LegalEntity.mandateScheme` (défaut `B2B`) ;
  `PaymentMandate.scheme` + `paymentType` **sans défaut**. Migration appliquée en dev et test.
- Domaine : `SepaScheme = "CORE" | "B2B"` ; `SEPA_SCHEME` gardé **transitoire** ;
  `SEPA_MANDATE_WORDING.CORE` restauré depuis `dfeca850^`, `bankDeclaration: string | null`.
- `LegalEntity` : `mandateScheme` (hors `MandateDefaults`, objection 7),
  `changeMandateScheme(scheme): boolean` ; `CreditorSnapshot.mandateScheme`.
- `PaymentMandate` : `MandateSnapshot.scheme` / `.paymentType`, recopiés à la frappe
  (`mint-mandate-support.ts`), `draftMandate` (Stripe) = `CORE`/`recurrent`, jamais réécrits par `save`.
- Contrats : `sepaSchemeSchema`, `SepaScheme`, `SEPA_SCHEME_LABELS`,
  `setMandateSchemePayloadSchema` (sans `.default`), `LegalEntityView.mandateScheme`,
  `PaymentMandateView.scheme`, `CustomerMandateView.scheme`.

### 10.2 Lot « prélèvement » (batisseur L)

**Fichiers** : `pain008.ts`, `pain008-audit.ts` et leurs specs ; `ports/debtor-mandate.reader.ts`,
`prisma-debtor-mandate.reader.ts` ; `cycle-draft-support.ts`, `export-cycle-draft.handler.ts`,
`export-cycle-audit.handler.ts` ; `admin-billing-cycle.controller.ts` ; e2e du cycle.

- `DebtorMandate` gagne `scheme`, `paymentType`, `bic` — lus **sur le mandat** et le RIB.
- `renderPain008` prend un `scheme` : ne contient que les lignes dont le mandat a ce schéma ;
  **un `PmtInf` par `SeqTp`** présent (type du mandat : `RCUR` / `OOFF`).
- **Déposable = calculé sur tout le cycle** (objection 3) : une société sans mandat actif
  retire le caractère déposable de **chaque** fichier, et le bandeau la nomme.
- `MsgId` = `[BROUILLON-]<cycleTag>-<scheme>` ; `PmtInfId` = `<MsgId>-<SeqTp>` ;
  `EndToEndId` = `<cycleTag>-<scheme>-<rang>` — ≤ 35 caractères, testé (objection 4).
- `DbtrAgt` : `<FinInstnId><BIC>…</BIC>` si connu, sinon `<Othr><Id>NOTPROVIDED</Id></Othr>` (objection 10).
- Routes : `GET …/billing-cycle/draft.xml?scheme=CORE|B2B` — **sans paramètre = B2B**,
  comportement d'hier, marqué déprécié ; `Content-Disposition` porte le nom
  `[BROUILLON-]prelevement-<scheme>-<siren>-<cycleTag>.xml`, exposé par CORS si nécessaire.
  L'audit CSV porte une colonne schéma.
- `SEPA_SCHEME` n'est plus lu par ce lot.

### 10.3 Lot « rendu » (batisseur R)

**Fichiers** : `sepa-mandate-pdf.ts` (aiguillage), nouveaux `core-mandate-pdf.ts`,
`b2b-mandate-pdf.ts`, `mandate-pdf-drawing.ts` ; `sepa-mandate-wording.ts` ;
`sepa-scheme.ts` ; `debtor-snapshot.ts` ; specs du rendu dont `sepa-mandate-scheme.spec.ts`
(les assertions `pain008` en sortent) ; `customer-mandate-support.ts` ;
`export-sample-mandate.handler.ts` ; `MandateHolder` + `findHolder` (région de la méthode seulement).

- Signature : `renderSepaMandatePdf(form: MandateForm, creditor, logo, debtor, issuance)`,
  `MandateForm = { scheme; paymentType }`. Brouillon imprimé → forme **du mandat** ;
  aperçu sans brouillon et exemplaire d'entité → réglages de l'entité (objection 2).
- CORE : le dessin actuel, texte CORE. B2B : gabarit du §3.2, une page, peigne RUM 35.
- `DebtorSnapshot` + `siren` (9 premiers chiffres du SIRET s'il en a 14, sinon vide) et
  `companyName` ; `MandateHolder` + `siret`.
- Mention données personnelles B2B (à relire par Hugo) :
  « Les informations de ce mandat sont traitées par {créancier}, responsable du traitement,
  pour la gestion de vos prélèvements SEPA, sur la base du contrat qui nous lie. Elles ne sont
  communiquées qu'aux établissements bancaires qui exécutent ces prélèvements, et conservées
  pendant la durée du mandat puis pendant les délais légaux de contestation et de conservation
  comptable. Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation et
  d'opposition, en écrivant au créancier à l'adresse ci-dessus, ainsi que du droit d'introduire
  une réclamation auprès de la CNIL. »
- Supprime `SEPA_SCHEME` quand plus rien ne le lit (sinon le dit).

### 10.4 Lot « réglage » (batisseur S)

**Fichiers** : commande `set-mandate-scheme.*` et requête `get-mandate-scheme-usage.*`
(accounting) ; `admin-legal-entity-banking.controller.ts` ; un port d'écriture **déclaré par
accounting**, implémenté dans `payments`, lié dans `appBootstrap` ; `set-mandate-defaults.handler.ts` ;
`record-mandate-options.ts` ; `draft-mandate-voiding.ts` ; `mandate-staff-bell.ts` ;
`payment-mandate-facts.ts` ; `mail-templates.ts` + spec ; `send-mandate.handler.ts` ;
contrats `company-bank-account.ts` (options) et `legal-entity.ts` (vue d'usage).

- `PUT /admin/accounting/legal-entities/:id/mandate-scheme` `{ scheme }` → `changeMandateScheme` ; si changé :
  fait `legal_entity.mandate_scheme_changed` (avant/après) **et** caducité des brouillons de
  l'émetteur, dans la même unité de travail (objection 8). Même permission que les réglages de mandat.
- `SetMandateDefaults` : brouillons caducs si le **type** change, ou si la **description** change
  sous un émetteur CORE (seul le CORE l'imprime).
- Nouvelle cause de caducité : `mandate_scheme_changed`, `mandate_defaults_changed`.
- `GET /admin/accounting/legal-entities/:id/mandate-scheme` → `MandateSchemeUsageView
{ scheme; activeByScheme: { CORE: number; B2B: number }; drafts: number }`.
- `record-mandate-options.ts` : pas de caducité quand le brouillon est B2B.
- `CustomerMandateOptionsEnvelope` (ou la vue enveloppe de `GET /companies/:id/mandate-options`)
  gagne `issuerScheme: SepaScheme | null`.
- Courriel `customer.mandate-to-sign` : `data.scheme` ; titres et pied selon le schéma (CORE :
  pas de consigne de déclaration, pas de « aucun remboursement »).

### 10.5 Lot « écrans » (pablo)

- Admin, `mandate-settings-card` : sélecteur « Schéma du mandat » (`SEPA_SCHEME_LABELS`),
  dialogue de confirmation qui nomme la conséquence (remboursement, déclaration bancaire,
  N brouillons caducs, M actifs gardent leur schéma — lu par `GET …/mandate-scheme`).
- Admin, fiche société / paiement : puce du schéma du mandat (`PaymentMandateView.scheme`).
- Admin, tableau de bord : deux téléchargements (CORE, interentreprises) via `?scheme=`, nom
  de fichier **lu dans `Content-Disposition`** (objection 9).
- Plateforme : fixtures `scheme` ; `mandateNoneBody` selon `issuerScheme`, `mandateAwaitingBody`
  selon `mandate.scheme` (fr/en/it) ; carte des options masquée quand `issuerScheme === 'B2B'`.

## 11. Construit le 2026-09-15 — écarts à trancher

**État : 🟡 construit, non commité à l'écriture de ce paragraphe.** Fondation
(§10.1) puis quatre lots en parallèle ; batterie complète en cours.

Écarts assumés par les lots, **à confirmer par Hugo** :

| #   | Écart                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Lot             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | Une société sans mandat actif n'entre dans **aucun** fichier : elle est nommée dans le bandeau et retire le caractère déposable (`BROUILLON-` dans `MsgId` et le nom du fichier). Avant, elle entrait avec des marqueurs `IBAN-INCONNU` / `MANDAT-INCONNU` qui faisaient échouer le XSD — ce second filet n'existe plus                                                                                                                                                                                                                               | prélèvement     |
| 2   | `DbtrAgt` sans BIC s'écrit `FinInstnId/Othr/Id = NOTPROVIDED` — emplacement non confirmé par le XSD ni par la Caisse d'Épargne                                                                                                                                                                                                                                                                                                                                                                                                                        | prélèvement     |
| 3   | Un fichier de schéma sans ligne garde un bloc créancier (relecture avec la banque) et reste `BROUILLON`                                                                                                                                                                                                                                                                                                                                                                                                                                               | prélèvement     |
| 4   | Mandat B2B : « SIREN du débiteur » sans « (ou IDSP) » ; « PRÉLÈVEMENT » accentué ; champs blancs cernés au lieu des aplats bleus (écriture à la main)                                                                                                                                                                                                                                                                                                                                                                                                 | rendu           |
| 5   | Texte B2B du formulaire aligné sur le gabarit DGFiP (créancier substitué) ; mention RGPD §10.3 — **à relire**                                                                                                                                                                                                                                                                                                                                                                                                                                         | rendu           |
| 6   | Texte CORE du courriel `customer.mandate-to-sign` : droit au remboursement, 8 semaines — **à relire**                                                                                                                                                                                                                                                                                                                                                                                                                                                 | réglage         |
| 7   | `issuerScheme` : un émetteur incomplet ou en double rend `null` (corrigé après le lot, qui rendait 409), et l'écran affiche alors le texte CORE et laisse le bouton des options                                                                                                                                                                                                                                                                                                                                                                       | réglage, écrans |
| 8   | Mon compte lit les options du mandat à **chaque ouverture** (une requête de plus), pour connaître `issuerScheme` avant d'ouvrir le panneau                                                                                                                                                                                                                                                                                                                                                                                                            | écrans          |
| 9   | Une frappe concurrente à la bascule du schéma, lisant l'ancien réglage avant la validation, échapperait à la caducité — fenêtre étroite, non traitée                                                                                                                                                                                                                                                                                                                                                                                                  | réglage         |
| 10  | Les routes sont sous `/admin/accounting/legal-entities/:id/mandate-scheme` (préfixe réel du contrôleur)                                                                                                                                                                                                                                                                                                                                                                                                                                               | réglage         |
| 11  | **Fenêtre de déploiement** (lecteur de migrations, 2026-09-15) : la migration passe avant la bascule du conteneur ; entre les deux, l'API encore en ligne n'écrit ni `scheme` ni `payment_type`, et une frappe échouerait (NOT NULL sans défaut). Côté client, le drapeau `customerMandate` est fermé ; seul le staff peut frapper. Assumé : ne pas frapper de mandat pendant le déploiement, vérifier « Frapper » juste après. L'alternative — garder les défauts et les retirer au déploiement suivant — rouvre l'oubli silencieux de l'objection 5 | migration       |
