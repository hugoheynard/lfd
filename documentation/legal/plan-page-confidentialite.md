# Plan — la page publique « Politique de confidentialité »

> **État au 2026-09-29 : 🔨 P3 commité (`3cbc2c4d4`), P2 commité, P4
> abandonné, rien de déployé.** Le point complet et ce qui manque pour être
> conforme : **§9**. Contredit par `vitruve` le
> 2026-09-29 (§4.5). Ouvert le 2026-09-29 : la soumission de
> l'app sur Meta for Developers (connexion Facebook) refuse sans **URL de
> politique de confidentialité** ni **suppression des données utilisateur**.
> Le texte à publier part du modèle que Hugo a collé le même jour ; ce plan dit
> **où il vit**, **comment la page est servie**, et **ce qui doit changer dans
> le modèle** pour qu'il décrive l'app réelle.
>
> ⚠️ Ce n'est pas un avis juridique. L'app traite des paiements : le texte final
> se fait relire.

---

## 0. Ce que Meta demande

| Champ Meta                   | Ce qu'il faut                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Icône de l'app (1024 × 1024) | **Existe** : `apps/lfc-ecommerce-frontend/resources/icon.png`, 1024 × 1024 (vérifié).             |
| Catégorie                    | **Shopping** (« Achats ») : une boutique en ligne, particuliers et pros.                          |
| URL de la politique          | Une page **publique**, lisible **sans connexion**, qui répond **200** avec le texte dans le HTML. |
| Suppression des données      | L'option « URL d'instructions » : la même page, ancrée sur la section de suppression.             |

La seconde option de Meta — une **URL de rappel** qui reçoit un `signed_request`
et supprime d'elle-même — est écartée pour l'instant (§6).

---

## 1. Ce qui existe

Ouvert le 2026-09-29.

| Fait                                                                                                                                                                                                                                                 | Où                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| La politique de confidentialité **existe comme document légal** : un des cinq (`legalNotice`, `salesTerms`, `privacy`, `cookies`, `accessibility`), rédigé dans le back-office.                                                                      | `apps/lfd-api/src/b2b/content/`, `packages/contracts/src/legal-document.ts` |
| Un document = un **titre** et des **paragraphes** (titre + corps), en **fr / en / it**. Chaque paragraphe a un **id ULID** donné par le serveur, jamais dérivé du titre.                                                                             | `legalDocumentSchema`, `legalDocumentParagraphSchema`                       |
| Il est servi **en public**, sans jeton : `GET /content/legal/:mention` (throttle 60/min, mention inconnue → 404).                                                                                                                                    | `platform-content.controller.ts`                                            |
| La boutique l'affiche **dans une fenêtre** ouverte depuis le pied de page ; depuis P3, `/confidentialite` le rend aussi en HTML.                                                                                                                     | `client/legal-document-panel/`, `client/foot/`                              |
| La boutique est un **SPA statique** sur Cloudflare Pages (`outputMode: static`, `ssr: false`), avec un repli `_redirects` vers `index.html`.                                                                                                         | `angular.json`, `DEPLOYMENT-CLOUDFLARE.md`, `public/_redirects`             |
| Connexion client : **Auth0**, par **passkey** ou **mot de passe** (Hugo, 2026-09-29 — tenu par Auth0, jamais par nous) ; **Google** comme méthode sociale. **Facebook est reporté** : sa ligne est prête, activée « le jour où le tenant l'active ». | `auth/auth.config.ts`, `account/login-methods.ts` (`ADDABLE_PROVIDERS`)     |
| **Aucun bouton « Supprimer mon compte »** dans la boutique, ni commande côté API (cherché : `deleteAccount`, « supprimer mon compte »).                                                                                                              | —                                                                           |
| **Aucun bandeau de consentement aux cookies** trouvé dans la boutique.                                                                                                                                                                               | —                                                                           |

---

## 2. La décision principale : le texte vit au back-office, la page le rend

