# La grille d'audit RGAA de la boutique

La grille [`grille-audit-rgaa.json`](grille-audit-rgaa.json) est la source de vérité de l'audit
d'accessibilité de la boutique en ligne (`https://lafoliecoffee.info`,
`apps/lfc-ecommerce-frontend`). Hugo l'a décidé le 2026-10-26 : un audit complet sur la grille
officielle RGAA 4.1.2, fait en interne, puis contre-vérifié par un auditeur. La grille est
lisible par une machine pour qu'on puisse en générer plus tard la déclaration d'accessibilité.

## Ce qu'elle contient

- **Les 106 critères officiels** en 13 thématiques, avec leur intitulé exact (`intitule`, avec
  les liens du glossaire ; `intitule_texte`, sans) et leurs tests. La source est le fichier des critères
  du dépôt public de la DINUM
  (`DISIC/accessibilite.numerique.gouv.fr`, commit `95d5ef33`), récupéré le 2026-10-26 ;
  le site officiel affiche la version 4.1.2. L'URL exacte est dans `meta.source`.
- **L'échantillon** (`meta.echantillon`) : douze pages ou parcours, `P01` à `P12`, repris du
  pré-audit — accueil, boutique, fiche produit, panier (retrait ou livraison, créneau,
  identité invité), règlement Stripe, confirmation, mes commandes, annulation invité, QR de
  retrait, compte et profil, connexion, CGV avec les mentions et la déclaration.
