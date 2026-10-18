# L'historique d'achat d'un particulier — ce qu'il nous faut pour recommander

> 📐 **Doc-first** (Hugo, 2026-10-18 : « déjà l'historique public, fais une doc
> pour expliquer ce qu'il nous faut »). Elle prépare la question Q1 et le lot
> R3 de [`plan-recommandation-de-produits.md`](plan-recommandation-de-produits.md).
> Chaque affirmation sur l'existant a été **ouverte le 2026-10-18** ; ce qui ne
> l'a pas été est dit « non vérifié ». Rien n'est bâti de « vos habituels » ;
> la mesure anonyme (§3.7) l'est.

## 1. En une phrase

L'historique existe déjà, rattaché à une **personne** même sans compte ; ce qui
manque n'est pas technique, c'est **le droit de s'en servir pour recommander** :
une finalité annoncée, une base légale, un moyen de refuser, et une règle pour
l'invité.

## 1 bis. Trois sources, trois régimes (Hugo, 2026-10-18)

« L'intégralité des comportements clients devrait donner des suggestions —
c'est de l'analytics. » D'accord, à condition de séparer ce qui vise **tout le
monde** de ce qui vise **une personne** :

| Source                                                         | Exemple                                                     | Pour qui                       | Ce qu'il faut                                                                                                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Le collectif**, toutes les commandes agrégées                | « souvent pris avec », « les plus commandés cette semaine » | tout le monde, invités compris | **un seuil d'anonymat** (une association ne s'affiche que si au moins 5 clients distincts l'ont faite) et des comptes sans identifiant stockés ; pas de base légale nouvelle |
| **L'audience**, vues, clics, recherches                        | « le plus regardé », taux d'ajout au panier                 | tout le monde                  | des **compteurs anonymes côté serveur** (par produit et par jour, sans identifiant de visiteur) ; suivre un visiteur d'une page à l'autre = traceur, consentement            |
| **L'individu**, l'historique d'une personne montré à elle-même | « vos habituels »                                           | le client connecté             | §3 ci-dessous : finalité annoncée, base légale, interrupteur                                                                                                                 |

**Ordre retenu** : le collectif d'abord (il sert tout le monde dès le départ),
puis les compteurs d'audience anonymes, puis « vos habituels » après l'avis du
cabinet. **Pas** de suivi individuel des visiteurs (« vous avez regardé ») :
bannière obligatoire, gain faible à notre échelle.

⚠️ En prérelease, les volumes sont faibles : le seuil masquera la plupart des
associations au début. C'est voulu — sans lui, « souvent pris avec » trahirait
le panier d'une seule personne.

## 2. Ce que la base sait déjà d'un particulier

| Qui                      | Ce qui le relie à ses commandes                                                                                                                                                                                                                                                                    | Lisible pour recommander ?                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Client connecté**      | `Order.placedByUserId`, obligatoire, « le mur sans entreprise » (`apps/lfd-api/prisma/schema/public/orders.prisma:71-74`, `:89`)                                                                                                                                                                   | oui, techniquement : une requête par `placedByUserId`                     |
| **Invité** (sans compte) | une ligne `users` **sans identité de connexion** (`auth0_sub` nul), créée au panier avec prénom, e-mail, téléphone (`apps/lfd-api/src/b2b/orders/infrastructure/prisma-guest-buyer.registrar.ts`, `register`) ; une seconde commande sous la **même adresse** réutilise la même fiche (`guestFor`) | non : il n'a pas de session, donc personne à qui montrer quoi que ce soit |
| **Invité devenu compte** | à sa première connexion, si la connexion prouve la boîte et qu'**une seule** fiche invité porte l'adresse, le compte **reprend** cette fiche : ses commandes (et ses points) le suivent (`apps/lfd-api/src/b2b/account/infrastructure/guest-account-claim.ts`, en-tête)                            | oui, dès qu'il est connecté — son passé d'invité compris                  |

⚠️ **Une justification à corriger** : le port dit « 🔴 Toujours une ligne
neuve, jamais une réconciliation par adresse »
(`apps/lfd-api/src/b2b/orders/domain/ports/guest-buyer.registrar.ts`, JSDoc de
`register`), alors que son adaptateur **réutilise** la fiche invité de même
adresse (`prisma-guest-buyer.registrar.ts`, `guestFor`, vérifié le
2026-10-18). Le code fait foi ; la phrase du port a été corrigée le 2026-10-18.
Relu le 2026-10-18 au soir : la phrase du port n'a pas bougé. Ça compte ici :
l'historique d'un invité **s'accumule** déjà sur une seule
fiche par adresse.

Ce que l'historique contient déjà : articles, quantités, dates, montants, mode
et créneau de retrait (`documentation/legal/texte-politique-de-confidentialite.md`,
« Vos commandes et vos paiements »). Une recommandation **n'a besoin de rien de
plus** — aucune donnée nouvelle n'est collectée.

## 3. Ce qui manque

### 3.1 Une finalité annoncée — le seul vrai manque

Le texte de confidentialité liste aujourd'hui ce qu'on fait des commandes :
« prendre, préparer, facturer et vous remettre ou vous livrer vos commandes »,
et les messages qui s'y rattachent (`texte-politique-de-confidentialite.md`,
§ finalités, l. 102-105). **Rien sur la personnalisation.** Réutiliser
l'historique pour suggérer des produits est une **finalité nouvelle** : elle
doit être écrite avant d'être servie.

