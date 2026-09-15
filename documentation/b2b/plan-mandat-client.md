# Le mandat SEPA, côté client — `/mon-compte`

> Écrit le 2026-09-14 à la demande de Hugo. **Soumis à `vitruve`** (argent +
> frontière de sécurité, `CLAUDE.md` §9 bis) avant toute ligne de code.
> Rien de ce qui suit n'est construit.

## 0. La demande

À côté de la carte RIB, une carte **« Générer mon mandat »**. Une fois généré,
le client peut **le voir** et **le télécharger** (deux icônes), lit la consigne
**« renvoyez le mandat daté et signé »**, et dispose d'un bouton **« utiliser la
signature électronique »**.

## 1. Ce qui existe (vérifié le 2026-09-14)

| Geste                                         | Staff                                                                                                         | Client |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| Frapper un mandat (RUM neuve, statut `draft`) | `POST /admin/companies/:id/mandate` — `MintMandateHandler`                                                    | ❌     |
| Lire le mandat courant                        | `GET /admin/companies/:id/mandate` → `MandateSectionView` (+ `publishableKey`)                                | ❌     |
| Aperçu PDF                                    | `GET /admin/companies/:id/mandate/preview.pdf` — **toujours filigrané EXEMPLE**                               | ❌     |
| PDF nominatif (avec RUM)                      | seulement en **pièce jointe** de `POST …/mandate/:mandateId/send` (`buildCustomerMandate`)                    | ❌     |
| Déposer le scan signé                         | `PUT /admin/companies/:id/mandate/proof` (PDF ou image, scellé AES-256-GCM, **ne change pas le statut**)      | ❌     |
| Déclarer signé → **active**                   | `PUT …/mandate/:mandateId/signature` (`signedAt` du papier ; révoque l'ancien actif dans la même transaction) | ❌     |
| Révoquer                                      | `DELETE /admin/companies/:id/mandate`                                                                         | ❌     |
| Signature électronique                        | aucune intégration, aucun prestataire dans le dépôt                                                           | ❌     |

Faits porteurs :

- `MintMandateHandler` **n'exige pas le RIB** — c'est l'impression qui refuse
  sans lui ; un brouillon existant fait refuser en **409** en nommant sa RUM.
  Aucun fait n'est écrit au journal.
- `AdminMandatesController` affirme qu'il n'existe **pas** d'endpoint client
  jumeau, « la clientèle ne saisira jamais ses coordonnées bancaires ». Le
  2026-09-14, le RIB client a été ouvert (`plan-rib-client.md`) : cette phrase
  est désormais fausse et devra être corrigée dans le même lot.
- 🔴 **Bloqueur connu** : `todos/todo-mandat-core-contre-b2b.md` — le lot déclare
  `LclInstrm = B2B`, le formulaire imprimé est un **CORE** (remboursement à 8
  semaines). La Caisse d'Épargne n'a pas répondu. Tout mandat signé avant la
  bascule est à refaire.

## 2. Les décisions proposées

| Sujet                      | Proposition                                                                                                                                                                                                                                                                                                                                                   | Pourquoi                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Qui                        | `owner` et `billing` (comme le RIB) ; non-membre 404, autre rôle 403                                                                                                                                                                                                                                                                                          | Le mandat autorise à débiter le compte que ces rôles gèrent                                                                                 |
| Générer                    | `POST /companies/:id/mandate` → même `MintMandateCommand` ; si un brouillon existe : **pas d'erreur**, on rend le brouillon courant                                                                                                                                                                                                                           | Un client qui recharge ne doit pas buter sur un 409                                                                                         |
| **Pas de mandat sans RIB** | 🔴 **Décidé par Hugo le 2026-09-14** : la frappe exige un RIB enregistré, **pour le staff comme pour le client**. La règle entre dans `MintMandateHandler` (erreur métier 409 nommée, message qui dit d'enregistrer le RIB d'abord), pas dans le seul contrôleur client ; le commentaire du handler « n'exige pas le RIB, l'impression refusera » est corrigé | Un mandat nomme le compte qu'il autorise à débiter : sans compte, il n'autorise rien, et une RUM frappée pour rien est une référence perdue |
| Lire                       | `GET /companies/:id/mandate` → vue client : `reference`, `status`, `last4`, `hasProof`, `acceptedAt` — **sans** `publishableKey`, `bankCode`                                                                                                                                                                                                                  | Le client n'a pas d'IBAN Element                                                                                                            |
| Voir / télécharger         | `GET /companies/:id/mandate/document.pdf[?inline=1]` → `buildCustomerMandate` du mandat **courant** (brouillon ou actif), nominatif, **jamais** un autre mandat                                                                                                                                                                                               | L'aperçu EXEMPLE ne sert à rien au client ; le nominatif est ce qu'on lui envoie déjà par courriel                                          |
| Renvoyer signé             | `PUT /companies/:id/mandate/proof` (multipart, mêmes règles de fichier que le staff) → `AttachMandateProofCommand`, **statut inchangé**                                                                                                                                                                                                                       | Le client prouve ; il ne s'active pas lui-même                                                                                              |
| Activer                    | **reste staff** : le commercial lit la pièce, déclare la date du papier (`PUT …/signature`)                                                                                                                                                                                                                                                                   | Activer = autoriser un débit ; une date déclarée par le débiteur seul n'est pas une preuve relue                                            |
| Prévenir le staff          | une notification staff « mandat signé déposé » (cloche du back-office)                                                                                                                                                                                                                                                                                        | Sans elle, la pièce dort                                                                                                                    |
| Signature électronique     | bouton **visible et désactivé**, libellé « Bientôt disponible »                                                                                                                                                                                                                                                                                               | ⚠️ à trancher par Hugo : un bouton sans action est ce qu'on retire ailleurs                                                                 |
| Bloqueur CORE/B2B          | la carte est derrière un **drapeau d'accès** `customerMandate` (`hidden`/`visible`, défaut **`hidden`**) dans `/admin/feature-access`, ouvert quand la banque a répondu                                                                                                                                                                                       | Ne pas faire signer des centaines de mandats à refaire                                                                                      |
| Journal                    | faits `payment_mandate.minted_by_customer`, `payment_mandate.proof_attached` écrits dans la transaction                                                                                                                                                                                                                                                       | `CLAUDE.md` §0 : un geste client sur un mandat doit laisser une trace                                                                       |

## 3. Les lots

**Lot 0 — le formulaire devient INTERENTREPRISES** (tranché par Hugo le
2026-09-14 ; todo `todos/todo-mandat-core-contre-b2b.md`). Préalable à tout le
reste : aucun client ne doit signer le texte CORE.

- **Une seule source du schéma** : une constante du domaine comptable (ex.
  `SEPA_SCHEME = "B2B"`) lue par le rendu du lot (`pain008.ts`, aujourd'hui
  `LclInstrm` en dur) **et** par le formulaire (`sepa-mandate-pdf.ts`). Un test
  qui échoue si les deux divergent.
- **Le formulaire** : titre « Mandat de prélèvement SEPA **interentreprises** » ;
  retrait du paragraphe de remboursement à 8 semaines ; texte d'autorisation du
  modèle EPC B2B (le débiteur autorise le créancier et sa banque ; mandat
  réservé aux transactions entre entreprises ; **pas de remboursement après
  débit**, mais la banque peut être priée de ne pas débiter avant l'échéance) ;
  la consigne de **déclarer le mandat à sa banque** avant le premier débit. Le
  libellé exact est à confronter au modèle que la banque confirmera — le lot le
  dit, il ne l'invente pas.
- **Le courriel d'envoi** (`customer.mandate-to-sign`) : aligné sur le même
  vocabulaire.
- **Les mandats déjà frappés** : un brouillon imprimé en CORE ne doit pas être
  signé tel quel — l'état de la production est à relever avant (la todo ne l'a
  pas vérifié).
- Tests : le PDF rendu contient « interentreprises » et ne contient plus « 8
  semaines » ; le lot et le formulaire lisent la même valeur.

**Lot A — API** : un nouveau contrôleur client dans `b2b/payments/http/`
(bus seulement), queries/commands « My… » qui murent (port de rôle comme
`BankAccountGuardReader`) puis délèguent ; route PDF nominative ; dépôt de la
preuve ; faits au journal ; notification staff ; clé `customerMandate` au
catalogue d'accès (contrat) ; correction du JSDoc « pas d'endpoint client ».
Tests : unitaires du mur (4 rôles + non-membre), handlers (sans RIB 409 — staff ET client,
brouillon existant rendu, preuve sans mandat 404), e2e sur Postgres (le PDF
porte la RUM et pas « EXEMPLE », la société voisine 404, rôles, drapeau fermé).

**Lot B — app cliente** : section `mandate` (carte bureau, carte mobile,
panneau) à côté du RIB, visible si RIB présent + rôle + drapeau ; états
« aucun mandat » (bouton Générer), « brouillon » (voir, télécharger, consigne,
dépôt du scan, bouton e-signature), « preuve déposée — en vérification »,
« actif · RUM ». Tests par état et par rôle.

## 4. Ce que ce plan ne fait pas

- Pas de signature électronique réelle (prestataire à choisir).
- Pas de révocation par le client.
- Pas de bascule CORE → B2B du formulaire : c'est la todo dédiée.

## 5. Tranché par Hugo le 2026-09-14

1. **Signature électronique** : bouton **visible et désactivé** (« Bientôt
   disponible ») tant qu'aucun prestataire n'est branché.
2. **Drapeau `customerMandate`** : **fermé par défaut**, ouvert en admin quand
   la banque a répondu sur le schéma (bloqueur CORE/B2B).
3. **`billing`** génère et dépose, comme pour le RIB.

## 6. Ce que la contradiction a changé (vitruve, 2026-09-14)

Première passe : 4 BLOQUANT, 6 SÉRIEUX. Réponses — (1) et (3) tranchées par
Hugo, le reste décidé en suivant ce que le back fait déjà.

| #      | Objection                                                                                                                           | Réponse                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 🔴   | Le drapeau ne ferme aucune route (`feature-access.levels.ts` : « masquer n'est pas fermer »)                                        | **Une vraie garde serveur** (Hugo) : un marqueur sur les routes client du mandat, refus 409 nommé drapeau fermé, sur le modèle de `@RequiresShop` / `FeatureAccessGuard`. E2e « drapeau fermé → 409 sur POST, GET PDF, PUT preuve ». La clé `customerMandate` n'est donc PAS une clé masquable : elle a ses propres niveaux (`closed` / `open`), défaut `closed`, et `ALL_VISIBLE` des fixtures n'est pas touché |
| 2 🔴   | Le client peut écraser la preuve d'un mandat actif ou révoqué (`findAwaitingProof` retombe sur `findCurrent`, clé de stockage fixe) | Le dépôt client **ne vise que le brouillon** (`findDraft`, 404 sinon) ; l'agrégat refuse `attachProof` hors `draft` pour le chemin client ; la clé de stockage porte l'identifiant du mandat **et** un horodatage : un dépôt ne recouvre jamais le précédent                                                                                                                                                     |
| 3 🔴   | Le PDF nominatif rend l'IBAN entier (`customer-mandate-support.ts:75-88`)                                                           | **Assumé par Hugo** : un mandat EPC porte l'IBAN du débiteur. L'invariant « l'IBAN ne redescend jamais » du RIB client est **amendé et daté** dans `company-bank-account.controller.ts` et `customer-bank-account-view.ts` (la vue JSON reste `last4`), et `todos/todo-rib-client-transmission.md` gagne la ligne « le PDF du mandat rend l'IBAN à qui porte un jeton owner/billing »                            |
| 4 🔴   | « Brouillon ou actif, nominatif » est faux : la RUM ne s'imprime que pour un `draft`                                                | Le client **ne voit et ne télécharge que le brouillon**. Pour un mandat actif, la carte montre la RUM, la date du papier et « pièce déposée » — pas de PDF recomposé                                                                                                                                                                                                                                             |
| 5      | Pas de mécanisme pour « rendre le brouillon », course → 500 (P2002 non traduit)                                                     | Le handler client lit `findDraft` avant de frapper et, sur violation de `payment_mandates_one_draft_per_company`, relit et rend le brouillon. L'adaptateur traduit P2002 en `MandateDraftAlreadyExistsError` (le staff garde son 409)                                                                                                                                                                            |
| 6      | Le client peut frapper le remplaçant d'un actif ; l'activation ne lit pas la preuve                                                 | Frappe client **refusée 409 quand un mandat est actif** (le remplacement reste staff, comme l'écran staff le fait déjà). `SignMandateHandler` **exige une preuve sur CE mandat** avant d'activer — staff compris                                                                                                                                                                                                 |
| 7      | Le mandat ne fige aucun compte ; un RIB remplacé fait diverger papier et débit                                                      | Suivant le back, qui calcule le signal « compte changé » et l'ignore délibérément en attendant la banque : **pas de gel du compte dans ce lot**. Mais côté client, **remplacer le RIB est refusé 409 tant qu'un mandat est `draft` avec preuve ou `active`** — le changement de banque passe par le staff, comme le remplacement de mandat. Le trou staff reste écrit dans la todo mandat                        |
| 8      | La règle « pas de mandat sans RIB » casse l'écran staff et 3 justifications                                                         | L'écran staff masque « Frapper » sans RIB et dit pourquoi ; les trois commentaires (`mint-mandate.handler.ts:40-45`, `payment-mandate.ts:106-108`, `paiement-section.html:94-96`) sont corrigés ; le spec du handler est refait ; ordre des gardes : société → **RIB** → émetteur → brouillon ; les brouillons déjà frappés sans RIB restent (la règle ne vise que la frappe)                                    |
| 9      | Journal promis sans mécanisme ; l'activation n'en écrit pas                                                                         | Faits `payment_mandate.minted`, `payment_mandate.proof_attached`, `payment_mandate.signed` pour staff ET client, suivant `account-facts.ts` : acte du staff dans la transaction, fait du client best-effort ; dépôt de preuve `@hors-transaction` comme le KBIS                                                                                                                                                  |
| 10     | Deux justifications périmées (aperçu « toujours EXEMPLE »)                                                                          | Corrigées : `admin-company-bank-account.controller.ts:123-131`, `comptabilite/prelevement-sepa.md:39` ; passage d'`auditeur-de-justifications` en fin de lot                                                                                                                                                                                                                                                     |
| MINEUR | Cloche, états oubliés, nommage                                                                                                      | Notification staff avec clé d'anti-doublon par mandat et échec non bloquant ; la carte gère `pending`, `failed`, `revoked`, `expired` (« aucun mandat en cours ») ; noms sans suffixe client                                                                                                                                                                                                                     |

## 7. Seconde contradiction (vitruve, 2026-09-14) — et le contrat B2B est signé

**Fait nouveau, dit par Hugo le 2026-09-14 : le contrat SDD interentreprises
avec la Caisse d'Épargne est signé.** Le Lot 0 part donc **maintenant**, sans
attendre de réponse ; les phrases « la banque n'a pas répondu » (§1), « ouvert
quand la banque a répondu » (§5.2) et « pas de bascule du formulaire » (§4) sont
**caduques** et remplacées par ce qui suit. Pas de requête sur la production
pour l'instant (Hugo) : le mécanisme doit donc être juste **quel que soit**
l'état des mandats existants.

| #      | Objection                                                                                       | Réponse                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 🔴   | Un brouillon CORE réimprimé en B2B sous la même RUM                                             | **Le schéma devient une propriété du MANDAT**, figée à la frappe : colonne `scheme` (`CORE` / `B2B`), migration **additive**, lignes existantes à `CORE`, nouvelles frappes à `B2B`. Le PDF se rend avec le schéma **du mandat**, jamais avec une constante globale : un brouillon CORE se réimprime en CORE, à l'identique. La constante unique devient « le schéma des NOUVELLES frappes ». `lecteur-de-migrations` sur la migration |
| 2 🔴   | Des actifs CORE partiraient dans un lot B2B                                                     | Le lecteur du lot (`prisma-debtor-mandate.reader.ts`) **filtre `scheme = B2B`** : un mandat CORE n'est plus prélevé par le lot interentreprises. Il reste actif et visible, marqué « à re-signer en interentreprises » à l'écran staff. Test : un actif CORE n'entre pas dans le lot                                                                                                                                                   |
| 3 🔴   | Le plan ne dit pas quand le Lot 0 part                                                          | **Maintenant** (contrat signé). Le drapeau `customerMandate` ne dépend plus de la banque : il s'ouvre quand les lots 0, A et B sont en production et vérifiés                                                                                                                                                                                                                                                                          |
| 4      | Le verrou du RIB part trop tard                                                                 | Abandon du verrou : **le mandat fige son compte à la frappe** (IBAN scellé comme sur le RIB, `last4`, BIC, titulaire). Le PDF et le lot lisent le compte **du mandat**, pas le RIB courant. Un RIB remplacé après la frappe rend le brouillon **caduc** (révoqué, notification staff) ; un actif garde son compte jusqu'à un nouveau mandat. Le client n'est jamais bloqué : il change son RIB, et régénère                            |
| 5      | L'agrégat ne connaît pas « le chemin client » ; versions orphelines                             | `attachProof` refuse hors `draft` **dans l'agrégat**, staff compris ; la reprise d'un actif sans preuve reste possible par une méthode nommée `attachLegacyProof` réservée au staff. Stockage : **une preuve par mandat**, un nouveau dépôt sur un brouillon remplace la précédente **et le fait est journalisé** (pas d'archive promise)                                                                                              |
| 6      | Le staff ne voit pas la preuve du mandat qu'il active                                           | `GetMandateProof` prend l'identifiant du mandat ; l'écran staff montre la pièce du brouillon à activer et masque « Activer » sans `hasProof`. Spec `sign-mandate.handler.spec.ts` refaite                                                                                                                                                                                                                                              |
| 7      | Journal best-effort réservé aux faits d'entonnoir                                               | Frappe, dépôt de preuve, activation, caducité : faits écrits **dans la transaction** de l'écriture, client comme staff                                                                                                                                                                                                                                                                                                                 |
| 8      | La garde n'existe pas en réutilisable ; les exemptions ouvrent tout                             | Généraliser `FeatureAccessGuard` en `@RequiresFeature(key, level)` (`@RequiresShop` devient un alias), erreur par clé ; étendre `FEATURE_KEYS`, `LEVEL_LABELS`, le repli du front. **Les exemptions ne s'appliquent pas à `customerMandate`** (catalogue : `exemptible: false`)                                                                                                                                                        |
| 9      | Le test laisse passer un texte à moitié CORE                                                    | Le test fige le **texte d'autorisation complet** de chaque schéma (instantané par schéma), et vérifie l'absence des lignes « 8 semaines » **et** « 13 mois » en B2B                                                                                                                                                                                                                                                                    |
| 10     | Le type de paiement diverge (ponctuel au formulaire, RCUR au lot)                               | Le type de paiement suit la même règle que le schéma : propriété du mandat (`recurring` pour toute frappe), lue par le formulaire et le lot                                                                                                                                                                                                                                                                                            |
| MINEUR | P2002 sans RUM, port manquant, titre d'exemple, courriel déjà B2B, hidden/closed, 409 avant 404 | P2002 → relecture du brouillon pour nommer la RUM ; `MintMandateHandler` reçoit le port du RIB ; le titre de l'exemplaire suit le schéma ; le courriel est laissé tel quel ; niveaux `closed/open` partout ; la garde du drapeau passe **après** le mur tenant pour ne pas révéler l'existence d'une société (ordre testé)                                                                                                             |

## 8. Version simple — retenue par Hugo le 2026-09-14

> 🔄 **Revu le 2026-09-15** : « pas de colonne `scheme` » ne tient plus. Hugo veut
> les deux schémas au choix de l'entité, et le mandat fige désormais son schéma
> et son type de paiement — voir [`plan-mandat-deux-schemas.md`](plan-mandat-deux-schemas.md).

**Fait qui décide : il n'y a aucun mandat en production** (dit par Hugo le
2026-09-14). La troisième contradiction de vitruve (5 BLOQUANT) portait
entièrement sur la cohabitation avec des mandats existants ; sans eux, elle
tombe. **Le §7 est abandonné** ; ce qui suit le remplace là où ils divergent.

