# Analyse — la boutique publique dans la boutique pro

> **Ouverte le 2026-09-15** à la demande de Hugo. 📐 Analyse, rien n'est bâti.
> Décrit l'existant tel que lu ce jour-là, le travail à faire, et les décisions
> à prendre avant d'écrire un plan.

## 0. La demande

> « ma boutique b2c sera la même que la pro, beaucoup d'avantages mais aussi une
> distinction à faire : le compte public n'a qu'un profil et son tarif public,
> le flow de commande est le même, pas de factures, il retire avec un QR comme
> les pros ; au niveau du retrait boutique on ne touche à rien au niveau de la
> file, on met juste un badge pro ou public sur la ligne de la table » — Hugo,
> 2026-09-15.

## 1. En une page

**La moitié du chemin existe déjà, par accident heureux.** Le pivot « zéro
friction » du 2026-08-06 a rendu la commande possible **sans société** : un
compte sans rattachement commande, paie par carte, retire avec son QR, et sa
commande n'est jamais facturée. Un particulier est donc, pour le code, « un
client qui n'a pas de société » — ce que la demande appelle un compte public.

**Ce qui manque tient en trois sujets, de poids très inégal :**

| Sujet                                                        | Poids    | Pourquoi                                                                                                                                                                              |
| ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Le tarif public** n'arrive pas à la boutique               | 🔴 lourd | Le référentiel saisit le TTC public, mais **seul le HT pro traverse la frontière**. Aujourd'hui un compte sans société voit et paie **le prix pro**.                                  |
| **L'audience « pro / public »** n'est écrite nulle part      | 🟠 moyen | Elle se déduit de l'absence de rattachement, à la volée, à chaque requête. Rien ne la fige sur la commande : ni le badge du comptoir, ni les stats, ni la facture ne peuvent la lire. |
| **L'accueil du public** (inscription, Mon compte, documents) | 🟡 léger | Les écrans présupposent un pro : Mon compte n'offre à un compte sans société que « Compléter mon dossier », le bon de commande est un document HT, « Mes factures » est visible.      |

Le badge du comptoir, que la demande présente comme le seul geste côté retrait,
est effectivement petit — **à condition** que l'audience soit d'abord figée sur
la commande (§4).

## 2. L'existant (lu et vérifié le 2026-09-15)

### 2.1 Identité : un compte sans société est déjà un citoyen de plein droit

| Fait                                                                                                                                                                                                                      | Où                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `User` ne porte aucune société ; `Membership` relie 0..N personnes à 0..N sociétés                                                                                                                                        | `prisma/schema/public/account.prisma` (`User`, `Membership`)                                                                  |
| Au premier appel authentifié d'un inconnu, le serveur crée un `User` **actif sans société** (provisioning JIT)                                                                                                            | `b2b/account/infrastructure/customer-principal.resolver.ts`                                                                   |
| « Pour quelle société agit cette requête » : aucun rattachement → `null` ; un seul → celui-là ; **plusieurs sans déclaration (`x-lfc-company`) → `null`**, commenté « le tarif public est la réponse honnête »            | `platform/auth/resolve-company.ts`                                                                                            |
| Deux portes d'entrée : `/bienvenue` (trois champs, passkey) et `/ouverture-compte-pro` (déclare une société `pending`) ; l'index signale que `/bienvenue` **perd le profil en production** (nom vide refusé, non corrigé) | `documentation/b2b/plan-inscription-pro-seule.md`, `documentation/README.md` (ligne `architecture-inscription-zero-friction`) |
| Mon compte sans société : seule la carte « Compléter mon dossier » s'affiche — elle sert à devenir pro                                                                                                                    | `apps/lfc-B2B-platform-frontend/src/app/client/mon-compte/compte-page/compte-page.html`                                       |
| L'accès à la boutique est un flag **global** `shop` (`closed` / `browse` / `order`), sans notion d'audience                                                                                                               | `b2b/feature-access/`                                                                                                         |

### 2.2 Commande et règlement : le chemin sans société est complet