Phrase à ajouter (proposition, à valider par Hugo et le cabinet) :

> **Vous proposer vos produits habituels.** Lorsque vous êtes connecté, nous
> nous appuyons sur vos commandes des 12 derniers mois pour vous suggérer les
> produits que vous commandez souvent. Ces suggestions sont calculées sur nos
> serveurs, ne sont visibles que de vous et ne sont jamais transmises à un
> tiers. Vous pouvez les désactiver à tout moment dans votre profil.

### 3.2 Une base légale

Deux voies, la première recommandée :

- **Intérêt légitime** — suggérer à un client, sur notre propre boutique, ce
  qu'il nous a déjà acheté est une attente raisonnable d'un client ; elle
  suppose l'**information** (3.1) et un **droit d'opposition simple** (3.3).
  Aucun tiers, aucun cookie, aucun croisement avec d'autres sources.
- **Consentement** — une case à cocher. Plus lourd (preuve, retrait, case non
  pré-cochée), et inutile tant que le calcul reste celui de 3.1.

**À faire trancher par le cabinet** — c'est la question juridique du dossier.

### 3.3 Un moyen de refuser

Un interrupteur « Suggestions personnalisées » dans **Mon profil**, actif par
défaut sous l'intérêt légitime (inactif sous le consentement). Techniquement :
une colonne booléenne sur la personne, lue par la query de recommandation ;
désactivé ⇒ **aucune lecture** de l'historique pour ce but, la carte disparaît.
Le pro n'en a pas besoin : son historique est celui de la **société**, déjà
affiché dans « Mes commandes » (plan §6).

### 3.4 Une règle pour l'invité

**Aucune recommandation à un invité.** Il n'a pas de session : le reconnaître
supposerait de le pister (cookie, empreinte), ce qui est un traitement de plus,
soumis au consentement, pour un gain faible. Son historique **attend** : s'il
crée un compte, il le retrouve par le rattachement (§2). C'est déjà ce que le
plan écrit (§1.2) ; il est confirmé par le code.

### 3.5 Une durée

La fenêtre de calcul est de **12 mois** (celle de `CustomerSkuReader`,
`apps/lfd-api/src/b2b/orders/domain/ports/customer-sku.reader.ts:2`). La
recommandation ne **conserve** rien : elle lit les commandes, qui sont gardées
10 ans pour la comptabilité (`texte-politique-de-confidentialite.md`, durées).
Le texte doit dire « 12 derniers mois » pour que la promesse corresponde au
calcul.

### 3.6 La suppression du compte

Quand le compte est supprimé (`documentation/legal/plan-supprimer-mon-compte.md`,
doc-first, rien de bâti), les commandes sont **détachées** de la personne pour
la seule comptabilité. La recommandation n'a rien à ajouter : sans
`placedByUserId` lisible, il n'y a plus d'historique à suggérer. À vérifier
quand ce plan sera bâti — non vérifié aujourd'hui.

### 3.7 La mesure

Tranché et bâti le 2026-10-18 : la mesure est **anonyme** pour tout le monde.
Les faits nominatifs `recommendation.shown / clicked / added` d'abord proposés
(plan, ancienne décision R5) sont remplacés par des **compteurs** par jour,
article, geste, emplacement et source, sans identifiant de personne
(`growth.product_audience_counters`, R5 bis du
[plan](plan-recommandation-de-produits.md)). On n'a pas besoin de savoir _qui_
a cliqué pour savoir si ça sert ; la contrepartie est qu'une commande ne se
relie pas à un clic, d'où des résultats **estimés**
([`suggestions-du-staff.md`](suggestions-du-staff.md) §8.2).

## 4. Ce qu'il faut, récapitulé

| #   | Quoi                                                                          | Qui               | Bloque le lot R3 ? |
| --- | ----------------------------------------------------------------------------- | ----------------- | ------------------ |
| 1   | Base légale : intérêt légitime ou consentement                                | cabinet, Hugo     | oui                |
| 2   | Phrase « Vous proposer vos produits habituels » dans la politique             | Hugo, cabinet     | oui                |
| 3   | Interrupteur « Suggestions personnalisées » dans Mon profil (colonne + écran) | à bâtir           | oui                |
| 4   | Aucune recommandation à un invité                                             | décidé (code)     | —                  |
| 5   | Mesure anonymisée pour le public                                              | bâti (R0)         | non                |
| 6   | Corriger la phrase périmée du port `GuestBuyerRegistrar`                      | fait (2026-10-18) | non                |

Le reste — lire l'historique, le filtrer par ce qui est servi aujourd'hui —
est déjà prévu par le plan et ne dépend pas du public.