**Ce qu'on NE fait pas** : pas de colonne `scheme`, pas de lecteur filtré, pas de
compte figé sur le mandat, pas de caducité automatique, pas de `attachLegacyProof`.

**Lot 0 — bascule globale en INTERENTREPRISES.**

- Le schéma et le type de paiement restent des réglages **globaux** : `pain008.ts`
  et `sepa-mandate-pdf.ts` lisent **une même constante** du domaine comptable
  (`LclInstrm B2B`) ; le type de paiement reste le réglage existant de l'entité
  émettrice (`LegalEntity.mandatePaymentType`), et le lot cesse d'écrire `RCUR` en
  dur s'il diverge — sinon on le dit.
- Le formulaire : titre « interentreprises », retrait **complet** du paragraphe
  CORE (lignes « 8 semaines » **et** « 13 mois »), texte d'autorisation EPC B2B,
  consigne de déclarer le mandat à sa banque ; le titre de l'exemplaire
  non émis suit.
- Tests : instantané du texte d'autorisation B2B ; absence des deux lignes CORE ;
  le lot et le formulaire lisent la même valeur.

**Lot A — API client** (inchangé du §6 sauf ceci) :

- **Drapeau contrôlé dans les handlers**, juste après le mur tenant (404 non-membre
  avant 409 drapeau fermé) — pas de garde globale. Clé `customerMandate`
  (`closed`/`open`, défaut `closed`) **non exemptible** : le résolveur ignore les
  exemptions pour cette clé, `AddFeatureExemptionHandler` la refuse, les listes
  tenues à la main sont étendues (`FEATURE_KEYS`, `LEVEL_LABELS`, handlers de
  lecture des niveaux, test des contrats, repli du front).
