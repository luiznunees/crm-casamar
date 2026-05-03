// Trigger reload
import 'dotenv/config';

import { createApp } from './api/server';
import { startCampaignWorker } from './queues/campaignQueue';
import { startWeeklyScheduler } from './queues/weeklyScheduler';
import prisma from './prisma/client';
import { log } from './utils/logger';
import { config } from './config';

const PORT = config.port || 3001;


async function main() {
  log.divider();

  prisma.$connect()
    .then(() => log.db('Conectado ao PostgreSQL'))
    .catch(err => log.error('Erro ao conectar no banco', err));


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