**Un seul texte**, celui du document `privacy`. La page publique et la fenêtre
du pied de page lisent la même source ; corriger une phrase au back-office la
corrige partout. Écrire le texte en dur dans une page le ferait diverger de la
fenêtre au premier correctif — exactement ce que le document légal existe pour
empêcher.

## 3. Comment la page est servie — le piège du SPA

Un SPA statique renvoie, pour `/confidentialite`, **le même `index.html` vide**
que pour toute autre adresse ; le texte n'apparaît qu'après exécution du
JavaScript et un appel à l'API. Un robot qui ne l'exécute pas lit une page sans
contenu. Meta vérifie la page par robot : c'est le risque de refus.

| Option                                                                                                                                   | Pour                                                                                      | Contre                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **A. Une Pages Function** (à créer dans un dossier `functions` du projet Pages) : elle lit `GET /content/legal/privacy` et rend du HTML. | HTML complet, **toujours à jour**, même domaine, rien à redéployer quand le texte change. | Premier fichier `functions/` du projet : le déploiement Pages doit l'emporter (à vérifier). |
| **B. Une route Angular** `/confidentialite` dans le SPA.                                                                                 | Aucune infrastructure nouvelle.                                                           | Contenu invisible sans JavaScript : **ne règle pas le problème de Meta**.                   |
| **C. Un HTML statique** généré au build depuis l'API.                                                                                    | Simple à servir.                                                                          | Périmé dès que le texte change au back-office, jusqu'au déploiement suivant.                |

**Recommandation : A pour Meta, B en plus pour les humains** — la route Angular
ouvre le même document en pleine page depuis la boutique (le pied de page peut
y lier), et la Function répond à l'adresse publique. Si A et B visent la même
adresse, c'est la Function qui gagne : Pages sert une Function avant le repli
`_redirects`. **À vérifier au bâti** : ce comportement, et que le workflow de
déploiement emporte bien `functions/`.

La page rendue par la Function :

