# Análise Crítica do Projeto — CRM Imobiliária + WhatsApp

> Documento gerado para revisão externa. Descreve o que o projeto faz, como está estruturado, e onde estão os problemas reais.

---

## O que é o projeto

CRM especializado para imobiliárias que integra gestão de leads com disparo automatizado de mensagens via WhatsApp (usando a Evolution API como bridge). O sistema gerencia o ciclo completo: importação de leads → aquecimento → campanhas em massa → follow-up automático → inbox para atendimento manual.

**Stack:**
- Backend: Node.js + TypeScript + Express + Prisma + PostgreSQL + BullMQ + Redis
- Frontend: React + TypeScript + Vite + TanStack Query + React Router
- IA: Groq (LLaMA 3.3 70B) para geração e variação de mensagens
- WhatsApp: Evolution API (self-hosted)

---

## O que funciona bem

### Modelo de dados bem pensado
O schema Prisma é coerente. O pipeline de stages (`COLD → WARMING → WARM → HOT → INTERESTED`) faz sentido para o domínio imobiliário. A separação entre `source` (empreendimento) e `origin` (canal de aquisição) é uma distinção útil que muitos CRMs ignoram.

### Fingerprint evasion
O módulo `fingerprintEvasion.ts` é tecnicamente sofisticado: unicode invisível em textos, ruído PCM em WAV, modificação de bytes no scan data de JPEG, e chunk `tEXt` em PNG. Cada lead recebe uma variação única do mesmo conteúdo. Isso é o tipo de detalhe que diferencia um sistema amador de um que sobrevive em produção.

### Scheduler anti-ban
O `dispatchScheduler.ts` implementa delays aleatórios configuráveis, pausa longa a cada 50 mensagens por chip, intercalação de chips, e respeito a janela de horário com rollover para o próximo dia útil. Está correto e bem isolado.

### Inbox com UX decente
O componente `Inbox.tsx` tem polling diferenciado (3s para mensagens, 5s para lista), atualização otimista, agrupamento por data, sugestão de resposta via IA, quick replies, e upload de mídia. Para um projeto interno, está acima da média.

### Coleta passiva de nome
`warmingFlowService.ts` tenta extrair o nome da mensagem sem perguntar explicitamente. A lista de palavras rejeitadas (`notNames`) e os padrões regex são razoáveis. Boa abordagem para não parecer robô.

---

## Problemas críticos

### 1. Sistema de migração é um anti-padrão grave

O arquivo `src/index.ts` contém ~150 linhas de SQL raw executado no boot da aplicação, duplicando o que o Prisma Migrate já faz. Há inclusive um `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "steps"` duplicado (linhas consecutivas com o mesmo comando). Isso cria três problemas sérios:

- **Divergência silenciosa**: o schema Prisma e o banco real podem ficar fora de sincronia sem nenhum erro visível.
- **Impossível fazer rollback**: não há `down migration`. Se algo der errado, não tem como desfazer.
- **Acoplamento no boot**: qualquer erro de SQL derruba o servidor inteiro na inicialização.

O correto seria usar exclusivamente `prisma migrate deploy` em produção e remover todo o bloco `runMigrations()`.

### 2. SQL injection em `autoReplyService.ts`

```typescript
// VULNERÁVEL — interpolação direta de string do usuário em SQL
await prisma.$executeRawUnsafe(`
  INSERT INTO "AutoReplyConfig" (..., "message", ...)
  VALUES ('default', ..., '${merged.message.replace(/'/g, "''")}', ...)
`);
```

