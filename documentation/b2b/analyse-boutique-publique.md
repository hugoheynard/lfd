# Analyse — la boutique publique dans la boutique pro

> **Ouverte le 2026-09-15** à la demande de Hugo. 📐 Analyse, rien n'est bâti.
> Décrit l'existant tel que lu ce jour-là, le travail à faire, et les décisions
> à prendre avant d'écrire un plan. **Contredite par `vitruve` le même jour** :
> ses objections sont intégrées, et leur sort est au §8.

## 0. La demande

> « ma boutique b2c sera la même que la pro, beaucoup d'avantages mais aussi une
> distinction à faire : le compte public n'a qu'un profil et son tarif public,
> le flow de commande est le même, pas de factures, il retire avec un QR comme
> les pros ; au niveau du retrait boutique on ne touche à rien au niveau de la
> file, on met juste un badge pro ou public sur la ligne de la table » — Hugo,
> 2026-09-15.

## 1. En une page

**Une partie du chemin existe déjà.** Le pivot « zéro friction » du 2026-08-06
a rendu la commande possible **sans société** : un compte sans rattachement
commande, paie par carte, retire avec son QR, et le cycle de prélèvement
l'ignore. Pour le code, un particulier est « un client qui n'a pas de société ».

**Ce qui manque tient en quatre sujets :**

| Sujet                                                        | Poids    | Pourquoi                                                                                                                                                                                            |
| ------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Le tarif public** n'arrive pas à la boutique               | 🔴 lourd | Le référentiel saisit le TTC public, mais **seul le HT pro traverse la frontière**. Aujourd'hui un compte sans société voit et paie **le prix pro**.                                                |
| **Un prix TTC dans une chaîne HT**                           | 🔴 lourd | Toute la commande — remise de retrait, frais, TVA, devis, facturation, croissance — est calculée et stockée en HT. Un prix d'étiquette TTC ne s'y glisse pas sans décider qui calcule quoi (§3.2).  |
| **Pro ou public** n'est écrit nulle part, et se résout mal   | 🟠 moyen | L'audience se déduit de l'absence de société ; une personne rattachée à **plusieurs** sociétés commande déjà sans société, faute de sélecteur d'espace (§4).                                        |
| **L'accueil du public** (inscription, Mon compte, documents) | 🟡 moyen | L'inscription publique perd le profil en production, le bon de commande et le courriel sont en HT, « Mes factures » est visible, la croissance compterait les particuliers comme des acheteurs pro. |

Le badge du comptoir est effectivement petit — une fois l'audience figée sur la
commande.

🔴 **Une contradiction à trancher d'abord** : `architecture-facturation.md`
décide « **une facture pour toute vente** (carte ET terme) » (l. 17) ; la
demande dit « pas de factures » pour le public (§6, D0).

## 2. L'existant (lu et vérifié le 2026-09-15)

### 2.1 Identité

| Fait                                                                                                                                                                                  | Où                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `User` ne porte aucune société ; `Membership` relie 0..N personnes à 0..N sociétés                                                                                                    | `apps/lfd-api/prisma/schema/public/account.prisma`                                |
| Au premier appel authentifié d'un inconnu, le serveur crée un `User` **actif sans société**                                                                                           | `b2b/account/infrastructure/customer-principal.resolver.ts`                       |
| Le rattachement chargé ne porte que `{ companyId, role }` — **pas le statut de la société**                                                                                           | `customer-principal.resolver.ts:122`                                              |
| Société agissante : aucun rattachement → `null` ; un seul → celui-là ; **plusieurs sans en-tête `x-lfc-company` → `null`**                                                            | `platform/auth/resolve-company.ts`                                                |
| **Aucun front n'envoie `x-lfc-company`** et aucun écran client ne lit les rattachements : une personne à plusieurs sociétés agit toujours « sans société »                            | grep sur `apps/*-frontend` et `packages` : vide (vérifié le 2026-09-15)           |
| `POST /orders` prend la société par `@ActingCompany()`, donc par ce même repli                                                                                                        | `b2b/orders/http/orders.controller.ts:73`                                         |
| Portes d'entrée : `/bienvenue` (trois champs, passkey) et `/ouverture-compte-pro` (déclare une société `pending`) ; l'index signale que `/bienvenue` **perd le profil en production** | `apps/lfc-B2B-platform-frontend/src/app/app.routes.ts`, `documentation/README.md` |
| Mon compte sans société : seule la carte « Compléter mon dossier » s'affiche                                                                                                          | `client/mon-compte/compte-page/compte-page.html`                                  |
| L'accès à la boutique est un flag **global** `shop` (`closed` / `browse` / `order`)                                                                                                   | `b2b/feature-access/`                                                             |
| La saisie de commande par le staff **exige une société** : une commande publique au téléphone n'existe pas                                                                            | `b2b/orders/application/commands/place-order-for-customer.handler.ts:62-66`       |

