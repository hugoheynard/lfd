# Plan — le suivi commercial : ce qui a été fait, et ce qui ne l'a pas été

> Plan du 2026-11-14, demandé par Hugo pour la cheffe des commerciaux. Pas
> encore bâti. Touche une frontière d'accès (une ressource neuve) et le
> registre RGPD du staff : `vitruve` avant Hugo.

## 1. En simple

Une page, pour la cheffe des commerciaux, qui répond à deux questions :

1. **Qu'a fait l'équipe aujourd'hui ?** — le récap du jour, par commercial.
2. **Qu'est-ce qui n'a pas été fait ?** — les fiches ouvertes et laissées en
   plan : sans interlocuteur, sans adresse, jamais activées, jamais commandé.

Le cœur : **une fiche qui n'a que le nom et le SIRET n'est pas une acquisition,
c'est une ligne d'annuaire.** Chaque fiche reçoit un **niveau de travail**,
calculé sur ce qu'elle contient réellement — jamais sur ce qu'on déclare :

| Niveau            | Ce que la fiche contient                                      |
| ----------------- | ------------------------------------------------------------- |
| **0 · Annuaire**  | nom et/ou SIRET, rien d'autre                                 |
| **1 · Contactée** | un interlocuteur réel : nom ET (e-mail OU téléphone)          |
| **2 · Qualifiée** | une adresse de facturation ET une adresse de livraison        |
| **3 · Ouverte**   | un accès client envoyé, et les pièces de son mode de paiement |
| **4 · Active**    | activée, avec au moins une commande                           |

```text
┌ Suivi commercial ──────────────────────────────── aujourd'hui · 14 nov. ┐
│                                                                         │
│  Par commercial      Annuaire  Contactée  Qualifiée  Ouverte  Active    │
│  ─────────────────────────────────────────────────────────────────────  │
│  Commerciale A          38 ●       2         0         0        0      │
│  Commercial B            3        6         4         2        5      │
│                                                                         │
│  ● 38 fiches au niveau Annuaire depuis plus de 7 jours                  │
│                                                                         │
│  Manquements  [Annuaire ▾] [Commerciale A ▾] [> 7 jours ▾]              │
│  ─────────────────────────────────────────────────────────────────────  │
│  Boulangerie X   C-4F2K1A   Annuaire   ouverte il y a 21 j   A   ▸     │
│     manque : interlocuteur · adresses · accès client                    │
│  Café Y          C-9QZ3LM   Contactée  ouverte il y a 12 j   A   ▸     │
│     manque : adresses · accès client                                    │
│                                                                         │
│  Aujourd'hui                                                            │
│  ─────────────────────────────────────────────────────────────────────  │
│  Commerciale A   12 fiches ouvertes · 0 montée de niveau                │
│  Commercial B     1 fiche ouverte · 3 montées · 1 activation            │
└─────────────────────────────────────────────────────────────────────────┘
```

Ce que la page rend visible d'un coup d'œil : douze fiches ouvertes dans la
journée, aucune qui monte, c'est du travail d'annuaire.

## 2. Ce qui existe (vérifié dans le code le 2026-11-14)

- **Le canal d'ouverture** est gardé : `companies.declared_via` (`self` |
  `staff`, nullable), `prisma/schema/public/account.prisma:159`.
- **L'auteur ne l'est pas.** `Company` n'a ni `created_by` ni commercial
  attitré. Le seul fil est le fait `company.declared` dans
  `growth.activity_events` (acteur figé : `actor_id`, `actor_name`,
  `actor_role`), écrit **au mieux** par un abonné hors requête
  (`on-company-declared.handler.ts:27` — `void this.work.track`), l'acteur lu
  dans le contexte de la requête (`prisma-activity-recorder.ts:100`). Une
  trace d'audit, pas une donnée sur laquelle bâtir une page de pilotage.
- **Les avertissements** (`company-warnings.ts`) couvrent l'activation
  bloquée, l'attente ≥ 14 j, le mandat absent, le KBIS à vérifier. Ni
  « sans commande », ni « sans adresse de livraison », ni niveau.
- **Le journal** se lit par auteur et par période (`GET /admin/activity`,
  filtres `actorId`, `since`, `until`), réservé à l'admin (`activity`). Aucune
  agrégation par commercial ni récap du jour.
- **Les rôles** sont des lignes (`StaffRoleDefinition`), éditables à l'écran
  `/admin/staff-roles` ; aucun rôle « cheffe des commerciaux » n'existe dans
  le code.
- **Le registre RGPD** ne mentionne ni les colonnes d'acteur du journal, ni
  une finalité de suivi commercial.

## 3. Technique

### 3.1 Qui a ouvert, qui suit (migration additive)

- `companies.declared_by_staff_id` (nullable) et `declared_by_name` (figé,
  comme `activated_by_name`) : posés **dans la transaction** de
  `create-company-by-staff` et `create-sub-account`, depuis l'acteur de la
  commande — plus jamais déduits d'un journal écrit au mieux.
- `companies.followed_by_staff_id` (nullable) : le **commercial qui suit** la
  fiche. Vaut l'auteur à l'ouverture par l'équipe ; une fiche inscrite par le
  client n'en a pas tant que la cheffe ne l'attribue pas. Réattribuable par la
  cheffe (geste tracé, `company.follower_changed`).