O escape manual com `replace(/'/g, "''")` não é suficiente. Basta o usuário enviar `\` ou outros caracteres especiais para quebrar a query. O correto é usar `prisma.$executeRaw` com template literals parametrizados, ou melhor ainda, usar o Prisma Client diretamente (`prisma.autoReplyConfig.upsert()`).

O mesmo padrão de `$queryRawUnsafe` aparece em `followUpService.ts` e `autoReplyService.ts`.

### 3. Segredos expostos no repositório

O arquivo `backend/.env` está no repositório (visível na árvore de arquivos e aberto no editor). Isso significa que `DATABASE_URL`, `GROQ_API_KEY`, `EVOLUTION_API_KEY` e credenciais de Redis estão potencialmente no histórico do git. O `.gitignore` deveria ter bloqueado isso desde o início.

### 4. Mídia em base64 no banco de dados

Campanhas armazenam `mediaAttachments` como `Json[]` no PostgreSQL, contendo base64 de imagens, vídeos e áudios. Um vídeo de 10MB vira ~13MB de texto no banco. Com múltiplas campanhas e leads, isso:
- Explode o tamanho do banco rapidamente
- Torna queries lentas (PostgreSQL não é otimizado para blobs grandes em JSON)
- Aumenta o payload das respostas da API desnecessariamente

O correto seria armazenar arquivos em object storage (S3, MinIO, Cloudflare R2) e guardar apenas a URL no banco.

### 5. Concorrência do worker está errada

Em `campaignQueue.ts`:
```typescript
const worker = new Worker('campaigns', handler, { connection: redisConnection, concurrency: 1 });
// ...
log.worker('Campaign worker iniciado (concurrency: 3)'); // ← log mentiroso
```

O worker está configurado com `concurrency: 1` mas o log diz 3. Mais importante: com concorrência 1, uma campanha grande bloqueia qualquer outra operação na fila. Se o delay entre mensagens é de 20-60s e há 500 leads, a fila fica ocupada por horas.

### 6. Sem autenticação

Não há nenhum middleware de autenticação em nenhuma rota. Qualquer pessoa com acesso à rede pode:
- Listar todos os leads
- Disparar campanhas
- Ler todas as conversas
- Modificar configurações de IA

Para um sistema interno isso pode ser aceitável temporariamente, mas precisa ser documentado como risco consciente, não ignorado.

### 7. Polling agressivo no frontend

O Inbox faz polling a cada 3 segundos para mensagens e 5 segundos para a lista de conversas. Com múltiplos usuários abertos simultaneamente, isso gera carga constante no banco. O correto seria WebSocket ou Server-Sent Events para push de novas mensagens.

### 8. `engagementScore` calculado de forma inconsistente

No schema, `engagementScore` é inicializado com uma subquery no migration manual:
```sql
UPDATE "Lead" l SET "engagementScore" = (SELECT COUNT(*) FROM "Message" m WHERE ...)
```

Mas em `messageService.ts`, cada mensagem recebida faz `{ increment: 1 }`. Se o lead já tinha mensagens antes da coluna existir, o score inicial pode estar errado. Não há nenhuma validação ou recálculo periódico.

---

## Problemas médios

### Código legado não removido

O campo `messageTemplate` no modelo `Campaign` está marcado como "legado" nos comentários, mas ainda é usado no worker como fallback. O campo `pollEnabled/pollQuestion/pollOptionYes/pollOptionNo` também está marcado como "legado — agora dentro de steps", mas continua no schema e no worker. Isso cria dois caminhos de código paralelos que precisam ser mantidos em sincronia.

### `stepsExecutor.ts` e `messageService.ts` duplicam lógica

`sendCampaignMessageToLead` em `messageService.ts` e `executeSteps` em `stepsExecutor.ts` fazem coisas muito parecidas (enviar texto com fingerprint, enviar mídia, salvar no banco). A lógica de fingerprint evasion está duplicada entre os dois arquivos. Se alguém corrigir um bug em um, pode esquecer o outro.

### Sem tratamento de rate limit da Groq

Todas as chamadas à Groq são feitas sem retry em caso de `429 Too Many Requests`. Em uma campanha grande com `useAI: true`, múltiplos jobs podem chamar a Groq simultaneamente e começar a falhar silenciosamente. O `generateCampaignMessage` lança exceção que o worker captura como `FAILED`, mas não há distinção entre "Groq com rate limit" e "erro permanente".

### `autoReplyService.ts` usa `$queryRawUnsafe` para leitura simples

```typescript
const rows = await prisma.$queryRawUnsafe<AutoReplyConfigData[]>(
  `SELECT * FROM "AutoReplyConfig" WHERE id = 'default' LIMIT 1`
);
```

Isso poderia ser simplesmente `prisma.autoReplyConfig.findUnique({ where: { id: 'default' } })`. O uso de raw SQL aqui não tem justificativa técnica.

### Frontend sem tratamento de erro global

O `api/client.ts` não tem interceptor de erro. Erros 401, 500, ou de rede são tratados individualmente em cada componente (ou não são tratados). Um interceptor centralizado poderia mostrar toasts, fazer logout em 401, etc.

### Dois ícones de Settings na sidebar

```tsx
<NavLink to="/settings">Config. IA</NavLink>
<NavLink to="/config">Configurações</NavLink>
```

Dois itens com o mesmo ícone (`<Settings size={18} />`), nomes parecidos, rotas diferentes. Confuso para o usuário.

### `sendOptInComparison` importa funções que não existem no escopo

Em `warmingFlowService.ts`, a função `sendOptInComparison` chama `sendPollMessage` e `sendListMessage` sem importá-las — elas estão em `evolutionApi.ts` mas não aparecem nos imports do arquivo. Isso é um bug latente que só aparece se a função for chamada.

---

## Dívida técnica acumulada

| Item | Impacto | Esforço |
|------|---------|---------|
| Remover `runMigrations()` e usar Prisma Migrate | Alto | Médio |
| Corrigir SQL injection no autoReplyService | Alto | Baixo |
| Mover mídia para object storage | Alto | Alto |
| Adicionar autenticação básica (JWT ou session) | Alto | Médio |
| Substituir polling por WebSocket/SSE no Inbox | Médio | Alto |
| Remover código legado de campanhas | Médio | Médio |
| Unificar `stepsExecutor` e `messageService` | Médio | Médio |
| Adicionar retry com backoff para chamadas Groq | Médio | Baixo |
| Corrigir concorrência do worker | Baixo | Baixo |
| Remover `.env` do repositório e rotacionar segredos | Crítico | Baixo |

---

## Arquitetura geral

```
Frontend (React/Vite)
    ↓ HTTP (axios)
Backend (Express)
    ├── Routes → Services → Prisma → PostgreSQL
    ├── Webhook (Evolution API) → messageService → processIncomingMessage
    ├── BullMQ Worker → campaignQueue → stepsExecutor / messageService
    ├── node-cron (weeklyScheduler) → followUpService.processFollowUps()
    └── Groq SDK → messageGenerator / leadQualifier
```

A arquitetura é monolítica e adequada para o tamanho atual. Não há necessidade de microsserviços. O maior risco de escala é o banco de dados acumulando base64 de mídia.

---

## Resumo para o Claude

Este é um CRM imobiliário funcional com integração WhatsApp via Evolution API. O núcleo de negócio (pipeline de leads, campanhas, follow-up, inbox) está implementado e funcionando. Os problemas mais sérios são:

1. **Segurança**: `.env` no repo, SQL injection, sem autenticação
2. **Dados**: mídia em base64 no PostgreSQL vai explodir o banco
3. **Manutenibilidade**: sistema de migração manual duplica o Prisma, código legado não removido
4. **Confiabilidade**: sem retry para Groq, worker com concorrência errada

O código é escrito por alguém que entende o domínio e tem boas intenções técnicas, mas acumulou atalhos que precisam ser endereçados antes de escalar.