- **Une case par critère et par page** : `statut` (`C`, `NC`, `NA`, `NT`), `preuve` (texte,
  `fichier:ligne` ou observation, avec l'aide technique utilisée), `lot` (le lot de correction).
- Les métadonnées : site, référentiel, dates, auditeurs, environnements, technologies,
  contenus tiers.

## L'état de départ

Tout est `NT` (non testé), sauf les **non-conformités que le pré-audit du 2026-10-26 établit
avec une preuve** (§2 du pré-audit, une note de travail locale hors dépôt) : douze critères, 41 cases. Leur
preuve est recopiée, et leur lot dit où en est la correction — le lot A1 a été livré par le
commit `60f5dc181` et reste à revérifier à l'audit ; le lot F (fold-ng) est en cours. Les
constats du pré-audit sans page précise ou sans verdict net sont en `note` du critère, et la
case reste `NT`. **Aucun `C` n'est pré-rempli** : la conformité se constate à l'audit, pas
dans une lecture de code.

## La remplir

1. Pour chaque page, chaque critère : `C` si tous ses tests passent, `NC` si un seul échoue,
   `NA` si rien sur la page n'est concerné (pas de vidéo → thème 4 en `NA`).
2. Une case `NC` porte toujours sa preuve et un lot. Une case `C` dit comment elle a été
   constatée (outil, aide technique).
3. Un critère corrigé repasse par le test : on remplace `NC` par `C` avec la nouvelle preuve,
   jamais par effacement.

Les tests se font dans les environnements attendus (`meta.environnements_de_test`) :
NVDA + Firefox, JAWS + Chrome, VoiceOver + Safari sur macOS et sur iOS, TalkBack + Chrome sur
Android.

## Du statut des cases au taux

C'est la règle RGAA, et `pnpm rgaa:rate`
([`dev-toolbox/accessibilite/rgaa-rate.mjs`](../../dev-toolbox/accessibilite/rgaa-rate.mjs))
l'applique :

- un critère est **C** s'il est conforme sur **toutes** les pages où il s'applique, **NC** dès
  qu'une page l'est, **NA** s'il ne s'applique nulle part ;
- **taux = critères C / (C + NC)**, les NA exclus ;
- **statut** : totalement conforme à 100 %, partiellement conforme à partir de 50 %, non
  conforme en dessous.

Le script affiche les comptes, le taux provisoire et les critères encore `NT`. Tant qu'une
case est `NT`, il refuse de rendre un statut et répond « audit incomplet ».

## Ce qu'elle alimente

- **La déclaration d'accessibilité publiée** : la mention légale `accessibility` du
  back-office ([`../legal/textes-legaux-en-vigueur.md`](../legal/textes-legaux-en-vigueur.md),
  §6), qui déclare aujourd'hui « non conforme » sans taux. **Hugo a décidé qu'aucun taux ne
  sera publié avant la fin de l'audit** : la déclaration reprendra le taux, la liste des NC,
  les dérogations (iframe Stripe, PDF) et l'échantillon de cette grille une fois toutes les
  cases tranchées et contre-vérifiées.
- **La [porte axe](porte-axe.md)** (`pnpm a11y:axe`) : un contrôle automatique ne couvre qu'une partie des critères ;
  il empêche une régression sur ce qu'il voit, mais ne remplace pas une case de la grille.

## Le suivi des corrections publié

Décidé par Hugo le 2026-10-26 : le dialogue « Accessibilité » de la boutique montre, sous la
déclaration, un **tableau de suivi des corrections** — sans aucun taux tant que l'audit n'est pas
fait. Sa source est dans cette grille, à deux clés de premier niveau :

- **`corrections`** : une liste de `{ theme, date, statut, commit, libelle }`.
  - `theme` : le numéro de la thématique RGAA (1 à 13), ou `null` pour une ligne transversale
    (l'audit lui-même) ;
  - `statut` : `fait`, `en_cours` ou `prevu` ;
  - `date` (`AAAA-MM-JJ`) : le jour de livraison pour `fait` (obligatoire), le jour de début pour
    `en_cours`, `null` pour ce qui n'est pas daté ;
  - `commit` : le commit qui l'a livrée, pour nous — il n'est pas publié ;
  - `libelle` : `{ fr, en, it }`, les trois obligatoires, écrits pour le public.
- **`audit`** : `{ prevu: null | "AAAA-MM", fait: null | "AAAA-MM-JJ" }`. Aucune date ne s'y écrit
  avant d'être décidée.

Le cycle :

1. modifier `corrections` ou `audit` ici ;
2. lancer `pnpm rgaa:digest`
   ([`dev-toolbox/rgaa-digest.mjs`](../../dev-toolbox/rgaa-digest.mjs)) : il valide les entrées et
   écrit la part publique dans l'API
   (`apps/lfd-api/src/b2b/content/infrastructure/embedded/accessibility-follow-up.json`) ;
3. commiter la grille et le fichier généré ensemble — `pnpm lint:rgaa-digest` refuse un fichier
   embarqué qui ne suit plus la grille ;
4. déployer l'API : c'est elle qui sert `GET /content/accessibility-follow-up`.

**Le second mode.** Quand `audit.fait` est daté et qu'aucune case n'est plus `NT`, le même script
ajoute les comptes C, NC et NA, globaux et par thématique (`conformity`) — le taux s'en déduit. Il
refuse un `audit.fait` daté tant qu'une case reste `NT`. La boutique ne l'affiche pas encore :
l'emplacement est prévu dans le contrat (`AccessibilityFollowUpView`), l'écran viendra avec l'audit.

Le dialogue lui-même est décrit dans
[`../b2b/mentions-legales.md`](../b2b/mentions-legales.md), §6.

## Ce qui reste à faire (relevé le 2026-10-26)

Après les lots A1 à A4, le lot fold 0.34.0 et le lot A5 (prix barré, dette
axe, écrans hors de la porte, onglets et toasts), décidé par Hugo le
2026-10-26. Ce qui suit n'est pas pris :

1. **Les textes alternatifs des images**, à saisir dans le back-office
   (Médiathèque → une image → « texte alternatif », fr/en/it). La lecture
   neutralise déjà l'ancien repli sur l'URL
   ([`../mediatheque/plan-alternatives-urls.md`](../mediatheque/plan-alternatives-urls.md)),
   mais une image sans description reste muette pour un lecteur d'écran. Les
   outils agent « décrire » peuvent proposer un premier jet, à relire.
2. **L'audit complet sur la grille** : les 106 critères sur les 12 pages de
   l'échantillon, avec les lecteurs d'écran (NVDA + Firefox, JAWS + Chrome,
   VoiceOver macOS et iOS, TalkBack). Rempli en interne, puis contre-vérifié par
   un auditeur RGAA. C'est la seule étape qui produit un taux ; `pnpm
rgaa:rate` refuse d'en donner un tant qu'une case est `NT`.
3. **La déclaration mise à jour** avec ce taux : au-delà de 50 %, « partiellement
   conforme ». Renseigner `audit.fait`, relancer `pnpm rgaa:digest` : le
   dialogue de la boutique remplace alors le suivi par la table d'audit, sans
   code nouveau. Mettre à jour la mention `accessibility` au back-office.
4. **Hors du parcours client, plus tard** : les PDF remis aux clients
   (factures, mandats, CGV), puis le back-office, outil de l'équipe —
   l'obligation y est moindre.

À côté, sans être de l'accessibilité : le bundle de démarrage de la boutique
est à 1 395,2 kB pour une limite bloquante de 1 400 kB (`ng build -c
cloudflare`, 2026-10-26). Tout ajout au démarrage doit être compensé.
