# Plan — suivre les pros qui s'inscrivent seuls, et remettre Prospects au propre

> **P1 bâti, pas encore commité (2026-10-25).** Colonne `companies.declared_via`
> (migration `20261025200000_le_canal_de_declaration`, rattrapée depuis le
> journal), écrite par `Company.declare()` ; pièces du dossier lues sur la
> société (`dossierPieces`) ; filtre « Inscrit seul · dossier incomplet » de
> Comptes clients avec son pipeline (entonnoir, pièce par pièce, « bloqué
> depuis », bascule inscrits seuls / tous). E2e écrits, pas encore joués.

> **P3 bâti, pas encore commité (2026-10-25).** Prospects = les leads démarchés
> à une étape ouverte (`ProspectView` refait : établissement, contact,
> téléphone, e-mail, étape, depuis) ; `hot`/`mid` retirés de la file, du
> cockpit (plays `rescue`/`nurture` seules) et des stats (KPI, cohortes de
> sociétés, plus de bandes de chaleur) ; étage Activation retiré ; bouton
> « Ajouter un établissement démarché ». E2e écrits, pas encore joués.

> **Doc-first, 2026-10-25. Rien n'est bâti.** Demande de Hugo : « une table de
> suivi des pros qui ont attaqué leur processus d'inscription seuls » ; puis,
> après discussion : **pas de page neuve**, un filtre dans Comptes clients et
> les demandes abandonnées dans Prospects ; conservation **90 jours** ; et
> « mettre au propre la page Prospects, je ne sais pas à quoi sert _Ajouter un
> lead_ ». Ouvre une route publique qui écrit des données personnelles :
> `vitruve` avant Hugo (frontière de sécurité). Chemins relatifs à
> `apps/lfd-api/src/` sauf mention ; affirmations ouvertes le 2026-10-25.

## 0. Ce qui existe

**La porte pro** (`documentation/auth-inscription/plan-inscription-pro-seule.md`
§ 3.1) : `/ouverture-compte-pro` → prénom, nom, e-mail, téléphone, enseigne →
inscription chez Auth0 → au retour, `POST /me/establishment` déclare la
société `pending` (fait `company.declared`, `via: self`) → pièces (TVA, KBIS,
facturation, livraison, `company.step_reached`) → `company.activated`.

**Avant le retour d'Auth0, rien n'est écrit côté serveur** : le formulaire
voyage dans l'`appState` d'Auth0. Un pro qui abandonne chez Auth0 ne laisse
aucune trace.

**L'activation** (`b2b/growth/domain/activation.ts`, `deriveActivations`) dérive
du journal, par société déclarée : pièces franchies, jours bloqués, `self` /
`staff`. Elle est montrée en « second étage » de Prospects.

**Prospects** (`b2b/growth/application/queries/list-prospects.handler.ts`,
`b2b/growth/domain/prospect.ts`) fusionne deux files :

| Température | Ce que c'est, dans le code                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| `hot`       | une **personne** qui a commandé **sans société** (`order.placed` au `companyId` nul)                           |
| `mid`       | une personne inscrite (`user.registered`) qui n'a pas commandé                                                 |
| `cold`      | un lead **démarché**, saisi par « Ajouter un lead » (raison sociale, contact, e-mail, téléphone, SIRET, notes) |

🔴 **Le défaut** : `hot` et `mid` sont **des particuliers**. La projection date
d'avant l'e-commerce, quand toute personne inscrite était un futur pro ;
depuis que la boutique sert les particuliers, la file « Prospects » du
commercial est remplie de clients particuliers et de comptes ouverts pour
commander une baguette. C'est ce qui rend la page illisible.

**« Ajouter un lead »** (`commercial/prospects/lead-capture-panel/`) : le
commercial note un établissement rencontré ou appelé, qui n'a pas encore de
compte. Son e-mail sert de clé : si la personne s'inscrit ensuite,
`OnUserRegisteredLinkLead` rattache le lead à son compte et le **convertit**
(`b2b/growth/application/handlers/on-user-registered-link-lead.handler.ts`).
Les étapes « contacté, qualifié, en négociation » se posent depuis la ligne.

## 1. Ce que le plan fait

### 1.1 Comptes clients : un filtre « Inscrit seul · dossier incomplet »

Les sociétés `pending` déclarées `via: self`, avec deux colonnes venues de
`deriveActivations` : pièces (x/4) et « bloqué depuis ». Pas d'écran neuf.
L'étage « Activation » de Prospects disparaît : ses lignes sont des comptes,
elles vivent avec les comptes.

### 1.2 La demande d'ouverture, enregistrée avant Auth0

- **Route publique** `POST /public/pro-account-requests` : prénom, nom,
  e-mail, téléphone, enseigne — ce que le formulaire saisit déjà. Appelée au
  clic « Continuer », **avant** la redirection vers Auth0.
- **Un lead**, pas une table neuve : la demande crée (ou retrouve, par
  e-mail) un lead de **source `self_started`** — « ouverture de compte
  commencée ». Le rapprochement existant le convertit à l'inscription, sans
  code neuf (§ 0).
- **Protection de la route** : Turnstile (le formulaire public a déjà le
  modèle ? — **à vérifier au bâti**), limite de débit par IP à la passerelle,
  e-mail validé en forme, et **aucune réponse qui dise si l'e-mail est connu**
  (pas d'oracle d'existence de compte).
- **Phrase sous le formulaire** : « En continuant, vous acceptez que nous
  vous recontactions pour finaliser l'ouverture de votre compte. Ces
  informations sont effacées après 90 jours si le compte n'est pas créé. »
- **Effacement à 90 jours** : un balayage efface les leads `self_started`
  jamais convertis de plus de 90 jours (effacement réel des données
  personnelles, pas un archivage) ; inscrit au registre RGPD.