- langue française par défaut, `lang="fr"` ;
- un `<h2>` par paragraphe, dont l'`id` est l'**ancre** (§4) ;
- corps échappé (aucun HTML venu du back-office n'est interprété) ;
- « Dernière mise à jour » = `updatedAt` du document, pas une date écrite à la main ;
- `Cache-Control` court (quelques minutes) : un correctif doit se voir vite ;
- si l'API ne répond pas : **503** avec un message lisible, jamais une page vide en 200.

## 4. L'ancre `#suppression-des-donnees` — une section REQUISE, pas un champ libre

> Révisé le 2026-09-29 (Hugo : « on aurait pas mieux fait d'avoir un
> paragraphe obligatoire pour la suppression des données ? »). La première
> version proposait un champ `anchor` libre, saisi au back-office : il se
> vide, il se supprime avec son paragraphe, et le lien donné à Meta meurt sans
> que rien ne le dise. Meta ne pointe pas « une ancre que quelqu'un a tapée »,
> il pointe **la section de suppression** — une obligation, donc une structure.

### 4.1 Ce qui existe et contraint la forme

Ouvert le 2026-09-29.

- Le document est une colonne **JSON** (`platform_content.content`), relue par
  `legalDocumentSchema` ; un contenu **illisible retombe en silence** sur
  `DEFAULT_LEGAL_DOCUMENT` — un titre, **zéro paragraphe**
  (`prisma-platform-content.repository.ts`, `parseLegalDocument`). Un champ
  ajouté doit donc être **facultatif** au schéma : obligatoire, il ferait
  échouer la relecture des lignes existantes, et le document de production
  s'afficherait **vide**.
- Un document sans ligne en base se lit aussi comme ce contenu de départ vide.
- L'agrégat `LegalDocument` (`b2b/content/domain/entities/legal-document.ts`)
  porte `removeParagraph` : c'est là qu'un refus se pose.

### 4.2 La conception

- **Une clé de section**, facultative, sur le paragraphe : `section?:
LegalSectionKey`. Vocabulaire **fermé**, dans le contrat : aujourd'hui
  `dataDeletion` seul.
- **Des sections requises par mention**, écrites une fois dans le contrat :
  `privacy → [dataDeletion]`, les autres → `[]`. Les CGV pourront exiger
  `withdrawal` (droit de rétractation) le jour venu, sans nouveau mécanisme.
- **L'ancre dérive de la clé**, jamais de la saisie :
  `dataDeletion → suppression-des-donnees`. Elle ne change pas avec la langue
  (la page publique est en français, et Meta reçoit une URL).
- **L'agrégat refuse** de supprimer un paragraphe qui porte une clé requise
  (`BusinessError`, message qui dit quoi faire : « Cette section est exigée
  par la politique de confidentialité : modifiez son texte, elle ne se
  supprime pas. »). Il refuse aussi **deux paragraphes de même clé**.
- **Créer la section** : une commande `AddRequiredSection(mention, section)`,
  qui pose le paragraphe avec un texte de départ dans les trois langues, et
  refuse si elle existe déjà. Le back-office montre, tant qu'elle manque, un
  encadré « Section requise manquante : Suppression des données » avec le
  bouton qui la crée. Un paragraphe requis s'affiche avec un badge « Requis »
  et sans bouton Supprimer ; son texte se modifie, il se déplace.
- **La page publique** met `id="suppression-des-donnees"` sur ce paragraphe ;
  les autres gardent leur id ULID.

### 4.3 Pourquoi pas une migration de données

Poser la section **par migration** (réécrire le JSON de production pour y
ajouter le paragraphe) garantirait sa présence dès le déploiement. Mais :

- c'est du SQL qui réécrit une colonne JSON validée par un schéma TypeScript :
  la moindre forme fausse fait retomber le document de production sur **zéro
  paragraphe**, en silence (§4.1) ;
- le texte à y mettre est **juridique** : un texte de migration serait un
  texte provisoire publié.

Le geste explicite du back-office (« Créer la section ») coûte un clic à
Hugo, une fois, et n'écrit que par l'agrégat. **Pas de migration de données.**
Ce qui est structurel, c'est l'**impossibilité de la retirer** une fois posée.

### 4.4 Ce qui reste un risque, dit

Tant que la section n'a pas été créée, `#suppression-des-donnees` ne mène
nulle part : la page s'ouvre en haut. Le back-office le dit ; la Function peut
aussi journaliser l'absence. Meta ne doit recevoir l'URL qu'**après** la
création de la section.

### 4.5 Les objections de `vitruve` (2026-09-29), et ce qu'elles changent

| #   | Objection                                                                                                                                                                                   | Reprise                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `editParagraph` reconstruit le paragraphe depuis la charge utile (`legal-document.ts:92`) : la première correction du texte **efface la clé**, la section redevient supprimable.            | `editParagraph` **garde** `section`. Test de non-régression : éditer une section requise la laisse requise.                                                                                                                                                                             |
| B2  | Aucune concurrence optimiste : `saveLegalDocument` fait un `upsert` du JSON entier sans condition de révision. Un onglet ouvert AVANT la création de la section la réécrit sans elle.       | **Chaque commande porte la révision qu'elle a lue** ; l'enregistrement est conditionné (`WHERE revision = attendue`), refus 409 lisible sinon (« Quelqu'un a modifié ce document pendant que vous l'aviez ouvert : rechargez »). Vaut pour les cinq documents, pas seulement `privacy`. |
| B3  | Le repli silencieux sur un document vide existe aussi au **chargement pour écrire** (`loadLegalDocument`) : un contenu illisible + une commande = la politique de production réécrite vide. | Charger **pour écrire** un contenu illisible **refuse** (`TechnicalError`, rien n'est écrit). La lecture publique garde son repli. Le refus « deux paragraphes de même clé » vit dans l'**agrégat**, jamais dans le `refine` de relecture.                                              |
| S1  | Retour arrière : Zod retire les clés inconnues ; une ancienne instance ou un P2 annulé réécrit le document sans `section`.                                                                  | Dit : **irréversible** une fois une écriture faite par une version antérieure. Après un retour arrière, recréer la section avant toute autre modification. Le déploiement de l'API n'est pas vérifié progressif — à vérifier au bâti.                                                   |
| S2  | Où vit `section` : sur la charge utile, les routes POST/PUT permettraient à tout client de poser ou retirer la clé.                                                                         | `section` est au **schéma stocké et à la vue seulement**, jamais dans `legalDocumentParagraphPayloadSchema`. Seule `AddRequiredSection` la pose.                                                                                                                                        |
| S3  | `AddRequiredSection` poserait un « texte de départ » : un texte juridique provisoire publié — l'objection même faite à la migration.                                                        | **Pas de texte de départ.** Le bouton ouvre le formulaire d'un paragraphe (titre + corps, trois langues) ; la section naît avec le texte que le rédacteur saisit.                                                                                                                       |
| S4  | Le semis ne rejoue que `SetTitle` / `AddParagraph` : une base de développement n'aura jamais la section.                                                                                    | Le semis crée la section `dataDeletion` de `privacy` par `AddRequiredSection`.                                                                                                                                                                                                          |
| S5  | L'URL d'instructions de Meta doit décrire un **geste réel**, et aucun n'existe (§6) ; la Function ignore en silence un paragraphe incomplet.                                                | La soumission à Meta **dépend aussi de Q1** (§7). La Function journalise (`console.warn`, lu dans les journaux Pages) une politique **sans** section `dataDeletion` et tout paragraphe écarté.                                                                                          |
| S6  | Le rendu de P3 pose `id=ULID` ; il doit lire `section`.                                                                                                                                     | Le rendu fait partie de P2 : `id="suppression-des-donnees"` sur la section, ULID ailleurs.                                                                                                                                                                                              |

---

## 5. Le texte : ce qui change par rapport au modèle

Le modèle collé est une bonne base. Ce qui suit est ce qui **ne décrit pas
l'app** et doit être corrigé avant publication.

### 5.1 Ce qui est faux pour l'app

| Passage du modèle                                                | Réalité                                                                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| « Création de compte classique — mot de passe (stocké chiffré) » | Le mot de passe existe, mais c'est **Auth0** qui le conserve (haché), jamais nous ; la **passkey** aussi. Écrire les deux, et qui garde quoi. |
| « Connexion avec Facebook »                                      | **Pas encore active** (reportée). La garder, puisque la soumission Meta sert à l'activer ; ajouter **Google**, qui l'est déjà.                |
| « Depuis l'app : Mon compte > Supprimer mon compte »             | **Le bouton n'existe pas** (§1). Retirer cette voie, ou la bâtir d'abord (§6).                                                                |
| « mots de passe stockés de façon sécurisée » (section sécurité)  | Même correction : aucun mot de passe n'est stocké **par nous**.                                                                               |
| « L'app utilise uniquement les cookies nécessaires »             | **À vérifier** : aucun bandeau trouvé ; confirmer qu'aucun outil de mesure d'audience ne tourne sur la boutique avant de l'écrire.            |

### 5.2 Les prestataires réels

| Prestataire              | Rôle                                                                                      | Localisation                                 |
| ------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------- |
| Auth0 (Okta)             | Authentification : mot de passe, passkey, connexion Google (et Facebook une fois activée) | **à confirmer** (région du tenant)           |
| Meta Platforms Ireland   | Connexion avec Facebook, une fois activée                                                 | UE, transferts possibles vers les États-Unis |
| Google                   | Connexion avec Google                                                                     | **à confirmer**                              |
| Cloudflare               | Hébergement de la boutique, de l'API et des documents (R2)                                | **à confirmer**                              |
| Prisma (Prisma Postgres) | Base de données                                                                           | **à confirmer** (région)                     |
| Resend                   | Envoi des e-mails                                                                         | **à confirmer**                              |
| Stripe                   | Paiement en ligne                                                                         | **à confirmer**                              |

### 5.3 Les données réellement collectées — à confirmer avec Hugo

À partir de ce que l'app manipule : identité (nom, prénom, e-mail, téléphone),
pour les pros la **société** (raison sociale, SIRET, TVA, adresses de
facturation et de livraison), les **commandes** et leurs **factures**, les
**créneaux de retrait**, la **fidélité**, et les **journaux techniques**
(adresse IP côté passerelle). Le RIB d'un pro (prélèvement) est une donnée à
nommer s'il est collecté.

### 5.4 Les durées de conservation

Celles du modèle (compte 3 ans sans connexion, factures 10 ans, journaux 12 mois,
prospection 3 ans) sont **des propositions, pas l'état du code** : l'app ne
purge aujourd'hui ni les comptes inactifs ni les journaux. Écrire une durée
qu'aucun mécanisme n'applique, c'est promettre ce qu'on ne tient pas. Soit on
bâtit les purges, soit on écrit ce qui est vrai.

### 5.5 Ce que seul Hugo peut fournir

- raison sociale, forme juridique, capital ;
- RCS (ville) et SIREN ;
- adresse du siège ;
- adresse e-mail dédiée (ex. `confidentialite@…`) ;
- le **domaine public** de la boutique (pour l'URL donnée à Meta).

---

## 6. La suppression des données — le geste réel

Le modèle promet « suppression sous 30 jours et confirmation ». Aujourd'hui,
**aucun outil** ne supprime un compte client ; et le dépôt refuse le DELETE
physique sur les agrégats métier (CLAUDE.md §3). Il faut donc décider du geste
avant de le promettre :

- **Ce qui est effaçable** : l'identité de la personne (nom, e-mail, téléphone),
  son lien Auth0, ses méthodes de connexion.
- **Ce qui ne l'est pas** : les factures et les commandes facturées (10 ans,
  obligation comptable), les journaux d'audit déjà écrits.
- **Donc** : une **anonymisation** du compte, pas une suppression — la personne
  disparaît, la commande reste, rattachée à un client anonyme.

Deux voies, par ordre de coût :

1. **Par e-mail, traité à la main** : la page le dit, l'équipe l'exécute. Il
   faut alors un **geste d'anonymisation au back-office** (il n'existe pas) —
   sans lui, la promesse ne se tient qu'en SQL, et le runbook interdit ce
   genre de geste sur la production.
2. **Un bouton « Supprimer mon compte »** dans la boutique, qui appelle la
   même anonymisation. Plus tard, le **rappel de suppression Meta**
   (`signed_request`) pourrait déclencher le même geste.

⚠️ Ce chantier (l'anonymisation) touche au **mur tenant** et aux **données
réelles** : il passera par `vitruve` avant d'être bâti. Il n'est pas dans ce
plan.

---

## 7. Les lots

| Lot                  | Contenu                                                                                                                                                                                                                                                                                                                                      | Qui                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **P1**               | Le texte : remplir les crochets (§5.5), corriger le modèle (§5.1–5.4), le saisir au back-office dans le document `privacy`, en fr/en/it.                                                                                                                                                                                                     | Hugo (+ relecture juridique) |
| **P2** ✅ 2026-09-29 | Sections requises (§4.2, §4.5) : clé `section` au schéma stocké, `editParagraph` qui la garde, refus dans l'agrégat, révision attendue sur toutes les commandes, chargement pour écrire qui refuse l'illisible, `AddRequiredSection` sans texte de départ, semis, badge et encadré au back-office, ancre et journalisation dans la Function. | `batisseur` + `pablo`        |
| **P3** ✅ 2026-09-29 | La Pages Function `/confidentialite` (§3A) ; vérification sans JavaScript (`curl`) et en navigation privée.                                                                                                                                                                                                                                  | `batisseur`                  |
| **P4** ❌ abandonné  | ~~La route Angular `/confidentialite`~~ — Hugo, 2026-09-29 : « je préfère mon dialog ». La boutique garde la fenêtre du pied de page ; `/confidentialite` ne sert qu'à Meta et aux liens externes.                                                                                                                                           | —                            |

P1 ne dépend de rien. Pour soumettre à Meta : **Q1 tranchée et la procédure
de suppression réellement exécutable**, P2 déployé, la section créée au
back-office avec son texte (P1), puis l'URL donnée à Meta.

---

## 8. Questions ouvertes

- **Q1** — La voie de suppression tient-elle par e-mail seul au lancement, en
  s'engageant à bâtir l'anonymisation (§6) ? Ou attend-on l'outil ?
- ~~**Q2** — Le domaine public~~ : la boutique est servie à la racine de
  `lafoliecoffee.info` depuis le 2026-09-15 — URL Meta :
  `https://lafoliecoffee.info/confidentialite`.
- **Q3** — Aucun outil de mesure d'audience sur la boutique ? (§5.1, cookies)
- **Q4** — Le texte en anglais et en italien : traduit par nous, ou la page
  Meta ne sert que le français ?

---

## 9. Où on en est, et ce qui manque pour être conforme (2026-09-29)

### 9.1 Fait

| Quoi                                                                                                                                                                                                                                                                                                            | État                                                      | Où                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Texte de la politique, écrit pour l'app réelle (mot de passe tenu par Auth0, passkey, Google/Facebook, comptes pros, IBAN et mandat SEPA, fidélité, bases légales, prestataires, durées, droits, suppression, cookies, sécurité)                                                                                | ✍️ projet, trous marqués `[À COMPLÉTER]` / `[À VÉRIFIER]` | [`texte-politique-de-confidentialite.md`](texte-politique-de-confidentialite.md) |
| P3 — `/confidentialite` rendue en HTML par une Pages Function, 503 lisible si l'API tombe, workflow de déploiement lancé depuis le dossier de l'app                                                                                                                                                             | commité `3cbc2c4d4`, **pas poussé**                       | `apps/lfc-ecommerce-frontend/functions/`, `src/app/legal/privacy-page/`          |
| P2 — section requise `dataDeletion` (insupprimable, clé gardée à l'édition), révision attendue sur les écritures (facultative cette livraison), chargement pour écrire qui refuse l'illisible, route « Créer la section », semis, badge et encadré au back-office, ancre `#suppression-des-donnees` sur la page | commité, **pas poussé**                                   | `b2b/content`, `contenu/mentions`, `packages/contracts`                          |

### 9.2 Ce qu'on constate en local et avant déploiement

- **`ng serve` n'exécute pas les Pages Functions** : en local, `/confidentialite`
  tombe dans le routeur Angular, qui renvoie vers « Bienvenue ». Pour voir la
  page : `pnpm dlx wrangler pages dev dist/lfc-ecommerce-frontend/browser`
  après un build `cloudflare`.
- **Tant que P3 n'est pas déployé**, la boutique en ligne fait de même.
- **`/confidentialité` (avec accent)** est une autre adresse
  (`/confidentialit%C3%A9`) : même une fois la Function en ligne, elle mène à
  l'accueil. Une redirection `_redirects` vers `/confidentialite` est proposée,
  non faite.
- La page n'a **aucun lien de retour** vers la boutique : un humain qui y arrive
  n'a pas de chemin. Lien « ← Retour à la boutique » proposé, non fait.

### 9.3 Ce qui manque pour être CONFORME — à bâtir

Le texte promet des gestes que le code ne fait pas encore. Publier la page
sans eux, c'est publier des engagements qu'on ne tient pas.

1. **L'anonymisation d'un compte client** (§6) — le geste réel derrière
   « Suppression des données ».
   - Effacer l'identité (nom, prénom, e-mail, téléphone), les méthodes de
     connexion et le lien Auth0 (y compris la suppression de l'utilisateur
     chez Auth0), la fidélité, les préférences.
   - Garder les commandes et factures (10 ans), détachées de la personne,
     rattachées à un client anonyme ; garder les données de l'entreprise tant
     qu'elle reste cliente.
   - Le déclencher au back-office (voie e-mail) avant tout bouton côté client.
   - Journaliser l'anonymisation (qui, quand), sans rejournaliser les données
     effacées.
   - Touche au mur tenant et aux données réelles : **plan + `vitruve`** avant
     d'écrire une ligne.
2. **Les purges de conservation** (§5.4) : comptes sans connexion depuis 3 ans,
   journaux techniques à 12 mois, prospection à 3 ans du dernier contact,
   mandats SEPA 13 mois après le dernier prélèvement. Aucune n'existe. Soit on
   les bâtit (tâches planifiées, journalisées), soit on réécrit les durées
   pour dire ce qui est tenu.
3. **L'export des données** (droit à la portabilité, droit d'accès) : aucun
   outil ne rend « ce que nous détenons sur vous » dans un format structuré.
   Au lancement, une procédure manuelle documentée suffit ; elle n'existe pas.
4. **La procédure de traitement des demandes** : qui lit l'adresse
   `confidentialite@…`, sous quel délai (un mois), comment on vérifie
   l'identité, où l'on trace la demande et la réponse. Un runbook court,
   dans `documentation/ops/`.
5. **Le registre des traitements** (RGPD, art. 30) : la liste des traitements,
   finalités, catégories de données, destinataires et durées. Le texte de la
   politique en fournit la matière ; le registre lui-même n'existe pas.
6. **Les contrats de sous-traitance** (art. 28) avec chaque prestataire
   (Cloudflare, Prisma, Auth0, Stripe, Resend) et les garanties de transfert
   hors UE : à vérifier, et leurs régions à reporter dans le texte.
7. **Les cookies** (Q3) : confirmer qu'aucun outil de mesure d'audience ne
   tourne ; sinon, un bandeau de consentement est obligatoire avant de publier
   la phrase « seulement les cookies nécessaires ».
8. **La section « Suppression des données » créée en production**, avec son
   texte définitif, par le bouton « Créer la section » (P2 déployé d'abord).
9. **Resserrer `expectedRevision`** en obligatoire à la livraison suivante
   ([`todo-legal-expected-revision.md`](../todos/todo-legal-expected-revision.md)).

### 9.4 Ce qui manque — de ton côté

- Les informations légales (§5.5) : raison sociale, forme, capital, RCS,
  SIREN, siège, e-mail dédié ; un DPO s'il en existe un.
- La traduction **en** et **it** (Q4) : le back-office exige les trois langues
  pour chaque paragraphe.
- La **relecture juridique** du texte : l'app traite des paiements et des IBAN.

### 9.5 L'ordre pour soumettre à Meta

1. Batterie verte, commit de P2, push `dev` puis `main` (P2 + P3).
2. `curl -i https://lafoliecoffee.info/confidentialite` → 200 et du HTML.
3. Le texte saisi au back-office, la section de suppression créée.
4. **L'anonymisation au moins exécutable à la main** (9.3, point 1) et la
   procédure de traitement écrite (point 4) : l'URL d'instructions donnée à
   Meta doit décrire un geste réel.
5. Dans Meta : politique = `https://lafoliecoffee.info/confidentialite` ;
   suppression = `https://lafoliecoffee.info/confidentialite#suppression-des-donnees` ;
   catégorie **Shopping** ; icône `apps/lfc-ecommerce-frontend/resources/icon.png`.