| Fait                                                                                                                                 | Où                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `Order.companyId` est **nullable** ; sans société, le mur est `placed_by_user_id`                                                    | `prisma/schema/public/orders.prisma:59-63`, `b2b/orders/domain/services/order-access.ts`        |
| Sans société (ou société non active, ou sans crédit accordé), la **carte est obligatoire** ; le compte n'est jamais possible         | `b2b/orders/application/commands/place-order.handler.ts` (`requiresCard`, `maySettleOnAccount`) |
| Le chemin est documenté et marqué ✅ : register → panier → retrait/coursier → carte                                                  | `documentation/order/architecture-flux-commande-zero-friction.md`                               |
| La **facturation n'est pas codée** (doc-first) ; la doc exclut déjà « la commande zéro friction tant qu'elle n'a pas été rapatriée » | `documentation/b2b/architecture-facturation.md`                                                 |
| Un « rapatriement » des commandes sans société vers une société créée après coup est prévu (TODO, non codé)                          | `documentation/order/architecture-flux-commande-zero-friction.md`                               |
| Le bon de commande PDF est rendu et archivé pour toute commande                                                                      | `b2b/orders/domain/services/order-sheet-pdf.ts`                                                 |

### 2.3 Prix : le TTC public existe à la source, et s'arrête à la frontière

| Fait                                                                                                                                                                                                                             | Où                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Un seul prix saisi : le **TTC public**, sur la déclinaison. Le TTC pro = public × rapport (`ratioBp`, ex. 9 000) ; le HT B2B se déduit du TTC pro et du taux `b2b`                                                               | `documentation/pricing/architecture-prix-ancre-ttc.md` §A.2, `packages/pim-contracts/src/accounting-rules.ts` (`proPriceOf`) |
| La projection vers la plateforme ne pousse que ce **HT pro** (`htMillicents`) et le taux `b2b`                                                                                                                                   | `pim/channels/b2b-platform/products/projection.ts` (`proPriceOf` → `projectVariant`)                                         |
| Trois contextes de vente : `takeaway` (à emporter), `eatIn` (sur place), `b2b` ; le taux se pose par famille et **déroge par fiche, contexte par contexte** (« 20 % en B2B et le taux familial au comptoir est le cas courant ») | `documentation/pim/contextes-et-points-de-vente.md` §2-3                                                                     |
| Le TTC public part **tel quel** vers Shopify                                                                                                                                                                                     | `documentation/pricing/architecture-prix-ancre-ttc.md` §A.2                                                                  |
| `resolvePrice` est **HT de bout en bout** (mercuriale → volume → promotion → geste, plancher) ; sans société, seule la promotion publique s'applique                                                                             | `b2b/pricing/domain/resolve-price.ts`, `b2b/pricing/application/pricer.ts`                                                   |
| La vitrine d'un client reconnu sans société rend « le tarif catalogue, comme la vitrine publique » — **c'est-à-dire le HT pro**                                                                                                  | `b2b/orders/http/my-shop-catalogue.controller.ts`                                                                            |
| Le contrat catalogue et le devis portent un HT unitaire en millicentimes et un taux ; le TTC unitaire n'est jamais servi, le total TTC l'est                                                                                     | `packages/contracts/src/shop-catalogue.ts`, `shop-quote.ts`                                                                  |

🔴 **Conséquence directe** : si la boutique ouvrait demain au public, un
particulier paierait le prix pro, au taux de TVA B2B.

### 2.4 Retrait et production

| Fait                                                                                                                                     | Où                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Le jeton de retrait est émis à la passation pour **toute** commande, retrait comme livraison ; l'écran client du QR existe               | `b2b/orders/infrastructure/prisma-order.repository.ts`, `apps/lfc-B2B-platform-frontend/src/app/client/mes-commandes/retrait-page/` |
| La ligne de file porte `customerLabel` et `tradeName` (enseigne), **ni société ni audience**                                             | `handover/channels/commerce/handover-queue.reader.ts`, `packages/contracts/src/order-handover.ts` (`HandoverQueueEntryView`)        |
| `customerLabel` = enseigne, sinon raison sociale, sinon nom de la personne                                                               | `b2b/orders/infrastructure/prisma-day-orders.reader.ts` (`labelOf`)                                                                 |
| La fiche atelier (`ProductionOrder`) ne porte ni société ni audience                                                                     | `prisma/schema/production.prisma`                                                                                                   |
| Le journal d'activité accepte une commande sans société (`establishmentId: null`) ; les découpes NAF / code postal du cockpit l'ignorent | `b2b/growth/application/handlers/on-order-placed.handler.ts`, `documentation/b2b/commercial-data-analytics.md`                      |

