# TODO — sortir d'Accelerate, le week-end du 19–20 septembre 2026

> **Posé le 2026-09-15** à la demande de Hugo, pour le week-end du **samedi 19 et
> dimanche 20 septembre 2026** : moins de trafic client, et le temps de vérifier.
> Échéance Prisma : **1er décembre 2026** — après, la production ne joint plus sa
> base. Le plan, ses raisons et l'ordre des gestes :
> [`../ops/plan-sortie-d-accelerate.md`](../ops/plan-sortie-d-accelerate.md).
>
> ⚠️ Le plan est **en cours de contradiction par `vitruve`** au moment de cette
> note : relire ses objections, intégrées au plan, avant de commencer.

## Avant le week-end (sans effet en production)

- [ ] **Code** (Claude) : durcir les garde-fous des outils — `clone-dev`,
      `reset-growth`, `seed:growth`, `seed:delivery` refusent toute base qui
      n'est pas locale (schéma **et** hôte).
- [ ] **Code** (Claude) : l'étape « Migrer la base » du déploiement lit l'URL
      directe ; JSDoc et docs (`secrets-et-variables.md`, `runbook.md`) au présent.
- [ ] Batterie complète verte, merge sur `main` — rien ne change encore en
      production tant que les secrets n'ont pas bougé.

## Le week-end

- [ ] **Console Prisma** (Hugo) : générer l'URL **mutualisée**
      (`pooled.db.prisma.io`) et l'URL **directe** (`db.prisma.io`). Relever la
      **région** de la base et la **limite de connexions** du plan.
- [ ] **Secrets GitHub** (Hugo, par l'interface — jamais en ligne de commande) :
      mettre de côté la valeur Accelerate actuelle de `DATABASE_LFD_URL` ; créer
      `DATABASE_LFD_DIRECT_URL` ; remplacer `DATABASE_LFD_URL` par l'URL
      mutualisée.
- [ ] **Redéployer l'API** (Claude, workflow manuel).
- [ ] **Vérifier** (Claude + Hugo) : sonde et contrôle du mur du runbook, un
      écran admin qui lit la base, une connexion client, une commande de test si
      possible, latence des vitals avant / après, console Prisma sans trafic
      Accelerate.
- [ ] **Si ça ne va pas** : recoller l'ancienne valeur de `DATABASE_LFD_URL`,
      redéployer. C'est tout le retour arrière.

## Quelques jours après

- [ ] **Révoquer la clé Accelerate** (Hugo) — ferme aussi la fuite de clé
      encore ouverte.
- [ ] **Retirer la branche `accelerateUrl`** de `PrismaService` et des scripts
      (Claude) : le resserrement.