- **Pas de mandat sans RIB**, staff et client (ordre : société → RIB → émetteur →
  brouillon) ; l'écran staff masque « Frapper » sans RIB.
- Frappe client refusée si un mandat est **actif** ; brouillon existant **rendu**
  (P2002 traduit en relisant le brouillon).
- PDF client : **brouillon seulement** ; l'IBAN entier y figure (assumé, invariant
  du RIB amendé et daté).
- Preuve : dépôt client **sur le brouillon seulement**, **refus hors `draft` dans
  l'agrégat** ; un nouveau dépôt remplace la pièce et le fait est écrit.
- **Tant qu'un brouillon existe, remplacer le RIB (staff ou client) le révoque**
  dans la même unité de travail, fait au journal, notification staff — le papier
  ne peut pas nommer un compte qui n'est plus le RIB. Pour un actif : le RIB
  client est **refusé 409** (changement de banque = staff).
- Activation : **exige une preuve sur ce mandat** ; `GetMandateProof` par
  identifiant ; écran staff : pièce du brouillon, « Activer » masqué sans preuve.
- Journal **dans la transaction** : frappe, preuve, activation, révocation par
  RIB. Le dépôt de pièce écrit l'objet avant la transaction (`@hors-transaction`,
  comme le KBIS) : si la transaction échoue, la pièce déposée est orpheline — dit
  et accepté, pas de promesse d'archive.