## 3. Le tarif public — le vrai chantier

### 3.1 Ce qu'il faut faire traverser

Pour chaque déclinaison vendue au public, la plateforme doit connaître **le TTC
public** et **le taux qui s'applique à la vente publique**. Le TTC existe au
référentiel ; le taux dépend d'une décision (§6, D2) : un particulier qui
retire en boutique achète **à emporter** — ce n'est pas le taux `b2b`, qui peut
différer par fiche.

Travail :

1. **Projection** (`pim/channels/b2b-platform`) : pousser, en plus du HT pro, le
   TTC public et le taux du contexte public retenu. Un article sans taux public
   est écarté **du rayon public** seulement, avec sa raison (même règle que
   `variant_sans_taux` : jamais de taux inventé).
2. **Miroir** (`catalog_items`) : colonnes neuves — migration **additive**,
   remplie au prochain push. Tant qu'elles sont vides, un article n'est pas
   vendable au public (refus explicite, pas un repli sur le prix pro).
3. **Contrats** : le catalogue et le devis servent un prix par audience. Le
   public voit du TTC unitaire ; le pro continue de voir son HT.

### 3.2 Le point dur : un prix ancré TTC dans une chaîne HT

Toute la chaîne de la plateforme est **HT** : `resolvePrice`, la ligne de
commande (`unitPriceMillicents`, `lineTotalCents` HT), puis la TVA ventilée
**par taux, arrondie une fois**. Pour un pro c'est juste : sa facture est HT.

Pour le public, **le prix décidé est le TTC d'étiquette**. Le faire passer par
un HT puis revenir au TTC par ventilation expose à un écart d'un centime entre
l'étiquette et le total payé (arrondi du HT, puis arrondi de la TVA par taux).
Un croissant à 1,20 € qui coûte 1,21 € au panier est un défaut visible et, pour
un consommateur, un affichage de prix inexact.

Deux façons de faire, à trancher en plan (§6, D3) :

| Option                                                                                                                 | Pour                                            | Contre                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **A. Totaux TTC d'abord** pour une commande publique : Σ TTC des lignes = total ; la TVA se **déduit** du TTC par taux | le total égale toujours la somme des étiquettes | une seconde méthode de calcul des totaux dans l'agrégat `Order` — c'est de l'argent, à prouver par des tests de parité |
| **B. HT millicentimes assez fin** pour que l'aller-retour tombe juste, prouvé sur le catalogue réel                    | une seule méthode de totaux                     | une propriété empirique : un prix saisi demain peut la casser, et rien ne le refusera                                  |

