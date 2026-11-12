# Plan de la nuit du 2026-11-12

> 📋 **Feuille de route, 2026-11-12 au soir.** Demande de Hugo : « une doc plan
> de la nuit où on voit tous les points que tu vas attaquer ». Chaque point se
> raye ici (date + commit) quand il est fait. Rien ne part sur `main` sans
> « pousse main ».

## Règles de la nuit

- Un lot à la fois, dans l'ordre ci-dessous ; un point bloqué s'écrit ici avec
  sa raison, et on passe au suivant.
- Sur `dev` seulement. Le matin : point avec Hugo, puis production sur son
  ordre.
- Migrations : lues par le `lecteur-de-migrations` avant tout commit.
- Pas de suite générale lancée par un agent ; la CI de `dev` fait foi.

## 1. Déjà fait ce soir

- [x] Préchargement du bandeau du jour dans le panier de la boutique
      (`9482f4023`, sur `dev`).

## 2. Corriger

1. **Onglet Cache : deux lignes nommées « pro-shelves ».** L'objet des journées
   s'affiche sous le nom du cache des rayons. Trouver la cause (réponse de
   l'objet, agrégation de l'API, ou clé de ligne de l'écran, `rowKey = cache`)
   et la corriger, avec un test qui l'aurait vu.

## 3. Construire

2. **Purge de la table des gestes (`gesture_intent`)** — période proposée :
   **7 jours** (à confirmer par Hugo, cf. § 6). Élagueur sur la passe nocturne
   qui purge les journaux, comme `day_change` ; une clé rejouée après la purge
   referait le geste, d'où une durée qui couvre largement les renvois réels
   (réseau, onglet rouvert, coursier hors ligne) et Stripe (24 h).
3. **Vérification de dérive avant migration** dans
   `deploy_lfd_api.yml` : comparer la base de production aux migrations
   appliquées (`prisma migrate diff`, lecture seule) avant `migrate deploy` ;
   arrêter le déploiement sur un écart non inscrit ; la liste des écarts
   connus, avec leur raison, dans un fichier du dépôt. Le premier passage
   montrera les écarts anciens : ils sont listés, pas corrigés cette nuit.

## 4. Documenter

4. **Les plans finis deviennent des docs d'état** (au présent, schémas, reste
   à faire), puis les plans sont retirés et leurs liens repointés :
   - `caching-usage/plan-veilleur-unique.md`
   - `caching-usage/plan-catalogue-du-back-office.md`
   - `caching-usage/plan-lectures-du-pim.md` (P1 et P2)
   - `caching-usage/plan-onglet-cache.md`
   - `caching-usage/plan-objet-des-journees.md` (lot 1)
   - `ops/plan-idempotence-des-ecritures.md` (J0–J2 ; J3–J5 restent en plan)
   - `comptabilite/plan-paiement-au-compte-par-virement.md` (T0–T3 ; T4–T5
     restent en plan)
5. **La carte des chantiers** : ce qui est fait, ce qui reste, dans l'ordre.
6. **Les 🟦 « sur dev » passés à ✅** pour ce qui est en production
   (`adb9c41e3`).
7. **Le runbook** : l'incident `nutrition_declaration` (42P01), le geste
   `rolled_back_at` en console Prisma, et la vérification des tables avant
   une migration qui pose des déclencheurs.
8. **`documentation/README.md`** : vérifier l'index des docs créées ou
   retirées aujourd'hui.

## 5. Si le temps le permet

9. **Mesure avant/après** des requêtes de l'écran Catalogue et de la liste du
   PIM, en local sur la base de dev (journal des requêtes Prisma), écrite dans
   les docs d'état.
10. **Test de la saisie dans un panneau** de la fiche client pendant une
    relecture du veilleur : un test d'écran qui le prouve.

## 6. À trancher avec Hugo (pas cette nuit)

- La période de purge des gestes (7 jours proposés).
- Lot 2 des journées, virement T4–T5, idempotence J3–J5.
- Audit de sécurité : capture de la fiche racine, fuite d'une facture d'un
  site frère, `RECOMPUTE_TOKEN`, en-têtes des fronts, propriétaire des
  abonnements push.
- Protections de coût : alertes de budget, limites de débit Cloudflare,
  Turnstile.
- Refus d'écrire sur une fiche client périmée.