**Lot B — app cliente** : inchangé (§3), états `draft` / preuve déposée /
`active` / aucun mandat en cours (`revoked`, `failed`, `expired`, `pending`).

## 9. Dernière contradiction (vitruve, 2026-09-14) — tranchée

Ce qui suit **complète le §8** et fait foi pour les batisseurs.

**Déjà fait** — commit `5a7c98fd` : `attachProof` refusé hors `draft` dans
l'agrégat, dépôt staff sur `findDraft` refusé **avant** de ranger, clé de
stockage neuve par dépôt (plus d'écrasement silencieux), activation qui exige
le scan, écran staff aligné (dépôt sur brouillon, « Activer » inerte sans
pièce). Les e2e et specs cassés par cette règle sont réécrits. **Ne pas refaire.**

| #   | Objection                                                                                            | Tranché                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Clé `customerMandate` : `FeatureLevelsView` est mappé sur `FeatureKey`, les `toEqual` exacts cassent | Le lot étend **toutes** les listes : `feature-access.e2e-spec.ts`, `contracts/src/__tests__/feature-access.spec.ts`, `feature-access.fixture.ts` (plateforme), `feature-access-labels.ts` (admin), repli du front (`ClientFeatureAccess`). Niveaux propres `closed`/`open`, défaut `closed`                                |
| 2   | Le résolveur exige un `FeatureSubject` que les handlers n'ont pas                                    | Une méthode **sans sujet** pour une clé non exemptible, nommée. `resolveFeatureLevel`, le tableau admin des exemptions et `AddFeatureExemptionHandler` ignorent/refusent `customerMandate`                                                                                                                                 |
| 3   | Journal : aucun handler de `payments` n'injecte `Journal`                                            | Suivre un handler existant qui écrit un fait dans la transaction de son écriture (le citer dans le rapport). Faits : frappe (staff/client), dépôt de scan (staff/client), activation, révocation par changement de RIB. Si le mécanisme demande plus que l'injection de `Journal` + `UnitOfWork`, **s'arrêter et le dire** |
| 4   | Ce qui déclenche la révocation du brouillon                                                          | **Toute** écriture du RIB (IBAN, BIC, titulaire, adresse) ou des options du mandat (zones 14/19) tant qu'un brouillon existe : tout est imprimé sur le papier. La fonction partagée `recordCompanyBankAccount` prend les ports nécessaires ; la notification staff reste hors transaction                                  |
| 5   | RIB d'un **actif** changé par le staff : aucun mécanisme                                             | **Hors lot**, entrée datée dans `todos/todo-mandat-core-contre-b2b.md` (aucun actif en production ; l'écran staff avertit déjà sur un autre compte). Côté client : refus 409, §8                                                                                                                                           |
| 6   | `RCUR` en dur contre `one_off` proposé en admin                                                      | **Tranché par Hugo le 2026-09-14 : le lot SUIT le réglage** (`OOFF` si `one_off`, `RCUR` sinon), le choix ponctuel reste proposé en admin. Bâti au Lot 0. Trou écrit dans la todo : le mandat ne mémorise pas le type imprimé                                                                                              |
| 7   | « 13 mois » retiré sans source                                                                       | Retiré avec le paragraphe CORE (§8), **et** noté « à confirmer avec la banque » dans la todo, avec la raison : ce délai vise les opérations non autorisées, pas le remboursement                                                                                                                                           |
| 8   | `MintMandateHandler` sans port RIB                                                                   | Il en reçoit un ; sa spec est refaite                                                                                                                                                                                                                                                                                      |
| 9   | Justifications à réécrire                                                                            | `pain008.ts` (en-tête `LclInstrm`) et `sepa-mandate-pdf.ts` (en-tête) au Lot 0                                                                                                                                                                                                                                             |

