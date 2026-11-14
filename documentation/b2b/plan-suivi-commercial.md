# Plan — le suivi commercial : ce qui a été fait, et ce qui ne l'a pas été

> Plan du 2026-11-14 (v2), demandé par Hugo pour la cheffe des commerciaux.
> Pas encore bâti. La v1 a été contredite par `vitruve` (niveau « Ouverte »
> sans donnée, sites comptés comme des ouvertures, montées de niveau sans
> source, adresses multiples contraires au modèle). Touche une frontière
> d'accès et le registre RGPD du staff.

## 1. En simple

Une page, pour la cheffe des commerciaux, qui répond à deux questions :

1. **Qu'a fait l'équipe aujourd'hui ?** — le récap du jour, par commercial.
2. **Qu'est-ce qui n'a pas été fait ?** — les fiches ouvertes et laissées en
   plan.

Le cœur : **une fiche qui n'a que le nom et le SIRET n'est pas une acquisition,
c'est une ligne d'annuaire.** Chaque fiche ouverte par l'équipe reçoit un
**niveau de travail**, calculé sur ce qu'elle contient — jamais sur ce qu'on
déclare :

| Niveau            | Ce que la fiche contient                                                  |
| ----------------- | ------------------------------------------------------------------------- |
| **0 · Annuaire**  | nom et/ou SIRET, rien d'autre                                             |
| **1 · Contactée** | un interlocuteur réel : nom ET (e-mail OU téléphone) non vides            |
| **2 · Qualifiée** | une adresse de facturation, et une adresse de livraison sauf retrait seul |
| **3 · Ouverte**   | le détenteur s'est connecté au moins une fois                             |
| **4 · Active**    | activée, avec au moins une commande                                       |

Trois signaux s'y ajoutent, qui ne sont pas des niveaux :

- **Relances sans réponse** : l'accès client a été envoyé **2 fois ou plus**
  et personne ne s'est encore connecté — le signe d'un e-mail renvoyé au lieu
  d'un appel. Un seul envoi suivi d'une connexion est normal.
- **Plusieurs adresses de livraison** (décidé par Hugo le 2026-11-14) : un
  lieu de plus est un **site**. Avertissement seulement, jamais un refus.
  Mesuré le même jour en production : aucune fiche n'a plus d'une adresse de
  livraison vivante — le signal ne gêne aucune fiche existante.
- **En retard** : au niveau Annuaire depuis plus de 7 jours, au niveau
  Contactée depuis plus de 14 (seuils à confirmer).

Décidé par Hugo le 2026-11-14 : **un seul tableau global**, une ligne par
fiche, filtrable par commercial — le commercial attribué à la fiche, ou « non
attribuée ». Pas de tableau par commercial à part.

```text
┌ Suivi commercial ─────────────────────────────────────── 14 nov. ┐
│ Commercial [Tous ▾]  Niveau [Tous ▾]  Signal [Tous ▾]  Canal [Tous ▾] │
│ 38 Annuaire · 8 Contactée · 4 Qualifiée · 2 Ouverte · 5 Active   │
│                                                                   │
│ Fiche          Réf.      Niveau     Âge  Suivie par     Signaux   │
│ Boulangerie X  C-4F2K1A  Annuaire   21 j Commerciale A  ● retard  │
│   manque : interlocuteur · adresses · consultée 0× en 21 j        │
│ Café Y         C-9QZ3LM  Contactée  12 j Commerciale A  ⚠ accès 3×│
│   manque : connexion du détenteur · adresses                      │
│ Bistro Z       C-2MX8QA  Qualifiée   3 j non attribuée  inscrit   │
│   manque : connexion du détenteur                                 │
│                                                                   │
│ Aujourd'hui (filtre appliqué) : 12 fiches ouvertes · 0 montée ·   │
│ 4 accès renvoyés · 3 fiches consultées                            │
└───────────────────────────────────────────────────────────────────┘
```

Les compteurs par niveau et le récap du jour suivent le filtre : choisir
« Commerciale A » donne ses chiffres, « Tous » ceux de l'équipe.

**Ce qui n'est pas compté comme une ouverture** : un **site** (sous-compte)
créé sous un principal — c'est de la structure, pas de l'acquisition ; il
apparaît à part. Une fiche **inscrite par le client** n'a ni auteur ni niveau
« Contactée » d'office : elle entre dans la page quand la cheffe l'attribue.

## 2. Ce qui existe (vérifié dans le code le 2026-11-14)

- **Canal d'ouverture** : `companies.declared_via` (`self` | `staff`, nullable),
  `prisma/schema/public/account.prisma:159`. **Pas d'auteur** ni de commercial
  attitré sur `Company`.
- **Le fait `company.declared`** est écrit dans `growth.activity_events` par un
  abonné hors requête (`on-company-declared.handler.ts:27`, `void
this.work.track`), l'acteur lu dans le contexte de la requête
  (`prisma-activity-recorder.ts:100`). Il sert aux ouvertures `self`,
  `staff` **et aux sites** (`create-sub-account.handler.ts:82` déclare en
  `staff`). Une trace d'audit, pas une donnée de pilotage.