- **Reprise** des fiches existantes : `declared_by_*` lu dans
  `growth.activity_events` (`company.declared`, acteur `staff`) ; sans trace,
  la colonne reste vide et la page dit « auteur inconnu » — jamais une
  valeur inventée. Script de reprise relu avant de tourner en production.

### 3.2 Le niveau de travail (domaine pur)

Un service de domaine `workLevelOf(input)` à côté de `company-warnings.ts`,
même forme (entrée projetée, sortie pure), testé cas par cas. Il rend le
niveau **et la liste de ce qui manque pour le suivant**. Les seuils (jours
avant le rouge) sont des constantes nommées, puis un réglage si la cheffe
veut les changer.

L'entrée lit ce que la projection des avertissements lit déjà, plus :
l'adresse de livraison, l'existence d'une première commande (un `EXISTS`, pas
un comptage), l'envoi de l'accès client.

### 3.2 bis Une mauvaise pratique, pas un manque : plusieurs adresses de livraison

Décidé par Hugo le 2026-11-14 : **une fiche qui porte plusieurs adresses de
livraison est signalée.** Le dépôt modélise un établissement de plus comme un
**site** (un sous-compte rattaché à son principal, `parentCompanyId`), pas
comme une adresse de plus : chaque site a ses commandes, ses tournées, son
retrait et sa facturation suivie ou non par le principal. Plusieurs adresses
sur une seule fiche font passer plusieurs lieux pour un seul — les tournées,
les étiquettes et la facture ne savent plus lequel est livré.

- Un avertissement `adresses_multiples` (adresses de livraison **non
  archivées** > 1), à côté de ceux de `company-warnings.ts`, visible sur la
  fiche, dans la liste des sociétés et sur la page de suivi.
- Le geste de sortie est nommé dans le texte : « créer un site par adresse ».
- Ce n'est pas un niveau : une fiche active peut le porter, et il ne bloque
  pas l'activation tant que Hugo n'en décide pas autrement.

### 3.3 La page

- `GET /admin/sales-oversight` (une lecture, `QueryBus`) : par commercial, les
  comptes par niveau et les fiches en retard ; la liste des manquements,
  filtrable (niveau, commercial, ancienneté) et paginée ; **le mur des
  données** : jamais d'e-mail ni de téléphone de prospect dans la réponse,
  seulement « présent / absent ».
- **Le récap du jour** : agrégé à la lecture depuis `growth.activity_events`
  (fiches ouvertes, montées de niveau, activations, rendez-vous) par acteur,
  sur la journée de Paris. Pas de nouvelle table.
- Une **ressource neuve** `b2b_sales_oversight` (lecture). Une migration
  ajoute la ressource, **jamais le droit** : la cheffe le reçoit à l'écran
  des rôles (règle du dépôt, `lint:no-role-grants-in-migrations`).
- Front : `apps/lfd-backoffice-frontend/src/app/commercial/suivi/`, fold-ng
  d'abord, chaque ligne mène à la fiche client.

### 3.4 RGPD — ce suivi porte sur des salariés

C'est un traitement de données personnelles **sur l'équipe**. Il est légitime
(piloter l'acquisition) et encadré :

- **Registre** (`documentation/legal/rgpd-registre.json`) : les colonnes neuves
  (`declared_by_*`, `followed_by_staff_id`) et les colonnes d'acteur de
  `growth.activity_events` (absentes aujourd'hui), avec la finalité « suivi de
  l'acquisition commerciale » et une durée de conservation ;
- **Accès** : la ressource `b2b_sales_oversight`, donnée à la cheffe et à
  l'admin, à personne d'autre ;
- **Information de l'équipe** : chaque commercial est informé, avant la mise
  en service, que ce suivi existe, ce qu'il montre et à qui. C'est aussi ce
  qui permet de s'en servir pour un recadrage.

## 4. Lots

1. **S1** — colonnes d'auteur et de suivi, posées à l'ouverture, reprise
   depuis le journal ; registre RGPD.
2. **S2** — le niveau de travail (domaine + projection), et la liste des
   manquements par niveau.
3. **S3** — la route, la ressource, la page (tableau par commercial +
   manquements).
4. **S4** — le récap du jour.
5. **S5** — réattribuer une fiche, et attribuer les inscriptions spontanées.

## 5. Questions pour Hugo

1. **Les seuils** : combien de jours au niveau Annuaire avant le rouge
   (7 proposé) ? au niveau Contactée (14 proposé) ?
2. **« Contactée »** : un nom ET un e-mail ou un téléphone suffit-il, ou faut-il
   une trace d'échange (rendez-vous, note du commercial) ?
3. **Le commercial attitré** : le crée-t-on (S1, S5), ou la page se contente-t-elle
   de l'auteur de l'ouverture ?
4. **La durée de conservation** des traces d'activité du staff (aucune n'est
   décidée aujourd'hui) : 12 mois proposé.
5. **Plusieurs adresses de livraison** : un avertissement seulement (proposé),
   ou un refus d'activation ?
6. **Qui voit** : la cheffe et l'admin seulement, ou chaque commercial voit-il
   aussi sa propre ligne ?