Recommandation : **A**, en le rendant **structurel** (l'audience de la commande
choisit la méthode dans l'agrégat, pas le handler). B repose sur une
vérification, A sur une construction.

### 3.3 Les étages de résolution

| Étage      | Pro            | Public (proposition)                                                                                                                                    |
| ---------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mercuriale | oui            | **non** — elle se négocie avec une société                                                                                                              |
| volume     | oui            | **à décider** (D4)                                                                                                                                      |
| promotion  | oui (publique) | oui, mais une promotion est aujourd'hui exprimée sur un prix HT ; son effet sur un TTC doit être défini, ou le public doit avoir ses propres promotions |
| geste      | oui (staff)    | à décider — un geste sur une commande publique existe-t-il ?                                                                                            |
| plancher   | oui            | le plancher protège une marge **HT pro** ; le prix public est au-dessus par construction (rapport ≤ 100 %), à vérifier en test                          |

## 4. L'audience figée sur la commande

**Aujourd'hui l'audience est une déduction** : `companyId === null`. Elle suffit
à router le règlement, mais pas au reste :

- **Deux sens pour `null`.** Une commande sans société est aujourd'hui aussi
  celle d'un pro qui a commandé avant de créer sa société — c'est le cas que le
  « rapatriement » vise. Après le pivot, `null` voudrait dire « public » **et**
  « pro pas encore rattaché ». Un badge, une statistique ou une exclusion de
  facturation qui lit `null` se tromperont sur le second.
- **Plusieurs rattachements sans déclaration → `null`** (`resolve-company.ts`).
  Aujourd'hui ce repli sert un tarif ; après le pivot il ferait **d'un pro une
  commande publique, non facturée, au prix public**. Vérifié le 2026-09-15 :
  `POST /orders` prend la société par `@ActingCompany()`
  (`b2b/orders/http/orders.controller.ts:73`), donc par ce même repli.

Travail :

1. **Une audience explicite, figée à la passation** : `Order.audience` (`pro` |
   `public`), écrite par l'agrégat depuis le contexte résolu, jamais recalculée.
   Migration **de données** pour l'existant (les commandes `companyId = null`
   déjà en production : combien, et lesquelles sont en fait des pros ?) — à
   compter avant d'écrire la bascule.