### 1.3 Prospects, remis au propre

Prospects devient **la file des établissements qui ne sont pas encore
clients**, et rien d'autre :

| File                    | Source                                               |
| ----------------------- | ---------------------------------------------------- |
| **Ouverture commencée** | les demandes `self_started` non converties (§ 1.2)   |
| **Démarchés**           | les leads saisis par le commercial (l'ancien `cold`) |

- **Sortent** : `hot` et `mid` (des particuliers), et l'étage Activation
  (des comptes, § 1.1). La projection `deriveProspects` n'a plus de lecteur
  à l'écran : à retirer si personne d'autre ne la lit (cockpit,
  statistiques — **à vérifier au bâti**, `growth-stats.ts` et
  `lead-score.ts` la citent).
- **Colonnes** : établissement, contact, téléphone, e-mail, source, étape
  (nouveau → contacté → qualifié → en négociation), « depuis ».
- **« Ajouter un lead » reste**, renommé **« Ajouter un établissement
  démarché »** — c'est le carnet du commercial pour ceux qu'il a rencontrés et
  qui ne sont pas prêts. **Question à Hugo** (§ 3, Q2) : si la commerciale
  ouvre toujours le compte elle-même par l'invitation client dès qu'un pro
  dit oui, ce carnet ne sert qu'à ceux qui disent « pas maintenant » —
  utile, ou à retirer ?

## 2. Ce qui devient irréversible

La valeur de source `self_started` dès le premier lead écrit ; la route
publique dès qu'un formulaire en production l'appelle.

## 3. Questions à Hugo

| #   | Question                                                                         | Défaut proposé                               |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| Q1  | Les particuliers (`hot`, `mid`) quittent Prospects : faut-il les voir ailleurs ? | Non : ce sont des clients, pas des prospects |
| Q2  | « Ajouter un établissement démarché » : le garder ?                              | Oui, renommé                                 |

## 4. Lots

| Lot    | Contenu                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------- |
| **P1** | Comptes clients : le filtre « Inscrit seul · dossier incomplet », l'étage Activation retiré              |
| **P2** | La demande d'ouverture : route publique protégée, lead `self_started`, phrase, effacement 90 j, registre |
| **P3** | Prospects remis au propre : deux files, colonnes, bouton renommé, `hot`/`mid` retirés                    |

## 5. Contradiction de `vitruve` (2026-10-25) — l'emporte sur les §§ 1 à 4

**P2 (la demande avant Auth0) coûte bien plus que le plan ne le disait** :

- **pas de colonne `source`** sur `growth.leads` (`prisma/schema/growth.prisma`) :
  une migration, une factory, un mapper ;
- **une route publique réécrirait le carnet du commercial** :
  `findOpenByEmail` retrouve un lead démarché du même e-mail — écraser ou
  perdre la saisie, et la réponse fixe le contrat de la route ;
- **l'effacement à 90 jours n'a pas de périmètre** : le journal garde
  `lead.captured` (enseigne, libellé), `growth.lead_score` stocke le libellé,
  l'exception au « pas de DELETE physique » n'est pas écrite, aucun
  ordonnanceur ; `lint:rgpd-staff` ne couvre pas les leads ;
- **Turnstile n'existe pas dans le dépôt**, et la limite de débit de la
  passerelle est inerte (`gateway/src/traffic.ts`) : sans vérification, on
  peut inscrire les coordonnées d'un tiers et le faire rappeler — le
  « consentement » de la phrase serait celui de personne ;
- **la conversion par e-mail rate** un pro qui change d'adresse chez Auth0
  ou passe par Google, et convertit à `user.registered` un pro qui abandonne
  **avant** de déclarer son établissement — le cas même qu'on voulait suivre.

**P1 et P3 tiennent, mais plus grands** :

- **P1** : `via: self` n'existe que dans le journal ; la liste paginée de
  Comptes clients ne peut pas le lire sans traverser `growth`. Il faut une
  colonne `declared_via` sur la société (migration additive, rattrapée depuis
  le journal).
- **P3** : retirer `hot`/`mid` de l'écran ne suffit pas — `lead-score.ts`
  met des particuliers dans les « 5 meilleurs coups » du cockpit, et
  `growth-stats.ts` les compte. Le nettoyage couvre le cockpit et les
  statistiques.

**Recommandation révisée** : bâtir **P1 et P3** ; **ne pas bâtir P2 sous
cette forme**. Si suivre l'abandon avant Auth0 compte vraiment, le faire
par une identité **vérifiée** : la porte pro demande d'abord l'e-mail et
envoie un code (la connexion par code existe), puis seulement les
coordonnées — une personne authentifiée, pas une route publique, et
l'abandon se lit comme « compte créé, établissement non déclaré ».

## 6. Décisions de Hugo (2026-10-25)

- **P1 et P3 se bâtissent**, dans la forme du § 5 (colonne `declared_via`,
  nettoyage jusqu'au cockpit et aux statistiques).
- **P2 n'est pas bâti** : on ne garde rien de qui abandonne avant d'avoir
  créé son compte.
- **Q1** : les particuliers sortent du poste commercial (Prospects, cockpit,
  statistiques commerciales). **Q2** : « Ajouter un lead » reste, renommé
  « Ajouter un établissement démarché ».
- **Les pièces se comptent sur 3** (TVA, KBIS, facturation) ; l'adresse de
  livraison est montrée **à part** (Hugo, 2026-10-25) : `activationGate` ne
  l'exige plus, et la compter ferait lire « 3/4 » à un dossier activable.
  L'API garde `delivery` dans `piecesReached` : c'est un fait ; l'écran choisit.