- **Les chemins qui créent une société** : `create-company-by-staff`,
  `create-sub-account` (un site), `create-company` (client),
  `declare-my-establishment` (client, contact repris de son profil), et le
  semis de démonstration (`src/dev/seeding/client.seed.ts`).
- **Connexion du détenteur** : `User.firstLoginAt` (`account.prisma:458`).
- **Envois de l'accès client** : le modèle `customer.access-opened`
  (`grant-account-access.service.ts`), rattaché aux sujets `account` et
  `company` ; le bloc `mail` les sert **par lot** par son canal
  `MailSubjectDeliveries.forSubjects` (`mail/channels/deliveries/`).
- **Adresses** : `public.addresses`, `kind` `billing` | `delivery`,
  `archived_at` ; plusieurs adresses de livraison sont admises par le modèle
  (`DeliveryAddressBook`, un seul défaut).
- **Avertissements** (`company-warnings.ts`) : activation bloquée, attente
  ≥ 14 j, mandat absent, KBIS à vérifier.
- **Journal** : `GET /admin/activity` filtre par auteur et période, réservé à
  l'admin ; index `(type, occurred_at)` et `(actor_id)` sur
  `growth.activity_events` (`growth.prisma:71,76`).
- **RGPD** : la porte `lint:rgpd-staff` reconnaît `_by`, `_by_name`,
  `_staff_id` (`dev-toolbox/gates/rgpd-staff.mjs:72-80`) ; elle ne voit pas les
  colonnes d'acteur du journal (`actor_id`, `actor_name`, `actor_role`).

## 3. Technique

### 3.1 Qui a ouvert, qui suit (migration additive)

- `companies.declared_by_staff_id` (nullable) et `declared_by_name` (figé),
  posés **dans la transaction** de `create-company-by-staff` depuis l'acteur
  de la commande. Un site (`create-sub-account`) porte aussi son auteur, mais
  la page le range à part (`parent_company_id` non nul).
- `companies.followed_by_staff_id` (nullable) : le commercial qui suit. Vaut
  l'auteur à l'ouverture par l'équipe ; vide pour une inscription client tant
  que la cheffe ne l'attribue pas. Index `(followed_by_staff_id)`.
- **Réattribuer** est un geste : une méthode de l'agrégat
  (`Company.assignFollower(staffId)`), une commande scellée par la clé
  d'intention de l'écran (`@IntentKey`, `runSealed`), un fait
  `company.follower_changed`.
- **Reprise** des fiches existantes, une fois, par script relu : auteur lu
  dans `growth.activity_events` (`company.declared`, acteur `staff`), **sites
  exclus** ; un acteur introuvable laisse la colonne vide, et la page dit
  « auteur inconnu » — jamais une valeur inventée. Le script imprime ce qu'il
  écrirait avant d'écrire ; une erreur se corrige ligne par ligne, c'est dit.
- Semis de démonstration : il pose l'auteur comme le ferait l'équipe.

### 3.2 Le niveau de travail (domaine pur), et ses traces

- Un service `workLevelOf(input)` à côté de `company-warnings.ts`, même forme,
  testé cas par cas : il rend le niveau **et ce qui manque pour le suivant**.
  Les vides se testent comme vides (`contactEmail` n'est jamais `null`).
- **Les montées de niveau ont une source** : quand un geste fait changer le
  niveau d'une fiche suivie, un fait `company.work_level_reached` (niveau,
  suiveur) est écrit au journal. Le récap du jour les compte ; sans ce fait,
  « 3 montées » n'aurait aucune origine.
- **Avertissement `adresses_multiples`** ajouté à `company-warnings.ts`
  (adresses de livraison vivantes > 1), servi là où les autres le sont, et
  compté par le compteur du menu ; son texte nomme la sortie : « créer un site
  par adresse ».

### 3.3 La page, et ce qu'elle coûte

- Une lecture `GET /admin/sales-oversight` (`QueryBus`), dans le bloc
  `lafoliecoffee/growth` ; elle lit les sociétés par le lecteur qu'`account`
  publie déjà pour la croissance, les envois d'accès par
  `MailSubjectDeliveries.forSubjects` (canal du bloc `mail`), et le journal
  qui est le sien. `lint:prisma-model-ownership` et `lint:context-boundaries`
  le vérifient au bâti.