### 2.2 Commande, règlement, facturation

| Fait                                                                                                                                                                              | Où                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Order.companyId` est **nullable** ; sans société, le mur est `placed_by_user_id`                                                                                                 | `prisma/schema/public/orders.prisma:59-63`, `b2b/orders/domain/services/order-access.ts`               |
| Sans société (ou société non active, ou sans crédit), **carte obligatoire**                                                                                                       | `place-order.handler.ts` (`requiresCard`, `maySettleOnAccount`)                                        |
| Montants stockés **HT** : `unitPriceMillicents`, `lineTotalCents`, `subtotalCents` ; la TVA est ventilée par taux par `ventilateVat` de `@lfd/money`, qui **n'accepte que du HT** | `orders.prisma` (commentaire des montants), `packages/money/src/vat.ts`                                |
| La **remise du point de retrait** se calcule sur le sous-total **HT**, et l'agrégat la revérifie contre lui                                                                       | `b2b/orders/application/services/cart-adjustments.service.ts:84`, `order.ts` (`ensureDiscountMatches`) |
| Le **devis** calcule ses totaux de son côté par `ventilateVat` ; une e2e tient la parité devis / commande                                                                         | `quote-shop-cart.handler.ts`, `test/quote-order-parity.e2e-spec.ts`                                    |
| Un **cycle de prélèvement** est codé ; son assiette exclut déjà `companyId = null`                                                                                                | `b2b/accounting/infrastructure/prisma-billable-orders.reader.ts:47-56`                                 |
| La facture elle-même n'est pas codée ; sa doc décide « une facture pour toute vente »                                                                                             | `documentation/b2b/architecture-facturation.md:17`                                                     |
| Le bon PDF porte « PU HT / Total HT » ; il est archivé à sa **première lecture**                                                                                                  | `b2b/orders/domain/services/order-sheet-pdf.ts:333-334`, `get-order-sheet-pdf.handler.ts:86`           |
| Le courriel de commande existe                                                                                                                                                    | `send-order-placed-mail.handler.ts`                                                                    |
| Les alertes ignorent déjà les commandes sans société                                                                                                                              | `evaluate-order-alerts.service.ts:35`                                                                  |
| La croissance compte les acheteurs `user:` dans la concentration, et **toutes** les commandes dans le chiffre d'affaires                                                          | `prisma-order-metrics.reader.ts:55`                                                                    |

### 2.3 Prix

| Fait                                                                                                                                                                                | Où                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Un seul prix saisi : le **TTC public**. TTC pro = public × rapport (`ratioBp` ≤ 10 000) ; le HT B2B se déduit du TTC pro et du taux `b2b`                                           | `documentation/pricing/architecture-prix-ancre-ttc.md` §A.2, `packages/pim-contracts/src/accounting-rules.ts` (`proPriceOf`) |
| La projection ne pousse que ce HT pro, dans le champ de fil `priceMillicents` ; snapshot en **version 8** (versions acceptées 5 à 8)                                                | `pim/channels/b2b-platform/products/projection.ts`, `packages/catalog-sync/src/snapshot.ts:24,135,355`                       |
| Trois contextes : `takeaway`, `eatIn`, `b2b` ; le taux se pose par famille et **déroge par fiche, contexte par contexte**                                                           | `documentation/pim/contextes-et-points-de-vente.md` §2-3                                                                     |
| `resolvePrice` est **HT de bout en bout** ; trois portes le tiennent : `lint:price-pipeline`, `lint:catalogue-authority`, `lint:price-door`                                         | `b2b/pricing/domain/resolve-price.ts`, `CLAUDE.md` §0                                                                        |
| Le mot **audience** est déjà pris par les règles de prix : `PriceAudience = all                                                                                                     | segment                                                                                                                      | company`; une promotion`all` touche pros et public | `b2b/pricing/domain/price-rule.ts:42`, `specificity.ts:32` |
| La vitrine anonyme (`GET /shop/catalogue`) et le devis (`POST /shop/quote`) sont `@Public()` ; leur contrat nomme ses montants HT (`subtotalHtCents`, `unitPriceMillicents` « HT ») | `shop-catalogue.controller.ts:39`, `shop-quote.controller.ts:47`, `packages/contracts/src/shop-quote.ts:94-122`              |

🔴 Si la boutique ouvrait demain au public, un particulier paierait le prix
pro, au taux de TVA B2B.

### 2.4 Retrait et production

| Fait                                                                                          | Où                                                                                                |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Le jeton de retrait est émis à la passation pour toute commande ; l'écran client du QR existe | `prisma-order.repository.ts`, `client/mes-commandes/retrait-page/`                                |
| La ligne de file porte `customerLabel` et `tradeName`, **ni société ni audience**             | `handover/channels/commerce/handover-queue.reader.ts`, `packages/contracts/src/order-handover.ts` |
| Son adaptateur et sa projection                                                               | `b2b/orders/infrastructure/prisma-handover-queue.reader.ts`, `handover-order.query.ts:158`        |
| La fiche atelier ne porte ni société ni audience                                              | `apps/lfd-api/prisma/schema/production.prisma`                                                    |

## 3. Le tarif public

### 3.1 Ce qu'il faut faire traverser

Le TTC public et le taux de la vente publique, par déclinaison :

1. **Snapshot en version 9** (`catalog-sync`), champs **ajoutés** — la
   plateforme continue d'accepter les versions antérieures.
2. **Projection** : un article sans taux public est écarté du rayon public
   seulement, avec sa raison ; jamais de taux inventé.
3. **Miroir** : colonnes neuves, migration additive. Vides, l'article n'est pas
   vendable au public — pas de repli sur le prix pro.
4. **Le taux** est une **qualification fiscale**, pas un choix de conception
   (taux « à emporter » pour une commande passée la veille et retirée) : à
   faire valider (§5.5). L'index du référentiel signale que la plupart des
   familles n'ont pas encore de taux posé : le rayon public serait vide tant
   qu'elles ne le sont pas.

### 3.2 Le point dur : un prix d'étiquette TTC dans une chaîne HT

Pour un pro, tout est juste en HT. Pour le public, **le prix décidé est le TTC
d'étiquette**. Trois faits empêchent de le traiter comme un simple autre prix :

- **La remise de retrait est HT**, calculée sur le sous-total HT et répartie par
  taux dans `ventilateVat`. Tant qu'un point de retrait porte une remise, le
  total d'une commande publique ne peut pas être « la somme des étiquettes ».
- **Le devis et la commande doivent rester identiques** au centime ; ils
  calculent chacun de leur côté, et une e2e tient la parité.
- **Les colonnes HT sont lues ailleurs** : cycle de prélèvement, croissance, bon
  de commande.

Ce que le plan devra trancher, et où :

| Question                                                  | Contrainte                                                                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Le public a-t-il la remise de retrait ? En TTC ou en HT ? | si oui, le total cesse d'être la somme des étiquettes ; il faut dire comment on l'affiche                              |
| Où vit le calcul TTC-d'abord ?                            | dans **`@lfd/money`**, à côté de `ventilateVat`, pour que le devis et la commande le partagent — pas dans `Order` seul |
| Que stocke une commande publique dans les colonnes HT ?   | un HT **déduit** du TTC, arrondi à un endroit nommé ; ou des colonnes TTC neuves                                       |
| Par quelle porte sort un prix public ?                    | la même que le prix pro (`Pricer` → `resolvePrice`), sous les trois portes — qui résout alors en TTC ou en HT ?        |

L'option « aller-retour HT assez fin » reste écartée : c'est une propriété
empirique qu'un prix saisi demain peut casser sans que rien ne le refuse.

### 3.3 Les étages de résolution

| Étage      | Pro | Public                                                                                                                                                                                                            |
| ---------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mercuriale | oui | non                                                                                                                                                                                                               |
| volume     | oui | à décider                                                                                                                                                                                                         |
| promotion  | oui | une promotion `all` s'applique **déjà** aux deux. Une promotion propre au public demande un nouveau type d'`PriceAudience` (rang de spécificité, chevauchements, fenêtre datée)                                   |
| geste      | oui | pas de saisie staff publique aujourd'hui (§2.1)                                                                                                                                                                   |
| plancher   | oui | **pas garanti par construction** : HT public < HT pro dès que (1 + t_b2b) / (1 + t_public) < rapport. Ex. rapport 90 %, b2b 5,5 %, public 20 % → 0,879. Le plancher est HT ; sa règle pour le public est à écrire |

## 4. Pro ou public, figé sur la commande

### 4.1 Pourquoi `companyId = null` ne suffit plus

- Une commande sans société est aujourd'hui aussi celle d'une **personne
  rattachée à plusieurs sociétés** (aucun front n'envoie l'en-tête) et celle
  d'un pro qui a commandé avant de déclarer sa société.
- **Toutes les commandes passées ont été payées au prix pro.** Aucune n'est
  « publique » au sens du nouveau tarif.

### 4.2 Ce qu'il faut

1. **Un sélecteur d'espace** côté front qui envoie `x-lfc-company`, **avant**
   tout refus de commande ambiguë. Sans lui, refuser bloquerait en production
   toute personne rattachée à plusieurs sociétés.
2. **Puis** refuser la commande d'une personne à plusieurs rattachements qui ne
   déclare pas son espace (409, message qui dit de choisir).
3. **Une colonne de clientèle figée à la passation**, écrite par l'agrégat.
   Nom à choisir pour **ne pas** entrer en collision avec `PriceAudience`
   (ex. `Order.clientele`). **Nullable** : `NULL` = « commande d'avant la
   distinction », comme `catalogVersionId` ou `vatShares` ; **aucun rattrapage**
   des commandes antérieures — ce serait fabriquer une affirmation.
4. **Trois déploiements** (§0 de `CLAUDE.md`) : étendre (colonne nullable,
   écrite par le nouveau code), basculer (les lecteurs la lisent), resserrer
   seulement si un jour on sait quoi dire de `NULL`.

### 4.3 Qui est public ? (D1)

Proposition : **aucun rattachement**. Mais un rattachement à une société
**`pending`** donne aujourd'hui le contexte pro, sans vérification : après le
pivot, le lien « Vous êtes un professionnel ? » ferait basculer un particulier
au prix pro d'un seul geste. Le plan doit dire si `pending` vaut pro — ce qui
touche le résolveur de principal, donc une frontière d'argent et de sécurité.

## 5. Le reste, surface par surface

### 5.1 Retrait

- Porter la clientèle dans `HandoverQueueEntry`
  (`handover/channels/commerce/handover-queue.reader.ts`), lue par
  `prisma-handover-queue.reader.ts` / `handover-order.query.ts`.
- L'ajouter à `HandoverQueueEntryView` (champ neuf).
- Badge « Pro » / « Public » sur la ligne de l'écran comptoir. File, ordre,
  scan, attestation : inchangés. Une commande `NULL` (d'avant) n'a pas de badge.

### 5.2 Inscription et Mon compte

- Corriger d'abord la perte du profil sur `/bienvenue`.
- Mon compte public : Profil, commandes, QR. Rien de ce qui concerne une
  société. « Vous êtes un professionnel ? » → porte pro (sous réserve de D1).
- Masquer « Mes factures ».
- Flag `shop` global : un flag par audience si les ouvertures diffèrent (D6).

### 5.3 Commande, documents, facturation

- **Acheminement** : retrait seul en v1 ? (D5)
- **Règlement** : carte, déjà obligatoire. Rien à faire.
- **Bon de commande et courriel de commande** : en HT aujourd'hui ; version TTC
  pour le public, ou aucun document (D7).
- **Cycle de prélèvement** : exclut déjà `companyId = null` ; à reformuler sur
  la clientèle quand elle existera.
- **Facture** : contradiction D0.
- **Rapatriement** (TODO) : ne vise jamais une commande publique.

### 5.4 Back-office et chiffres

- Liste des commandes admin : badge et filtre.
- Comptes publics : pas d'écran en v1 ? (D8)
- **Croissance** : exclure ou segmenter le public **dès la première commande
  publique** (concentration, CA) — pas après l'ouverture.

### 5.5 Juridique et fiscal — à faire valider, hors dépôt

- le **taux de TVA** d'une vente en ligne retirée ou livrée ;
- CGV consommateur ; affichage TTC ; droit de rétractation et son exception
  éventuelle pour les denrées périssables ;
- ce qui remplace la facture, s'il n'y en a pas (D0) ; information RGPD.

### 5.6 Shopify

Le référentiel pousse le TTC public vers Shopify. Non vérifié : quel taux la
projection Shopify applique. Remplacé ou conservé ? (D9)

## 6. Décisions à prendre avant le plan

| #       | Question                                                                              | Proposition                                                             |
| ------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **D0**  | Le public reçoit-il une facture ? (`architecture-facturation.md` dit « toute vente ») | à trancher par Hugo, avec le comptable                                  |
| **D1**  | Qui est public ? Un rattachement `pending` vaut-il pro ?                              | public = aucun rattachement ; `pending` = **public** jusqu'à activation |
| **D2**  | La remise de retrait s'applique-t-elle au public ?                                    | non en v1 — le total reste la somme des étiquettes                      |
| **D3**  | Où vit le calcul TTC d'abord, et que stocke une commande publique ?                   | `@lfd/money`, partagé devis / commande ; HT déduit, arrondi nommé       |
| **D4**  | Volume, promotions propres, gestes pour le public ?                                   | aucun en v1 ; promotions `all` seulement                                |
| **D5**  | Livraison pour le public ?                                                            | retrait seul en v1                                                      |
| **D6**  | Ouvrir aux deux audiences en même temps ?                                             | un flag par audience                                                    |
| **D7**  | Quel document pour une commande publique ?                                            | récapitulatif TTC, bon et courriel                                      |
| **D8**  | Un écran « comptes publics » ?                                                        | non en v1                                                               |
| **D9**  | Shopify : remplacé ou conservé ?                                                      | à trancher par Hugo                                                     |
| **D10** | Que voit la vitrine anonyme : prix public ou pro ?                                    | public ; le pro voit son prix une fois connecté                         |

> ⚠️ **D2 et D5 ne sont plus des règles de code (2026-09-15).** Ce sont des
> **réglages** du back-office : la remise d'un point porte ses clientèles, et la
> livraison s'ouvre par clientèle. Les défauts reproduisent l'existant (tout
> ouvert) ; fermer au public est un geste de l'admin. Le serveur l'applique
> depuis le lot A de [`plan-remise-et-livraison-par-clientele.md`](plan-remise-et-livraison-par-clientele.md), D8.

## 7. Découpage proposé

**Aucune ouverture au public avant la fin du lot 5.**

| Lot | Contenu                                                                                                                                          | Risque          | `vitruve` |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | --------- |
| 0   | Compter en production : commandes sans société, comptes à plusieurs rattachements, points de retrait avec remise, familles sans taux public      | aucun (lecture) | —         |
| 1   | Sélecteur d'espace côté front (en-tête `x-lfc-company`)                                                                                          | faible          | —         |
| 2   | Refus de la commande ambiguë ; colonne de clientèle nullable écrite à la passation ; badge au comptoir et dans la liste admin                    | frontière       | oui       |
| 3   | Tarif public **et** totaux TTC d'abord, ensemble : snapshot v9, projection, miroir, `@lfd/money`, devis, commande, champs de contrat **ajoutés** | argent          | oui       |
| 4   | Porte publique (profil), Mon compte public, navigation, bon et courriel TTC, croissance segmentée                                                | faible          | —         |
| 5   | Flag par audience, CGV consommateur et décisions fiscales validées                                                                               | juridique       | —         |

Les lots 2 et 3 du premier jet (tarif, puis totaux) sont **fusionnés** : séparés,
le devis coterait en TTC public pendant que la commande calcule encore en HT, et
la parité devis / commande casserait entre les deux déploiements.

## 8. La contradiction de `vitruve` (2026-09-15) et son sort

| Objection                                                                                                                                | Sort                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **B1** « Σ TTC = total » faux avec la remise de retrait ; calcul hors `@lfd/money` = seconde définition du TTC ; portes du prix ignorées | corrigée — §3.2, D2, D3                                           |
| **B2** le refus de la commande ambiguë bloque les comptes à plusieurs sociétés (aucun front n'envoie l'en-tête)                          | corrigée — §4.2, lot 1 avant le lot 2 ; vérifié par grep          |
| **S1** rattrapage de l'audience = affirmation fabriquée, un seul déploiement                                                             | corrigée — colonne nullable, aucun rattrapage, trois déploiements |
| **S2** `pending` donne le prix pro sans vérification ; saisie staff sans commande publique                                               | corrigée — §4.3, D1, §2.1                                         |
| **S3** plancher « par construction » faux                                                                                                | corrigée — §3.3                                                   |
| **S4** « audience » déjà pris par `PriceAudience`                                                                                        | corrigée — `Order.clientele` proposé, §3.3                        |
| **S5** vitrine anonyme oubliée ; contrat nommé HT                                                                                        | corrigée — D10, champs ajoutés (lot 3)                            |
| **S6** ordre des lots faux                                                                                                               | corrigée — §7                                                     |
| **S7** cycle de prélèvement mal décrit ; contradiction avec « une facture pour toute vente »                                             | corrigée — §2.2, D0 ; citation vérifiée l. 17                     |
| **S8** snapshot v9, nom du champ de fil ; taux = qualification fiscale                                                                   | corrigée — §3.1, §5.5                                             |
| Mineures (chemins, libellé de file, archivage du bon, courriel, alertes)                                                                 | corrigées                                                         |
| Non vérifié : données de production, taux Shopify, abonnements, écrans HT exhaustifs                                                     | assumé — lot 0 et plan                                            |
