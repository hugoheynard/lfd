# Onboarding & provisioning B2B — design

> Comment un client entre dans la plateforme B2B. **Deux portes d'entrée, un
> seul pipeline** : le prospect s'inscrit seul **et** le commercial provisionne —
> les deux alimentent le même dossier, validé manuellement côté commercial.
>
> Décidé le **2026-07-29**. Prérequis lus : [`architecture-identite-auth-tenancy.md`](architecture-identite-auth-tenancy.md)
> (Auth0 = auth, DB = identité/authz, mur `company_id`) et
> [`auth0-setup-b2b.md`](auth0-setup-b2b.md) (config tenant).
>
> ⚠️ **Partiellement remplacé le 2026-07-30** par la chaîne compte / entreprises —
> lire l'[amendement en §0](#0-amendement-2026-07-30--la-personne-avant-la-société)
> **avant** le reste de ce document. Ce qui suit garde son intérêt pour la
> validation commerciale et la porte B (provisioning), mais le moment où la
> société est collectée, et la relation personne ↔ société, ont changé.

---

## 0. Amendement 2026-07-30 — la personne avant la société

**Ce qui a changé, et pourquoi.** Le modèle d'origine faisait d'une personne et de
sa société une seule et même chose : `users.company_id` était `NOT NULL`, donc
tout compte portait exactement une société, et « je me suis inscrit mais je n'ai
pas encore déclaré d'entreprise » était **irreprésentable**. C'est aussi ce qui
imposait de collecter la société **au signup** : il n'y avait pas d'état où le
compte pouvait exister sans elle.

La chaîne livrée sépare les deux :

|                             | Avant                              | Maintenant                                         |
| --------------------------- | ---------------------------------- | -------------------------------------------------- |
| Relation personne ↔ société | `users.company_id` (exactement 1)  | table `memberships` (**0..N**)                     |
| Rôle                        | `users.role`                       | `memberships.role` — propre à chaque société       |
| Profil de la personne       | seulement `email`                  | `first_name`, `last_name`, `email`, `phone`        |
| Société collectée           | **au signup**                      | par une action explicite, dans « Mes entreprises » |
| `GET /me`                   | `Principal` plat, avec `companyId` | `{ profile, companies[] }`                         |
| Écrans                      | « Mon profil » (société + contact) | Réglages → **Mon profil** · **Mes entreprises**    |

Conséquences à retenir :

- **Le `Principal` n'a plus de `companyId`.** Un endpoint muré ne peut donc plus
  déduire son tenant de l'utilisateur : il doit **recevoir** la société visée et
  la vérifier contre les `memberships` du demandeur. Reconstruire « la première
  société » serait exactement le raccourci qui fuit. Aucun endpoint métier n'est
  encore muré ; le premier (commandes, adresses) devra porter ce choix.
- **`CompanyStatus` gagne `pending`**, qui devient le **défaut**. Une société
  n'est jamais cliente parce qu'elle a été saisie : la décision « activation
  manuelle côté commercial » du §2 est donc **conservée intacte**, simplement
  déplacée après la déclaration au lieu d'après le signup.
- **Le créateur devient `company_admin`** de la société qu'il déclare, dans la
  même transaction. Une société sans membre n'appartiendrait à personne et
  disparaîtrait de « Mes entreprises » sans recours.
- **Le contact principal de la société est repris du profil du créateur** — pas
  redemandé au formulaire. Il reste modifiable ensuite.