- **Coût** (base facturée à l'opération) : une page = une liste paginée des
  fiches suivies (50), un `EXISTS` commande et un compte d'adresses **par
  lot** sur ces 50 ids, un appel `forSubjects` pour ces 50 ids, et une
  agrégation du journal du jour sur l'index `(type, occurred_at)`. Aucun
  appel par ligne. Les comptes par niveau du tableau se calculent sur les
  fiches suivies (quelques centaines), une requête par tableau.
- **Mur des données** : la réponse ne porte aucun e-mail ni téléphone de
  prospect — seulement « présent / absent » ; aucun journal n'écrit une
  adresse (`lint:log-no-email`).
- Une **ressource neuve** `b2b_sales_oversight` (lecture). La migration ajoute
  la ressource, jamais le droit (`lint:no-role-grants-in-migrations`) : la
  cheffe le reçoit à l'écran des rôles.
- Front : `apps/lfd-backoffice-frontend/src/app/commercial/suivi/`, fold-ng
  d'abord, chaque ligne mène à la fiche.

### 3.4 RGPD et droit du travail — ce suivi porte sur des salariés

- **Registre** : les colonnes neuves, et les colonnes d'acteur de
  `growth.activity_events`, avec la finalité « suivi de l'acquisition
  commerciale » et une durée de conservation (question 4). **La porte apprend
  la table** (`ALL_PERSONAL_TABLES` de `rgpd-staff.mjs`) : sans quoi
  l'inscription resterait de la prose.
- **Accès** : la ressource `b2b_sales_oversight`, donnée à la cheffe et à
  l'admin seulement.
- **Information de l'équipe, avant la mise en service** : un écrit remis à
  chaque commercial (ce que la page montre, à qui, combien de temps), par
  Hugo. S'il existe un CSE, il est consulté avant, la page pouvant servir à
  évaluer le travail. Le plan ne met rien en service avant ce geste.

### 3.5 Les inscriptions spontanées (lot S5)

Une fiche inscrite par le client (`declared_via = self`) a son bloc sur la
page : niveau, ancienneté, et en tête **celles qu'aucun commercial ne suit**.
Un signal quand une inscription reste sans suiveur plus de 2 jours ouvrés
(seuil à confirmer) : un prospect venu de lui-même et que personne ne rappelle
est le manque le plus cher. L'attribution est le geste de S5
(`Company.assignFollower`).

### 3.6 Les consultations de fiche (lot S6)

**Ce qui est compté** : combien de fois une personne de l'équipe a ouvert une
fiche, **par fiche, par personne et par jour** — une ligne mise à jour
(`growth.company_sheet_views` : société, staff, jour, nombre), jamais une
ligne par clic ni une chronologie à la minute. C'est ce qui reste
proportionné, et ce qui coûte une écriture par fiche et par jour au plus.

**Qui n'est pas compté** (demandé par Hugo le 2026-11-14) :

- **le superadmin** (la fiche de secours, rôle résolu `superadmin`) : ses
  ouvertures ne sont **pas enregistrées du tout** — rien n'est gardé qui ne
  sert pas ;
- **les personnes qui pilotent** (celles qui ont `b2b_sales_oversight`) : leurs
  ouvertures sont enregistrées à part et montrées sous « pilotage », jamais
  mêlées au travail des commerciaux — la cheffe qui relit une fiche ne la
  « travaille » pas.

**Ce que la page en tire** : « ouverte 0 fois depuis 21 jours » à côté d'une
fiche au niveau Annuaire ; dans le récap du jour, le nombre de fiches
consultées par commercial.

**Condition, avant toute écriture** : l'équipe est informée par écrit que les
consultations sont comptées (une trace prise à son insu ne pourrait pas servir
à évaluer son travail, Code du travail, art. L1222-4), le CSE consulté s'il
existe, la table inscrite au registre RGPD avec la même durée que le reste du
suivi. Le lot S6 ne se met pas en service avant.

## 4. Lots

1. **S1** — colonnes d'auteur et de suivi, posées à l'ouverture ; registre et
   porte RGPD ; script de reprise (relu, lancé à part).
2. **S2** — niveau de travail, fait `work_level_reached`, avertissement
   `adresses_multiples`.
3. **S3** — la ressource, la route, la page (tableau, manquements, envois
   d'accès).
4. **S4** — le récap du jour.
5. **S5** — réattribuer, et le bloc des inscriptions spontanées (§ 3.5).
6. **S6** — les consultations de fiche (§ 3.6), après l'information de
   l'équipe.

## 5. Questions pour Hugo

1. **Les seuils** : 7 jours au niveau Annuaire, 14 au niveau Contactée, 2
   envois d'accès sans connexion — à confirmer.
2. **« Contactée »** : un nom ET un e-mail ou un téléphone suffit-il, ou faut-il
   une trace d'échange (rendez-vous, note du commercial) ?
3. **Le commercial attitré** : on le crée (S1, S5), ou la page se contente de
   l'auteur ?
4. **La durée de conservation** des traces d'activité du staff : 12 mois
   proposé.
5. **Qui voit** : la cheffe et l'admin seulement, ou chaque commercial voit-il
   aussi sa propre ligne ?
6. **Un CSE existe-t-il** ?
7. **Inscription sans suiveur** : 2 jours ouvrés avant le signal ? (Il change l'ordre de la mise en service.)
