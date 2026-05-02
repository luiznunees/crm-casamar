import 'dotenv/config';
import prisma from '../src/prisma/client';

async function main() {
  console.log('Aplicando migrations...');

  // Adiciona colunas novas na CampaignLead se não existirem
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "CampaignLead"
    ADD COLUMN IF NOT EXISTS "generatedMessage" TEXT,
    ADD COLUMN IF NOT EXISTS "finalMessage" TEXT;
  `);

  // Cria tabela AIConfig se não existir
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AIConfig" (
      "id"               TEXT NOT NULL DEFAULT 'default',
      "personaName"      TEXT NOT NULL DEFAULT 'Consultora',
      "personaRole"      TEXT NOT NULL DEFAULT 'consultora imobiliária',
      "companyName"      TEXT NOT NULL DEFAULT 'Imobiliária',
      "globalRules"      TEXT NOT NULL DEFAULT '',
      "toneInstructions" TEXT NOT NULL DEFAULT '',
      "forbiddenWords"   TEXT[] NOT NULL DEFAULT '{}',
      "mustInclude"      TEXT[] NOT NULL DEFAULT '{}',
      "maxLength"        INTEGER NOT NULL DEFAULT 300,
      "signatureTemplate" TEXT NOT NULL DEFAULT '',
      "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AIConfig_pkey" PRIMARY KEY ("id")
    );
  `);

  // Insere o registro default se não existir
  await prisma.$executeRawUnsafe(`
    INSERT INTO "AIConfig" ("id", "updatedAt")
    VALUES ('default', NOW())
    ON CONFLICT ("id") DO NOTHING;
  `);

  // Adiciona índice no status da CampaignLead se não existir
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CampaignLead_status_idx" ON "CampaignLead"("status");
  `);

  console.log('✅ Migrations aplicadas com sucesso!');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