**Découpage de construction.** Lot 0 et Lot A en parallèle (fichiers
disjoints ; **seul le Lot A lance les e2e**, la base de test ne se partage pas).
Lot B après le Lot A, sur les contrats qu'il aura posés.

**Contrat client posé par le Lot A** (pour le Lot B) : `CustomerMandateView`
(`id`, `reference`, `status`, `hasProof`, `proofFileName`, `acceptedAt`) dans
`packages/contracts` ; routes `GET /companies/:companyId/mandate` (vue ou
`null`), `POST /companies/:companyId/mandate` (frappe ou brouillon existant,
rend la vue), `GET /companies/:companyId/mandate/document.pdf[?inline=1]`
(brouillon seulement), `PUT /companies/:companyId/mandate/proof` (multipart
`file`). Ordre des refus : non-membre 404 → rôle 403 → drapeau fermé 409 →
règle métier.

## 10. Le client règle les zones 14 et 19 — décidé par Hugo le 2026-09-14

Jusque-là, `debtorReference` (zone 14) et `contractNumber` (zone 19) étaient
des réglages du staff (`PUT /admin/companies/:companyId/mandate-options`). Le
client les règle désormais lui-même, depuis `/mon-compte`.

**Contrat** (`packages/contracts`, `company-bank-account.ts`) :

