# La carte des chantiers

> Ouverte le 2026-10-04 (Hugo : « on a tellement de choses en cours que je ne
> sais pas quoi faire pour terminer des parties »). **Elle se tient à jour à
> chaque lot fini**, et décide de l'ordre. Règle : **un seul lot en cours à la
> fois**, sauf accord explicite de Hugo.
>
> 🔁 **Refaite entièrement le 2026-10-10** (Hugo : « refaire un tour absolument
> complet de toutes les docs »). Les 325 documents de `documentation/` ont été
> relus par dossier, et chaque reste confronté au code par une recherche dans
> `apps/` et `packages/`. **Ce qui décide de l'ordre a été rouvert à la main**
> le même jour : la commande sans compte (fermée, `orders.module.ts:367`),
> BE2 (bâti, `on-packing-order-packed.handler.ts` est un abonné durable), S3
> (bâti, `pricing-parties.resolver.ts`, `test/sub-account-pricing.e2e-spec.ts`),
> les marges V0 (migration `20261004150000_marges_de_production`). Le reste
> repose sur la lecture des huit inventaires : « rien trouvé » veut dire
> « rien trouvé par recherche », pas « prouvé absent ». La version du
> 2026-10-07 est dans l'historique git.

## 1. Les échéances

| Quand            | Quoi                                                                                                                                                     | Qui                         | Doc                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------- |
| avant le 30 nov  | **65 sociétés sans adresse de facturation**, et les mentions de paiement de l'entité (pénalités, indemnité de 40 €) : la facture du mois les refuse déjà | Hugo (saisie)               | `comptabilite/facturation/todo-facture-du-mois.md` |
| avant le 1er déc | **Sortie d'Accelerate** : le code est fait (`prisma.service.ts`) ; restent la vérification en production et la révocation de la clé                      | Hugo (console Prisma)       | `todos/todo-sortie-d-accelerate.md`                |
| au déploiement   | Accorder à l'écran `b2b_contact`, `delivery_availability`, `delivery_fee` — sans quoi personne, admin compris, ne règle les zones                        | Hugo (`/admin/staff-roles`) | `contenu-ecommerce/demandes-clients.md`            |
| au déploiement   | Promouvoir `dev` → `main` : `lecteur-de-migrations` sur les migrations du 2026-10-08 au 2026-10-10, CI verte sur le SHA exact                            | moi, sur ordre              | `comptabilite/arbitrages-en-absence.md`            |

## 2. En cours

Aucun lot.

## 3. Prêts à bâtir, sans décision à prendre

Ordre proposé : d'abord ce qui ferme une frontière ou un trou de sécurité,
puis ce qui rend durable ce qui ne l'est pas, puis le confort.

