-- OPS obtient son propre schéma, et sa première table.
--
-- Un schéma plutôt que des tables dans `public` : OPS est le cinquième bloc de
-- l'application, muré par le gate des frontières (`ops → platform`, et personne
-- n'importe `ops`). Le mur logique méritait son pendant en base — le jour où
-- OPS partira dans sa propre app, ce qui lui appartient est déjà rassemblé.
--
-- `IF NOT EXISTS` sur le schéma : la base de dev a pu être poussée à la main
-- avant que cette migration n'existe, et une migration qui échoue là-dessus
-- ferait échouer tout le déploiement pour une ligne déjà appliquée.
CREATE SCHEMA IF NOT EXISTS "ops";

-- Une ligne par TRANSITION de statut, jamais un échantillon périodique : à
-- quinze secondes de cadence, un échantillon ferait des dizaines de milliers de
-- lignes par jour pour répéter la même chose.
CREATE TABLE "ops"."node_status_log" (
    "id" TEXT NOT NULL,
    "node" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_status_log_pkey" PRIMARY KEY ("id")
);

-- La seule lecture qu'on fait : le dernier état connu de chaque nœud, et sa
-- frise. L'ordre descendant est dans l'index parce qu'il est dans la requête.
CREATE INDEX "node_status_log_node_at_idx" ON "ops"."node_status_log"("node", "at" DESC);