2. **Refuser l'ambiguïté plutôt que la résoudre en public** : une personne
   rattachée à plusieurs sociétés qui passe commande sans déclarer laquelle est
   refusée (409, message qui dit de choisir l'espace). La vitrine peut garder
   son repli ; la **commande** ne doit pas.
3. **Qui est public ?** Proposition v1 : un compte **sans aucun rattachement**.
   Un pro qui veut acheter pour lui-même utilise un autre compte (D1).

## 5. Le reste du travail, surface par surface

### 5.1 Retrait (la demande : un badge, rien d'autre)

- Porter `audience` dans `HandoverQueueEntry` (`handover/channels/commerce/`),
  lu depuis la commande par l'adaptateur du commerce.
- L'ajouter à `HandoverQueueEntryView` (contrat, champ neuf : additif).
- L'écran comptoir de l'admin (`handover-shop/`) pose un `fold-badge` « Pro » /
  « Public » sur la ligne. La file, l'ordre, le scan, l'attestation : inchangés.
- Même geste, optionnel, sur le détail d'une commande scannée et sur la fiche
  atelier (qui n'en a pas besoin pour produire).

### 5.2 Inscription et Mon compte

- **La porte publique** : `/bienvenue` existe ; corriger d'abord la perte du
  profil en production signalée à l'index. Le profil public = prénom, nom,
  e-mail, téléphone — ce que `UserProfile` porte déjà (à confirmer au plan).
- **Mon compte public** : une carte Profil, le lien vers ses commandes et son QR.
  Pas d'identité légale, d'adresses de facturation, de RIB, de mandat, de KBIS,
  d'utilisateurs, ni de callouts d'activation. La carte « Compléter mon dossier »
  devient un lien discret « Vous êtes un professionnel ? » vers la porte pro.
- **Navigation** : masquer « Mes factures » pour le public.
- **Accès** : le flag `shop` est global. S'il faut ouvrir aux pros avant le
  public (ou l'inverse), il faut un flag par audience (D6).

### 5.3 Commande

- **Acheminement** : la demande dit « il retire avec un QR ». Le chemin coursier
  existe aussi sans société (adresse saisie à la volée). Retrait seul pour le
  public en v1 ? (D5)
- **Règlement** : carte, déjà obligatoire sans société. Rien à faire.
- **Heure limite / dérogations** : les dérogations se posent sur une société ;
  le public a la règle générale. Rien à faire, à confirmer en test.
- **Bon de commande** : le document actuel est un bon pro (HT). Le public a
  besoin d'un récapitulatif TTC, ou d'aucun document (D7).
- **Facturation** (quand elle sera codée) : exclure `audience = public`, et non
  plus `companyId = null`.
- **Rapatriement** (TODO) : ne s'applique qu'aux commandes `pro` sans société ;
  une commande publique ne se rattache jamais.

### 5.4 Back-office et chiffres

- **Liste des commandes admin** : badge et filtre d'audience.
- **Clients publics** : la liste clients est une liste de **sociétés** ; un
  compte public n'y apparaît pas. Faut-il un écran « comptes publics » (support,
  RGPD) ou la recherche par commande suffit-elle en v1 ? (D8)
- **Cockpit commercial / momentum / leads** : ils raisonnent par société. Les
  commandes publiques doivent en être exclues explicitement, ou segmentées, et
  le chiffre d'affaires séparé pro / public.

### 5.5 Juridique et fiscal — à faire valider, non vérifié ici

Rien de ce qui suit n'est écrit dans le dépôt ; ce sont les questions qu'une
vente au consommateur ouvre, à poser au comptable ou au juriste :

- conditions générales de vente **consommateur** distinctes des CGV pro ;
- affichage des prix TTC au consommateur ;
- droit de rétractation et son éventuelle exception pour les denrées
  périssables ;
- ce qui remplace la facture (ticket, note sur demande) et ses mentions ;
- information RGPD d'un compte de particulier.

### 5.6 Shopify

Le référentiel pousse aujourd'hui le TTC public vers Shopify. Si la boutique
publique remplace Shopify, le canal se retire **après** l'ouverture ; sinon les
deux vitrines coexistent et doivent afficher le même prix — ce que l'ancrage TTC
garantit à la source, pas à l'affichage (D9).

## 6. Décisions à prendre avant le plan

| #      | Question                                                                  | Proposition                                                    |
| ------ | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **D1** | Qui est public ? Un pro peut-il acheter en public avec le même compte ?   | public = aucun rattachement ; pas de double casquette en v1    |
| **D2** | Quel taux de TVA pour la vente publique en ligne ?                        | celui du contexte **à emporter** (`takeaway`), fiche par fiche |
| **D3** | Totaux d'une commande publique : TTC d'abord (A) ou aller-retour HT (B) ? | **A**, porté par l'agrégat                                     |
| **D4** | Le public a-t-il volume, promotions, gestes ?                             | promotions publiques seulement, définies sur le TTC            |
| **D5** | Livraison pour le public ?                                                | retrait seul en v1                                             |
| **D6** | Ouvrir la boutique aux deux audiences en même temps ?                     | un flag par audience                                           |
| **D7** | Quel document pour une commande publique ?                                | un récapitulatif TTC, sans mention pro                         |
| **D8** | Un écran « comptes publics » au back-office ?                             | non en v1 ; recherche par commande                             |
| **D9** | Shopify : remplacé ou conservé ?                                          | à trancher par Hugo                                            |

## 7. Découpage proposé

Chaque lot se déploie seul, dans cet ordre ; les migrations sont additives,
la seule bascule de données est au lot 1.

| Lot | Contenu                                                                                                                                     | Risque               | `vitruve` |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------- |
| 0   | Compter en production les commandes `companyId = null` et identifier les pros parmi elles ; compter les personnes à plusieurs rattachements | aucun (lecture)      | —         |
| 1   | `Order.audience` figée + bascule de l'existant ; refus de la commande ambiguë ; badge dans la file de retrait et la liste admin             | migration de données | oui       |
| 2   | Tarif public à la frontière : projection, miroir, contrats catalogue / devis, rayon public qui écarte l'article sans taux public            | argent               | oui       |
| 3   | Totaux TTC d'abord pour une commande publique, étages de résolution publics, plancher                                                       | argent               | oui       |
| 4   | Porte publique (correction du profil), Mon compte public, navigation, récapitulatif TTC                                                     | faible               | —         |
| 5   | Flag par audience, cockpit et chiffres segmentés, CGV consommateur (après validation juridique)                                             | faible               | —         |

**Rien ne s'ouvre au public avant les lots 1 à 3** : sans eux, un particulier
paie le prix pro et sa commande ne se distingue pas de celle d'un pro.