| #   | Sujet                                                                                                                         | Taille | Touche              | Doc                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------- | ------------------------------------------------------------------ |
| 1   | ✅ 2026-10-10 (`bd1fe320a`, reste le contrôle en prod) — Les web vitals refusées par le CORS (mesure à zéro depuis l'origine) | S      | frontière CORS      | `todos/todo-vitals-refuses-par-le-cors.md`                         |
| 2   | Le balayage des invitations périmées (`ExpireStaleInvitationsCommand` absent)                                                 | S      | retrait d'accès     | `auth-inscription/architecture-compte-client-cycle-de-vie.md` §8.1 |
| 3   | ✅ E4a et E4b 2026-10-10 — les abonnés du paiement en faits durables (fidélité, courriels réglé/refusé/expiré, remboursement) | M      | argent (points)     | `journalisation/plan-evenements-durables.md`                       |
| 4   | ~~L'accusé au paiement durable~~ ✅ par E4a (2026-10-10), TODO retiré                                                         | —      | —                   | `journalisation/plan-evenements-durables.md` §7 ter                |
| 5   | E5 — courriels, alerte de connexion, image en faits durables                                                                  | M      | alerte de connexion | `journalisation/plan-evenements-durables.md`                       |
| 6   | ✅ 2026-10-10 — L'écran des messages morts et le rejeu                                                                        | S–M    | rejeu gardé         | `journalisation/plan-boite-d-envoi.md` §9 bis                      |
| 7   | ✅ 2026-10-10 — L'alerte lit l'historique d'AVANT la commande (TODO retiré)                                                   | S      | —                   | `apps/lfd-api/src/b2b/alerts/domain/ports/order-history.reader.ts` |
| 8   | ✅ 2026-10-10 — Les deux courriels internes (rendez-vous pris, demande de rappel) ; reste le nom de contact d'un rappel       | S–M    | —                   | `todos/todo-notifications.md`                                      |
| 9   | ✅ déjà fait (`74672d5c6`, cron `45 3 * * *`) — le doc le disait à tort non planifié ; corrigé le 2026-10-10                  | —      | —                   | `production/plan-controle-qualite.md`                              |
| 10  | ✅ 2026-10-10 — `expectedRevision` obligatoire sur les documents légaux (TODO retiré)                                         | S      | —                   | `packages/contracts/src/legal-document.ts`                         |
| 11  | Les routes de déclaration de bacs encore servies par la livraison (4 e2e à réécrire d'abord)                                  | M      | —                   | `colisage/colisage.md` §9 a                                        |
| 12  | ✅ 2026-10-10 — Le journal : `invoice.autopilot_ran` et `invoice.signalled` (tentative automatique, facture signalée)         | S      | —                   | `comptabilite/facturation/facture-emise.md`                        |
| 13  | ✅ 2026-10-10 (reste le contrôle sur téléphone) — Le bandeau d'installation de l'app cliente                                  | S      | —                   | `todos/todo-installation-app-cliente.md`                           |
| 14  | ✅ déjà fait le 2026-09-22 (`company-screens.ts`) — le TODO ne le disait pas ; corrigé le 2026-10-10                          | —      | —                   | `todos/todo-releve-version-deployee.md` §1                         |

## 4. Écrits, en attente d'une décision de Hugo

Le plus gros levier de la carte : chaque ligne débloque un chantier entier.
Les questions sont dans le doc ; je peux les résumer chacune en une liste.

| Chantier                                                                                                                                                               | Lots                         | Ce qu'il faut trancher                                                                                               | Touche                               | Doc                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| **L'heure prévue au client** (fourchette, suivi dans « Mes commandes »)                                                                                                | ETA1–ETA3 (M), ETA4–5        | B-Q1 largeur (40 min proposé), B-Q2 « 3 arrêts avant vous », B-Q3 SMS                                                | migration, port commerce ← livraison | `livraisons/livreur/plan-hors-ligne-eta-et-livraisons-ratees.md`                          |
| **Les livraisons ratées** (6 c)                                                                                                                                        | C0, C1, C2a (L) ; C2b, C3    | C-Q1 à C-Q6 (refabriquer ?, statut `replaced`, commande ferme d'un pro absent, cloche, I8)                           | argent, migration                    | même doc                                                                                  |
| **Le livreur sans réseau**                                                                                                                                             | HL1–HL5 (L)                  | A-Q1 PWA ou Capacitor, A-Q2 instant déclaré, A-Q3 PIN, **A-Q4 y a-t-il des trous de réseau ?** (fixe l'ordre), A-Q5  | sécurité, migration                  | même doc                                                                                  |
| **Le transfert interne vers un point de retrait éloigné** (le village)                                                                                                 | à écrire                     | d'abord la notion de **site** (un lieu à nous qui vend, remet, est servi), puis le plan                              | frontière entre cinq blocs           | à écrire (`livraisons/transferts/`) — conversation du 2026-10-10                          |
| **L'annulation de commande** (client et admin, remboursement)                                                                                                          | A–E (L)                      | critère, qui peut annuler, remboursement automatique, borne horaire ; plan à refondre après `vitruve` (4 BLOQUANT)   | argent, migration, mur tenant        | `order/plan-annulation-de-commande.md`                                                    |
| **Les avenants** (modifier une commande passée)                                                                                                                        | tout (L)                     | conception à relire ; C4 du 6 c et la carte en dépendent                                                             | argent, migration                    | `order/architecture-commande-immuable-avenants.md`                                        |
| **La production par vagues**                                                                                                                                           | V1 (M–L), V2, V3, V4         | réécrire le plan (§4 et §6 remplacés par §7.2), puis `vitruve`                                                       | argent, migration                    | `production/plan-production-par-vagues.md`                                                |
| **Sous-comptes : la suite**                                                                                                                                            | S5 (S), S6 (M), A3           | S6 déplace le mur tenant (`effective-role.ts` n'a aucun consommateur) ; S4 « irréversible » attend le cabinet sur Q3 | sécurité, argent                     | `b2b/comptes-client/plan-sous-comptes.md`                                                 |
| **Le tri du colisage par heure de départ**                                                                                                                             | M–L                          | d'où vient l'échéance d'une commande ; où vit le délai de livraison                                                  | migration, frontière                 | `colisage/todo-colisage-tri-par-echeance.md`                                              |
| **L'oracle du SIRET** (le 409 dit qu'un client existe)                                                                                                                 | M                            | le correctif                                                                                                         | sécurité                             | `todos/todo-oracle-siret.md`                                                              |
| **Le vocabulaire Shopify survivant, et les points de vente**                                                                                                           | S (libellés) à M–L (retrait) | ne rien faire / renommer / retirer `handleSuffix`, `shopifyProjected` ; garder le genre `shop` sans consommateur ?   | migration (3 déploiements)           | `pim/todo-le-vocabulaire-shopify-survit-au-canal.md`                                      |
| **« Payé sur place »** pour une commande saisie par le staff et payée en caisse                                                                                        | S                            | le geste existe-t-il ?                                                                                               | argent                               | `order/commande-carte-reglee.md` §4                                                       |
| **Fidélité ouverte aux pros**                                                                                                                                          | lot F (M–L)                  | gain sur HT ou TTC, bon sur la facture du mois, titulaire payeur ou site                                             | argent, sécurité                     | `comptabilite/fidelite/plan-points-de-fidelite.md`                                        |
| **Les fournisseurs et l'approvisionnement daté** (prix d'achat)                                                                                                        | L                            | cinq questions                                                                                                       | argent, migration — `vitruve`        | `pim/ingredients-et-approvisionnement.md`                                                 |
| **Les allergènes, lots 6 à 10**, et l'objection B1                                                                                                                     | L                            | B1 (`vitruve`)                                                                                                       | réglementaire, migration             | `pim/data-model/05-allergenes-gs1-inco.md`, `todos/todo-allergenes-objections-vitruve.md` |
| **La communication sort de l'ancre de révision**                                                                                                                       | L                            | D1 signature, D2 lecture à chaud ou cache, D3 rôles                                                                  | frontière, empreintes — `vitruve`    | `pim/plan-la-communication-sort-de-l-ancre.md`                                            |
| **Tarification : la simulation résout dans le navigateur** (R2), `expectedTotalCents` (R4), qui porte le risque d'un prix qui bouge (R13), engagement de famille (R16) | R2 L, R4 M, R16 M            | une décision chacune                                                                                                 | argent                               | `pricing/ce-qui-reste-a-faire.md`                                                         |
| **Les formules** (petit-déjeuner)                                                                                                                                      | F0 puis tout (L)             | 4 BLOQUANT de `vitruve` à lever                                                                                      | argent, TVA                          | `formules/plan-les-formules.md`                                                           |
| **Les opérations datées**, la suite                                                                                                                                    | lots 6+ (M–L)                | décisions D, contradiction `vitruve`                                                                                 | argent, migration                    | `operations-datees/architecture-operations-datees.md`                                     |
| **L'heure limite par clientèle** (J+N, stock)                                                                                                                          | M, puis L                    | refondu trois fois, 4 BLOQUANT                                                                                       | argent                               | `order/plan-heure-limite-par-clientele.md`                                                |
| **Ouvrir la commande sans compte**                                                                                                                                     | S–M                          | l'arbitrage du tarif public (§6) ; le contrôleur est prêt, non branché                                               | sécurité (route publique), argent    | `order/plan-commande-sans-compte.md`                                                      |
| **Démonter `OrderCutoff`** (lot 9)                                                                                                                                     | L, trois déploiements        | le lot 8 (boutique) d'abord                                                                                          | migration                            | `order/demontage-order-cutoff.md`                                                         |
| **La suppression de compte client**                                                                                                                                    | L                            | le plan                                                                                                              | RGPD, sécurité                       | `legal/plan-supprimer-mon-compte.md`                                                      |
| **Connexion Apple / sociale, rattachement depuis le profil**                                                                                                           | L, M–L                       | §12.3                                                                                                                | identité                             | `auth-inscription/plan-connexion-sociale.md`, `plan-rattachement-depuis-le-profil.md`     |
| **Supprimer les colonnes Stripe des mandats** et les colonnes mortes du colisage                                                                                       | S chacune                    | l'ordre (CLAUDE.md § 0 : pas de suppression sans ordre)                                                              | migration — `vitruve`                | `comptabilite/prelevement/prelevement-sepa.md`, `colisage/colisage.md` §8                 |
| **Le DROP de `pim.nutrition_declaration`**                                                                                                                             | S                            | l'ordre, et le compte de production                                                                                  | destructif                           | `pim/plan-separer-allergenes-et-nutrition.md` §9                                          |
| **Les six décisions prises « par défaut » le 2026-10-02** (dont RL1 : la rapportée repart sans frais, même prix)                                                       | S                            | les valider                                                                                                          | argent (RL1)                         | `livraisons/tournees/decisions-par-defaut-2026-10-02.md`                                  |
| **Le XML du lot de prélèvement** (IBAN en clair) téléchargeable en simple lecture comptable                                                                            | S                            | resserrer à l'écriture ?                                                                                             | sécurité                             | `comptabilite/arbitrages-en-absence.md` A16                                               |

## 5. Bloqués par l'extérieur

| Qui                          | Ce qu'on attend                                                                                                                                                           | Doc                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Le cabinet comptable**     | l'écart du centime (TVA « en dedans » pour un particulier) ; S4 des sous-comptes (Q3) ; fidélité et cartes cadeaux ; remboursement réussi puis échoué ; BT-26 sur l'avoir | `pricing/ecart-du-centime-particuliers.md`, `comptabilite/…` |
| **La Caisse d'Épargne**      | neuf questions sur dix (pain.008, délais, FRST/RCUR, retours, amendement…) ; le libellé B2B du mandat ; l'amendement d'un mandat actif                                    | `comptabilite/prelevement/question-banque.md`                |
| **Un vrai fichier bancaire** | éprouver l'import pain.002 / camt.054 (PA5), le rejet de lot entier                                                                                                       | `comptabilite/prelevement/retours-bancaires.md`              |
| **Un achat**                 | une imprimante Zebra (IM0 à IM4)                                                                                                                                          | `impression/plan-imprimantes-thermiques.md`                  |
| **Le terrain**               | la mesure MAX_WAYPOINTS sur iPhone ; le DPO pour la position du livreur                                                                                                   | `livraisons/livreur/gps-y-aller-et-position.md` §7           |
| **Un geste de production**   | le verrou de dix ans sur le seau des factures ; les contrôles SQL avant promotion ; l'abonnement du webhook Stripe aux `checkout.*`                                       | `ops/runbook.md`, `comptabilite/…`                           |

## 6. Le ménage documentaire

Rien de cela ne change le code ; chaque ligne est un document qui dit faux.
Un après-midi en tout, en un seul commit `docs:` par dossier.

**Plans bâtis à transformer en doc d'état** (règle : doc au présent, plan
supprimé, sauf si un `migration.sql` le cite — alors bandeau daté) :

- `b2b/comptes-client/plan-sous-comptes.md` (S1–S4 bâtis ; le README dit encore « rien n'existe »)
- `comptabilite/fidelite/plan-points-de-fidelite.md` (A–E2 ; ne garder que F)
- `comptabilite/mandat/plan-mandat-client.md`
- `order/plan-idempotence-de-passation.md`, `plan-supervision-v2.md`, `plan-tva-des-frais-de-port.md`, `plan-bon-public.md`, `plan-bon-de-commande-public-en-ttc.md`, `plan-vitrine-enregistrement.md`, `plan-nature-du-client-sur-la-commande.md`, `plan-agregation-des-commandes.md` (A1, A2)
- `pricing/plan-materiaux-de-prix.md`, `plan-decompte-du-panier-ht.md`, `plan-familles-en-donnees.md`, `plan-la-trace-qui-explique.md`, `mercuriales/plan-la-mercuriale-devient-un-objet.md`
- `pim/plan-methodes-de-remise-professionnelle.md`, `plan-separer-allergenes-et-nutrition.md` (§9, §10 restent)
- `livraisons/architecture/plan-schema-delivery.md`, `chargement/plan-geometrie-du-plancher.md`, `clientele/plan-remise-et-livraison-par-clientele.md`, `clientele/plan-retrait-slots.md`, `clientele/plan-procedure-de-livraison.md`
- `production/plan-fournees-progressives.md`, `plan-controle-qualite.md` (le bandeau dit « rien n'est bâti », QC1–QC5 le sont), `relecture-des-postes.md`
- `ci-cd/plan-nouvelle-version-des-fronts.md`, `journalisation/plan-journal-d-activite.md`, `plan-phrases-du-journal.md`, `ops/plan-sortie-d-accelerate.md`

**Docs qui contredisent le code** (les plus trompeurs d'abord) :

- `b2b/architecture-facturation.md` et `comptabilite/prelevement/prelevement-sepa.md` §8, §11 : « nous n'émettons pas de facture » — la plateforme émet (`issue-monthly-invoices.handler.ts`).
- `comptabilite/prelevement/prelevement-sepa.md` §1, §2, §6 : envoi, dépôt, retours, activation, `delete` du stockage tous dits absents — tous bâtis.
- `droits-et-permissions/architecture-acces-staff.md` et `todo-droits-ecriture-backoffice.md` : ignorent `delivery_availability` et `delivery_fee` (2026-10-10).
- `journalisation/plan-boite-d-envoi.md`, `production/plan-contexte-retrait.md`, `production/plan-production-par-vagues.md`, `b2b/architecture-feature-flags.md` : bandeau « rien n'est bâti » contredit par leur propre corps ou par le code.
- `order/audit-flux-de-commande.md` §1 : `cancelled` est écrit (expiration des impayés).
- `order/todo-conservation-des-bons-en-r2.md` : `R2_CUSTOMERS_EU_*` posés le 2026-09-21 ; le bon est joint au courriel.
- `pim/todo.md` : `AddVariant` existe ; l'item « collection » est une notion Shopify.
- `pim/images-du-catalogue.md` §8 et `mediatheque/la-mediatheque.md` : le point focal a un lecteur (la bibliothèque) ; seul manque la boutique.
- `livraisons/chargement/plan-geometrie-du-plancher.md` l.273 : le jeu entre bacs est un réglage depuis `20261008090000`.
- `pricing/README.md` : cinq docs non indexés ; `documentation/README.md` : `operations-datees/`, `formules/`, `contenu-ecommerce/` absents, `release-plan-2026-08.md` et `plan-demo-2026-09-19.md` disent encore « piloter la semaine ».
- `todos/` à archiver : `todo-ecran-tarification-ignore-les-baremes.md` (clos), `todo-file-hors-ligne-bloquee-par-un-refus.md` (sans objet), `todo-mediatheque.md` (dette `PimJournal` soldée), `ledger-composition-automatique.md` (« à supprimer après le débrief »).

## 7. Les dettes comptées et le reste

- `todos/todo-agregat-company-trop-gros.md` : `company.ts` dépasse 740 lignes (règle ≲ 300), découpe « à la cinquième transition ».
- `todos/todo-flake-des-e2e.md`, `todo-e2e-dependantes-de-l-ordre.md`, `todo-tests-unitaires-coupes-en-ci.md` : la CI tient, la cause n'est pas trouvée.
- `todos/todo-images-web.md` (poids des images), `plan-visuel-sans-republier.md` (le `thumbnail` ne voyage pas ; version de snapshot à monter).
- `livraisons/tournees/todo-calculateur.md` : « Proposer » à 200 clients, p95 12,4 s.
- `todos/todo-retrait-de-pro-les-restes.md` : passer la redirection `/pro` en 301, retirer les URL Auth0.
- PIM : `ChangeVariantSku`, `SKU_PATTERN` partagé, l'écran Conditionnements (« Écran à venir »), les ratios d'image à l'affectation, remplacer une image (`vitruve`).
- Facture émise : seconde entité émettrice, refacturer après un avoir, adresse de livraison non figée, rattrapage après minuit.
- Les dettes tenues par une porte (`lint:controller-buses`, `lint:durable-cross-block`, `lint:code-language`…) s'affichent à chaque `pnpm lint:gates` : leur compte n'est pas recopié ici, il périmerait.

## 8. Mon conseil d'ordre

1. **Les échéances du § 1**, parce qu'elles ont une date.
2. **Le § 3 de haut en bas**, sans attendre personne — en commençant par les
   trois lignes de sécurité (1, 2) et le durable (3 à 6).
3. En parallèle de ta part, **trois décisions** qui débloquent le plus :
   les questions B de l'ETA, A-Q4 (les trous de réseau), et la notion de
   **site** pour le village.
4. **Le ménage du § 6** en un après-midi, quand un lot se termine : une doc
   qui contredit le code gèle le chantier de celui qui la lit.