- **Point ouvert du §8 tranché** au passage : une personne **peut** appartenir à
  plusieurs sociétés (c'est ce que les onglets de « Mes entreprises » rendent).
  Le flux « rejoindre une société existante » (invitation intra-société) reste à
  faire ; seule la création par son propre auteur est implémentée.
- **`POST /onboarding` et le `/me` discriminé par état d'accès (§5) ne sont pas
  implémentés** et ne le seront probablement pas sous cette forme : « aucune
  entreprise » remplace l'état `onboarding`, et le front y répond par l'empty
  state de « Mes entreprises » plutôt que par un écran d'onboarding dédié. Le
  gating du catalogue pour un client non validé (§2) reste, lui, à faire.
- **Changement d'e-mail** : Auth0 est propriétaire de l'e-mail de connexion. Il
  est propagé via la Management API **avant** l'écriture locale, et une
  application M2M doit être créée côté tenant (`AUTH0_M2M_CLIENT_ID` /
  `AUTH0_M2M_CLIENT_SECRET`, scopes `read:users` + `update:users`). Sans elle,
  l'API démarre normalement et seule l'édition de l'e-mail est refusée.

Code : `apps/lfc-B2B-platform-backend/src/account/` (contexte DDD + bus CQRS),
`apps/lfc-B2B-platform-frontend/src/app/account/` et `.../entreprises/`.

---

## 1. Le principe : signup ≠ accès client

Rappel du modèle DB-autoritaire : Auth0 prouve « tu possèdes cet email »
(`sub`) ; **notre** base décide « tu es client de telle société, avec tel
accès ». Un `register` Auth0 crée un utilisateur **dans Auth0**, jamais dans
notre Postgres.

En B2B de gros, devenir « client » = **une société** avec conditions négociées
(délais de paiement, grille tarifaire, TVA). On ne laisse donc pas un email
s'auto-attribuer une société et l'accès commande. Le self-signup est **autorisé**
mais **gated** : il produit un **dossier en attente**, pas un client actif.

---

## 2. Décisions (verrouillées 2026-07-29)

| Sujet                                        | Décision                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-signup autorisé ?                       | **Oui** — le prospect peut s'inscrire seul.                                                                                                                                     |
| Accès d'un compte **non validé** (`pending`) | **Catalogue en lecture seule** — parcourt le catalogue **sans prix ni commande** tant qu'il n'est pas activé.                                                                   |
| Infos société collectées quand ?             | **Au signup** — un formulaire d'onboarding crée une `Company` en état `pending` (raison sociale, SIRET, TVA, contact) déclarée par le prospect.                                 |
| Activation `pending → active`                | **Manuelle, côté commercial** (« activation commerciale »). Jamais automatique.                                                                                                 |
| Gestion du dossier                           | **Par les deux bouts** — le prospect le déclare/complète ; le commercial peut aussi l'initier, le pré-remplir, le corriger. Seule la **validation** est réservée au commercial. |
| Connection Auth0                             | Une connection dédiée **`lfc-b2b-customers`** (isolée des autres apps du tenant), activée seulement sur l'app SPA B2B.                                                          |

---

## 3. Machine à états

Un **User** local et sa **Company** portent chacun un statut. Le « pas de ligne
en base » (sub Auth0 connu, aucun `User` chez nous) est un état à part entière :
`onboarding`.

```mermaid
stateDiagram-v2
    [*] --> onboarding : login, sub inconnu en base
    onboarding --> pending : POST /onboarding (déclare la société)
    note right of onboarding
      Prospect authentifié Auth0
      mais aucune ligne User locale.
      Front → formulaire onboarding.
    end note

    [*] --> invited : commercial provisionne (back-office)
    invited --> pending : le prospect complète le dossier
    invited --> active  : commercial crée déjà validé

    pending --> active : ACTIVATION COMMERCIALE (manuelle)
    active --> disabled : révocation (kill-switch)
    disabled --> [*]

    note right of pending
      User pending + Company pending.
      Accès = CATALOGUE LECTURE SEULE
      (pas de prix, pas de commande).
    end note
    note right of active
      Validé. Accès complet
      (prix, commandes).
    end note
```

**User.status** : `invited` (créé par le commercial, pas encore de dossier
complété) · `pending` (dossier déclaré, en attente de validation) · `active`
(validé) · `disabled` (révoqué). **Company.status** : `pending` (déclarée, pas
validée) · `active` (validée) · `suspended` (plus tard).

> `onboarding` n'est PAS un `User.status` : c'est l'**absence** de ligne `User`
> pour un `sub` Auth0 valide. Le premier `POST /onboarding` matérialise la ligne.

---

## 4. Les deux portes → un pipeline

```mermaid
flowchart TD
    subgraph Prospect["Porte A — self-signup (prospect)"]
      A1[Register Auth0<br/>connection lfc-b2b-customers] --> A2[Login → GET /me<br/>status: onboarding]
      A2 --> A3[Formulaire société<br/>POST /onboarding]
      A3 --> A4[Company pending<br/>+ User pending]
    end

    subgraph Sales["Porte B — provisioning (commercial)"]
      B1[Back-office : crée/pré-remplit<br/>Company + invite User] --> B2[User invited<br/>+ Company pending/active]
    end

    A4 --> V{Dossier pending}
    B2 --> V
    V -->|ACTIVATION COMMERCIALE| ACT[Company active<br/>User active]
    ACT --> FULL[Accès complet : prix + commandes]

    A4 -.lecture seule.-> CAT[Catalogue sans prix]
```

Le **dossier** = la `Company` (pending) + son/ses `User`. Les deux bouts lisent
et écrivent ce dossier ; la transition `pending → active` est **commerciale**.

---

## 5. Contrat `GET /me` — état d'accès discriminé

Aujourd'hui `/me` renvoie un `Principal` plat ou `401`. On le fait évoluer vers
un **état d'accès** discriminé par `status`, qui pilote le routage front :

| Cas backend                           | Réponse `/me`                              | Front                                                        |
| ------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| Token valide, **aucune** ligne `User` | `200 { status: "onboarding" }`             | Formulaire d'onboarding                                      |
| `User.status = pending`               | `200 { status: "pending", user, company }` | Catalogue lecture seule (bandeau « en cours de validation ») |
| `User.status = active`                | `200 { status: "active", ...principal }`   | App complète                                                 |
| `User.status = disabled`              | `401`                                      | Retour login (révocation)                                    |

La **garde** de sécurité reste inchangée (un token valide = authentifié) ;
l'`état d'accès` n'est qu'une **autorisation applicative**, portée par la base.
Le resolver ne rejette plus « sub inconnu » : il renvoie `onboarding`.

---

## 6. Endpoints (backend B2B)

| Méthode                                 | But                        | Auteur                   | Effet                                                                             |
| --------------------------------------- | -------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `GET /me`                               | état d'accès               | user connecté            | lecture (cf. §5)                                                                  |
| `POST /onboarding`                      | déclarer sa société        | prospect (`onboarding`)  | crée `Company(pending)` + `User(pending)`, lie `sub`+email ; idempotent par `sub` |
| `POST /companies/:id/activate`          | **activation commerciale** | commercial (back-office) | `Company → active`, ses `User pending → active`                                   |
| `POST /companies` · `POST /invitations` | provisioning porte B       | commercial (back-office) | crée le dossier / invite (porte B)                                                |

Le catalogue en lecture seule pour `pending` se gate **des deux côtés** : le
backend ne sert pas les prix et refuse toute création de commande à un non-`active`
(invariant), le front masque prix/commande.

> Les endpoints commerciaux (`/companies/*`, `/invitations`) vivent dans le
> **back-office staff** (contexte séparé, DB staff) — pas dans l'API customer.
> Voir la frontière staff/customer de [`architecture-identite-auth-tenancy.md`](architecture-identite-auth-tenancy.md).

---

## 7. Plan d'implémentation (phases)

- **Phase 0 — Auth0** _(toi, dashboard)_ : connection dédiée `lfc-b2b-customers`,
  activée seulement sur l'app SPA B2B ; ouvrir les sign-ups sur cette connection.
- **Phase 1 — backend model** : ajouter `pending` à `CompanyStatus`/`UserStatus` ;
  resolver → renvoie `onboarding` au lieu de rejeter ; contrat `/me` discriminé ;
  `POST /onboarding` (crée Company+User pending) ; invariant « commande réservée
  aux `active` ». Tests colocalisés.
- **Phase 2 — frontend** : router sur l'état d'accès — écran onboarding
  (formulaire société), catalogue lecture seule + bandeau pour `pending`, app
  complète pour `active`.
- **Phase 3 — back-office (porte B + activation)** : app staff — liste des
  dossiers `pending`, validation (activation commerciale), création/invitation.
  Contexte + DB séparés ; vient après.

---

## 8. Points ouverts

- **Company en lecture seule pour `pending`** : catalogue visible **sans prix**,
  ou avec prix « publics » indicatifs ? (défaut retenu : **sans prix**.)
- **Un prospect = une nouvelle Company** systématiquement, ou possibilité de
  **rejoindre une Company existante** (2ᵉ user d'une même société) ? Le self-signup
  crée par défaut une nouvelle société ; le rattachement d'un collègue à une
  société déjà cliente est un flux distinct (invitation intra-société, plus tard).
- **Dé-duplication SIRET** : deux prospects déclarant le même SIRET → fusion /
  alerte côté commercial à la validation (non tranché).
