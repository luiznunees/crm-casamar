import 'dotenv/config';
import { createApp } from './api/server';
import { startCampaignWorker } from './queues/campaignQueue';
import { startWeeklyScheduler } from './queues/weeklyScheduler';
import prisma from './prisma/client';
import { log } from './utils/logger';

const PORT = process.env.PORT || 3001;

// Executa um SQL ignorando erros (tabela/coluna já existe, etc.)
async function sql(query: string) {
  try { await prisma.$executeRawUnsafe(query); } catch (_) {}
}

async function runMigrations() {
  // AIConfig
  await sql(`CREATE TABLE IF NOT EXISTS "AIConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "personaName" TEXT NOT NULL DEFAULT 'Consultora',
    "personaRole" TEXT NOT NULL DEFAULT 'consultora imobiliária',
    "companyName" TEXT NOT NULL DEFAULT 'Imobiliária',
    "globalRules" TEXT NOT NULL DEFAULT '',
    "toneInstructions" TEXT NOT NULL DEFAULT '',
    "forbiddenWords" TEXT[] NOT NULL DEFAULT '{}',
    "mustInclude" TEXT[] NOT NULL DEFAULT '{}',
    "maxLength" INTEGER NOT NULL DEFAULT 300,
    "signatureTemplate" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIConfig_pkey" PRIMARY KEY ("id")
  )`);
  await sql(`INSERT INTO "AIConfig" ("id","updatedAt") VALUES ('default',NOW()) ON CONFLICT ("id") DO NOTHING`);
  await sql(`ALTER TABLE "AIConfig" ADD COLUMN IF NOT EXISTS "splitMessages" BOOLEAN NOT NULL DEFAULT true`);
  await sql(`ALTER TABLE "AIConfig" ADD COLUMN IF NOT EXISTS "blockDelaySeconds" INTEGER NOT NULL DEFAULT 3`);

  // CampaignLead
  await sql(`ALTER TABLE "CampaignLead" ADD COLUMN IF NOT EXISTS "generatedMessage" TEXT`);
  await sql(`ALTER TABLE "CampaignLead" ADD COLUMN IF NOT EXISTS "finalMessage" TEXT`);
  await sql(`CREATE INDEX IF NOT EXISTS "CampaignLead_status_idx" ON "CampaignLead"("status")`);

  // Lead
  await sql(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "unreadCount" INTEGER NOT NULL DEFAULT 0`);
  await sql(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastMessageAt" TIMESTAMP(3)`);
  await sql(`UPDATE "Lead" l SET "lastMessageAt" = (SELECT MAX(m."sentAt") FROM "Message" m WHERE m."leadId" = l.id) WHERE "lastMessageAt" IS NULL AND EXISTS (SELECT 1 FROM "Message" m WHERE m."leadId" = l.id)`);

  // Campaign
  await sql(`ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "mediaAttachments" JSONB[] NOT NULL DEFAULT '{}'`);
  await sql(`ALTER TABLE "Campaign" DROP COLUMN IF EXISTS "requiresApproval"`);

  // Campaign send window
  await sql(`ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "sendWindowStart" TEXT`);
  await sql(`ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "sendWindowEnd" TEXT`);
  await sql(`ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "sendWindowDays" INTEGER[] NOT NULL DEFAULT '{}'`);
  await sql(`ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "targetTags" TEXT[] NOT NULL DEFAULT '{}'`);
  await sql(`ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "targetPreferredContact" TEXT[] NOT NULL DEFAULT '{}'`);

  // LeadList
  await sql(`CREATE TABLE IF NOT EXISTS "LeadList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadList_pkey" PRIMARY KEY ("id")
  )`);

  // QuickReply
  await sql(`CREATE TABLE IF NOT EXISTS "QuickReply" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'geral',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuickReply_pkey" PRIMARY KEY ("id")
  )`);

  // AutoReplyConfig
  await sql(`CREATE TABLE IF NOT EXISTS "AutoReplyConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startHour" INTEGER NOT NULL DEFAULT 22,
    "endHour" INTEGER NOT NULL DEFAULT 8,
    "message" TEXT NOT NULL DEFAULT 'Oi {nome}! Recebi sua mensagem e vou te responder assim que possível. 😊',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutoReplyConfig_pkey" PRIMARY KEY ("id")
  )`);
  await sql(`INSERT INTO "AutoReplyConfig" ("id","updatedAt") VALUES ('default',NOW()) ON CONFLICT ("id") DO NOTHING`);

  // FollowUpSequence
  await sql(`CREATE TABLE IF NOT EXISTS "FollowUpSequence" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "targetStages" TEXT[] NOT NULL DEFAULT '{}',
    "targetSources" TEXT[] NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUpSequence_pkey" PRIMARY KEY ("id")
  )`);

  // FollowUpStep
  await sql(`CREATE TABLE IF NOT EXISTS "FollowUpStep" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "delayDays" INTEGER NOT NULL,
    "messageTemplate" TEXT NOT NULL,
    "mediaAttachments" JSONB[] NOT NULL DEFAULT '{}',
    CONSTRAINT "FollowUpStep_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FollowUpStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "FollowUpSequence"("id") ON DELETE CASCADE
  )`);
  await sql(`CREATE INDEX IF NOT EXISTS "FollowUpStep_sequenceId_order_idx" ON "FollowUpStep"("sequenceId","order")`);

  // LeadFollowUp
  await sql(`CREATE TABLE IF NOT EXISTS "LeadFollowUp" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextSendAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    CONSTRAINT "LeadFollowUp_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeadFollowUp_leadId_sequenceId_key" UNIQUE ("leadId","sequenceId"),
    CONSTRAINT "LeadFollowUp_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE,
    CONSTRAINT "LeadFollowUp_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "FollowUpSequence"("id") ON DELETE CASCADE
  )`);
  await sql(`CREATE INDEX IF NOT EXISTS "LeadFollowUp_status_nextSendAt_idx" ON "LeadFollowUp"("status","nextSendAt")`);
  await sql(`CREATE INDEX IF NOT EXISTS "LeadFollowUp_leadId_idx" ON "LeadFollowUp"("leadId")`);

  // LeadFollowUpExecution
  await sql(`CREATE TABLE IF NOT EXISTS "LeadFollowUpExecution" (
    "id" TEXT NOT NULL,
    "leadFollowUpId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "message" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "LeadFollowUpExecution_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeadFollowUpExecution_leadFollowUpId_fkey" FOREIGN KEY ("leadFollowUpId") REFERENCES "LeadFollowUp"("id") ON DELETE CASCADE,
    CONSTRAINT "LeadFollowUpExecution_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "FollowUpStep"("id") ON DELETE CASCADE
  )`);
  await sql(`CREATE INDEX IF NOT EXISTS "LeadFollowUpExecution_leadFollowUpId_idx" ON "LeadFollowUpExecution"("leadFollowUpId")`);

  // WarmingFlow
  await sql(`CREATE TABLE IF NOT EXISTS "WarmingFlow" (
    "id"        TEXT NOT NULL,
    "leadId"    TEXT NOT NULL,
    "step"      INTEGER NOT NULL DEFAULT 1,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "optOut"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WarmingFlow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WarmingFlow_leadId_key" UNIQUE ("leadId"),
    CONSTRAINT "WarmingFlow_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE
  )`);

  log.db('Migrations aplicadas');
}

async function main() {
  log.divider();

  await prisma.$connect();
  log.db('Conectado ao PostgreSQL');

  await runMigrations();

  startCampaignWorker();
  startWeeklyScheduler();

  const app = createApp();
  app.listen(PORT, () => {
    log.divider();
    log.server(`Rodando em http://localhost:${PORT}`);
    log.server(`Webhook: http://localhost:${PORT}/webhook/evolution`);
    log.divider();
  });
}

main().catch((err) => {
  log.fatal('Erro fatal na inicialização', err);
  process.exit(1);
});