- `CustomerMandateOptionsView = Pick<CompanyBankAccountView, "debtorReference" | "contractNumber">` ;
- `CustomerMandateOptionsSectionView { options: CustomerMandateOptionsView | null }`,
  `null` tant qu'aucun RIB n'est déposé ;
- `GET /companies/:companyId/mandate-options` → la section ;
- `PUT /companies/:companyId/mandate-options`, corps `SetMandateOptionsPayload`
  (celui du staff), réponse **204**.

`CustomerBankAccountView` ne change pas : les zones n'y entrent pas, elles ont
leur propre lecture, pour la même raison que la route staff (le `PUT` du RIB
exige l'IBAN).

**Ordre des refus** : non-membre 404 → rôle ni détenteur ni facturation 403 →
drapeau `customerMandate` fermé 409 → sans RIB 404 → **sous un mandat actif
409** (`MandateOptionsBoundToActiveMandateError`). Les zones sont imprimées sur
un papier déjà signé : le changement de papier passe par le staff, comme le RIB
client (§8). Le staff, lui, n'a pas ce refus.

**Écriture** : une seule séquence, `recordMandateOptions`, partagée par les
deux handlers — RIB requis, `setOptions`, brouillon révoqué dans l'unité de
travail (fait `payment_mandate.draft_voided`, cause `mandate_options_changed`),
cloche du staff hors transaction.

**Journal — les deux trous nommés ici sont fermés (2026-09-14).** Cette
section disait que `draft_voided` ne portait pas `via`, et qu'aucune réécriture
des zones n'était journalisée sans brouillon. Tranché par Hugo et bâti le même
jour :

- **toute** réécriture des zones 14/19, staff comme client, écrit
  `payment_mandate.options_changed` dans la transaction de l'écriture, brouillon
  ou pas. Sujet : le RIB (`company_bank_account`, son identifiant) — les zones
  vivent sur sa ligne et il n'existe souvent aucun mandat. Charge : `companyId`,
  `debtorReference`, `contractNumber` (valeurs normalisées) et `via`. Rien
  n'est écrit sur un refus ;
- `payment_mandate.draft_voided` porte `via` (`staff` / `customer`), pour ses
  quatre déclencheurs : RIB staff, RIB client, zones staff, zones client ;
- sans RIB, l'écriture des zones lève `MandateOptionsWithoutBankAccountError`
  (404, même code `payments.bank_account.missing`) : le message de
  `CompanyBankAccountNotFoundError` parlait de « prévisualiser » à des
  appelants qui ne prévisualisaient rien.
