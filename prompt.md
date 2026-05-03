# CRM Imobiliário + WhatsApp — Refatoração Completa + Campaign Builder Visual

## Contexto do projeto

CRM especializado para imobiliárias com integração WhatsApp via Evolution API. Stack atual:
- Backend: Node.js + TypeScript + Express + Prisma + PostgreSQL + BullMQ + Redis
- Frontend: React + TypeScript + Vite + TanStack Query + React Router
- IA: Groq (LLaMA 3.3 70B) para geração e variação de mensagens
- WhatsApp: Evolution API (self-hosted)

O sistema gerencia: importação de leads → aquecimento → campanhas em massa → follow-up automático → inbox para atendimento manual.

---

## PARTE 1 — Correções críticas obrigatórias (executar antes de qualquer nova feature)

### 1.1 Remover .env do repositório e rotacionar todos os segredos

O arquivo backend/.env está commitado no repositório. Todas as chaves estão comprometidas.

Ações requeridas:
1. Adicionar backend/.env ao .gitignore imediatamente
2. Remover o arquivo do histórico git com: git filter-branch ou git filter-repo
3. Criar backend/.env.example com todas as variáveis sem valores reais
4. Documentar no README como configurar o ambiente local

Variáveis que precisam ser rotacionadas pelo usuário após o fix:
- DATABASE_URL
- GROQ_API_KEY
- EVOLUTION_API_KEY
- Redis credentials

### 1.2 Corrigir SQL injection em autoReplyService.ts e followUpService.ts

Problema: uso de $executeRawUnsafe e $queryRawUnsafe com interpolação direta de strings.

Substituir TODOS os casos de $executeRawUnsafe e $queryRawUnsafe por:
- prisma.$executeRaw com template literals parametrizados (usando Prisma.sql), ou
- métodos do Prisma Client diretamente (prisma.autoReplyConfig.upsert(), findUnique(), etc.)

Exemplo do que está errado:
  prisma.$executeRawUnsafe(`INSERT INTO ... VALUES ('...${merged.message.replace(/'/g, "''")}...')`)

Exemplo do que está correto:
  prisma.autoReplyConfig.upsert({ where: { id: 'default' }, update: { message: merged.message }, create: { ... } })

Varrer todos os arquivos em src/ que usam $queryRawUnsafe ou $executeRawUnsafe e refatorar.

### 1.3 Remover runMigrations() de src/index.ts

O arquivo src/index.ts contém ~150 linhas de SQL raw executado no boot da aplicação, duplicando o que o Prisma Migrate já faz.

Ações requeridas:
1. Remover completamente o bloco runMigrations() e toda a função
2. Garantir que o schema Prisma reflita todas as colunas que eram criadas pelo SQL manual
3. Gerar uma nova migration com: npx prisma migrate dev --name sync_manual_columns
4. Atualizar o processo de deploy para usar: npx prisma migrate deploy
5. Remover o ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "steps" duplicado

### 1.4 Adicionar autenticação JWT

Nenhuma rota tem autenticação. Implementar:

1. Instalar: jsonwebtoken, bcryptjs e seus types
2. Criar middleware src/middleware/auth.ts que valida Bearer token
3. Criar rota POST /api/auth/login que retorna JWT (email + senha com bcrypt)
4. Criar modelo User no schema Prisma com: id, email, passwordHash, createdAt
5. Aplicar middleware em todas as rotas exceto POST /api/auth/login e POST /api/webhooks/*
6. No frontend, armazenar token em localStorage e incluir em todas as requisições via axios interceptor

---

## PARTE 2 — Correções importantes de confiabilidade

### 2.1 Mover mídia para object storage

Campanhas armazenam mediaAttachments como Json[] com base64 no PostgreSQL. Isso vai explodir o banco.

Implementar:
1. Instalar: @aws-sdk/client-s3 (compatível com MinIO e Cloudflare R2)
2. Criar serviço src/services/storageService.ts com métodos: uploadFile(buffer, mimetype, filename) → url, deleteFile(url)
3. Configurar via variáveis de ambiente: STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY
4. Atualizar o upload de mídia no frontend para enviar o arquivo para o backend
5. Backend faz upload para o object storage e salva apenas a URL no campo mediaUrl (string) no banco
6. Migrar schema: adicionar campo mediaUrl String? em MediaAttachment, deprecar o campo base64

### 2.2 Corrigir concorrência do worker em campaignQueue.ts

O worker está configurado com concurrency: 1 mas o log diz "concurrency: 3". Com concorrência 1 e delays de 20-60s por mensagem, uma campanha grande bloqueia a fila por horas.

Ações:
1. Definir concurrency: 3 no construtor do Worker para corresponder ao log
2. Garantir que o rate limiting anti-ban seja por chip/número, não por worker
3. Corrigir o log para refletir o valor real

### 2.3 Adicionar retry com backoff para chamadas à Groq

Todas as chamadas à Groq falham silenciosamente em caso de rate limit (429).

Implementar em src/services/messageGenerator.ts:
1. Wrapper com retry exponencial: tentar 3 vezes com delays de 1s, 2s, 4s
2. Distinguir erros recuperáveis (429, 503) de permanentes (400, 401)
3. Em caso de falha permanente, logar o erro com detalhes e marcar o job como FAILED com mensagem descritiva

### 2.4 Recalcular engagementScore consistentemente

O campo engagementScore é inicializado por SQL manual e incrementado por cada mensagem recebida, mas os dois mecanismos podem ficar fora de sincronia.

Implementar:
1. Função recalculateEngagementScore(leadId) em messageService.ts que faz COUNT real do banco
2. Chamar essa função após importação de leads em lote
3. Adicionar endpoint admin GET /api/admin/recalculate-scores para correção manual

---

## PARTE 3 — Campaign Builder Visual (funcionalidade principal nova)

### 3.1 Visão geral

Substituir o sistema atual de campanhas (steps[] em JSON) por um builder visual de fluxo baseado em nós conectados, inspirado no TypeBot mas focado em disparo em massa (não em bot conversacional).

O usuário constrói a campanha arrastando blocos em um canvas, conectando-os em sequência, e dispara para uma lista de leads segmentada.

### 3.2 Instalar dependências necessárias

No frontend:
  npm install @xyflow/react

Não instalar o TypeBot nem fazer fork dele. Usar apenas React Flow (@xyflow/react) como engine do canvas.

### 3.3 Novo schema de campanha no Prisma

Substituir o modelo Campaign atual por:

model Campaign {
  id          String   @id @default(cuid())
  name        String
  type        CampaignType
  status      CampaignStatus @default(DRAFT)
  nodes       Json     // CampaignNode[]
  edges       Json     // CampaignEdge[]
  targetFilter Json?   // LeadFilter — segmentação de leads alvo
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  dispatches  Dispatch[]
}

enum CampaignType {
  QUICK       // formulário simples, sem canvas
  SEGMENTED   // canvas completo com filtro de leads
  TEMPLATE    // parte de um template salvo
  FREE        // canvas completo sem restrições
}

model CampaignTemplate {
  id        String   @id @default(cuid())
  name      String
  nodes     Json
  edges     Json
  createdAt DateTime @default(now())
}

Tipos TypeScript para nodes e edges (criar em src/types/campaign.ts):

type CampaignNodeType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'delay'
  | 'poll'
  | 'list'
  | 'abTest'
  | 'condition'

interface CampaignNode {
  id: string
  type: CampaignNodeType
  position: { x: number; y: number }
  data: Record<string, unknown> // dados específicos por tipo
}

interface CampaignEdge {
  id: string
  source: string
  target: string
  label?: string // usado em abTest e condition
}

### 3.4 Tipos de campanha a implementar

QUICK (Campanha Rápida):
- Formulário simples sem canvas
- Campos: nome da campanha, mensagem de texto, segmentação básica por stage
- Disparo imediato ou agendado
- Para quando o usuário só quer mandar uma mensagem de texto rápida

SEGMENTED (Campanha Segmentada):
- Canvas completo com React Flow
- Filtro de leads por: stage, source (empreendimento), origin (canal), engagementScore, tags
- Preview do número de leads que serão atingidos antes de disparar

FREE (Campanha Livre):
- Canvas completo sem filtro pré-definido
- Seleciona leads manualmente ou por filtro livre
- Todos os tipos de bloco disponíveis

TEMPLATE:
- Igual FREE mas começa de um template salvo
- Botão "Salvar como template" disponível em qualquer campanha

### 3.5 Blocos do canvas a implementar

Cada bloco é um componente React em src/components/campaign-builder/nodes/:

BLOCO TEXT (TextNode):
  - Textarea com suporte a variáveis: {{nome}}, {{empreendimento}}, {{corretor}}
  - Toggle "Usar IA para variar mensagem" — se ativo, chama Groq para gerar variação única por lead
  - Preview da mensagem com fingerprint evasion aplicado

BLOCO IMAGE (ImageNode):
  - Upload de imagem (JPG, PNG, WebP) → envia para object storage
  - Campo de caption opcional
  - Preview da imagem

BLOCO VIDEO (VideoNode):
  - Upload de vídeo (MP4) → envia para object storage
  - Campo de caption opcional

BLOCO AUDIO (AudioNode):
  - Upload de áudio (MP3, OGG) ou gravação inline no browser
  - Toggle "Aplicar ruído PCM" (fingerprint evasion para áudio)

BLOCO DELAY (DelayNode):
  - Dois modos:
    a) Fixo: slider de segundos (mínimo e máximo para delay aleatório)
    b) IA: a IA decide o delay baseado no histórico do lead (chamar endpoint /api/ai/suggest-delay)
  - Exibe estimativa de tempo total da campanha no canvas

BLOCO POLL (PollNode):
  - Pergunta + 2 opções de resposta
  - Conecta em dois edges: "Opção A" e "Opção B"

BLOCO LIST (ListNode):
  - Título + até 10 itens de lista
  - Campo de rodapé opcional

BLOCO AB_TEST (ABTestNode):
  - Divide leads em dois grupos (percentual configurável, ex: 50/50 ou 70/30)
  - Dois edges de saída: "Variante A" e "Variante B"
  - Após disparo, exibe métricas de engajamento por variante

BLOCO CONDITION (ConditionNode):
  - Condição baseada em campo do lead: stage, engagementScore, tags, origin
  - Dois edges: "Verdadeiro" e "Falso"

### 3.6 Estrutura de arquivos a criar

src/components/campaign-builder/
  CampaignCanvas.tsx        — componente principal com React Flow
  CampaignSidebar.tsx       — painel lateral com lista de blocos arrastáveis
  CampaignToolbar.tsx       — barra superior: nome, salvar, disparar, preview
  nodes/
    TextNode.tsx
    ImageNode.tsx
    VideoNode.tsx
    AudioNode.tsx
    DelayNode.tsx
    PollNode.tsx
    ListNode.tsx
    ABTestNode.tsx
    ConditionNode.tsx
    index.ts                — exporta nodeTypes para o React Flow

src/pages/
  CampaignBuilder.tsx       — página /campanhas/nova e /campanhas/:id/editar
  CampaignList.tsx          — lista de campanhas com tipo, status, métricas

src/api/
  campaigns.ts              — funções de API para campanhas (CRUD + dispatch)

### 3.7 UX do canvas

- Sidebar esquerda: painel com blocos arrastáveis, agrupados por categoria (Conteúdo, Lógica, Mídia)
- Canvas central: React Flow com minimap, controls de zoom, snap to grid
- Painel direito: configurações do bloco selecionado (aparece ao clicar em um nó)
- Toolbar superior: nome da campanha (editável inline), botões Salvar / Preview / Disparar
- Preview antes de disparar: modal mostrando estimativa de tempo, número de leads, custo estimado em mensagens

### 3.8 Backend para o Campaign Builder

Novos endpoints a criar:

POST   /api/campaigns                    — criar campanha
GET    /api/campaigns                    — listar campanhas com paginação
GET    /api/campaigns/:id                — buscar campanha por id
PUT    /api/campaigns/:id                — atualizar campanha (nodes + edges + filter)
DELETE /api/campaigns/:id                — deletar campanha
POST   /api/campaigns/:id/dispatch       — iniciar disparo
GET    /api/campaigns/:id/status         — status do disparo em tempo real (SSE)

POST   /api/campaign-templates           — salvar template
GET    /api/campaign-templates           — listar templates
DELETE /api/campaign-templates/:id       — deletar template

POST   /api/ai/suggest-delay             — sugerir delay baseado no lead (Groq)
POST   /api/ai/vary-message              — gerar variação de mensagem (Groq, já existe — expor como endpoint)

GET    /api/campaigns/:id/status deve usar Server-Sent Events (SSE):
  - Emitir evento a cada mensagem enviada com: { leadId, status, sentAt, totalSent, totalPending }
  - Frontend exibe barra de progresso em tempo real
  - Encerrar stream quando campanha terminar

### 3.9 Worker de campanha atualizado

O campaignQueue.ts precisa ser atualizado para processar o novo formato de nodes/edges:

1. Ao receber um job de disparo, carregar a campanha e seus nodes/edges
2. Construir a sequência de execução a partir dos edges (topological sort)
3. Para cada lead no filtro, percorrer a sequência de nodes:
   - TextNode: gerar mensagem (com ou sem IA), aplicar fingerprint, enviar via Evolution API
   - ImageNode / VideoNode / AudioNode: baixar do object storage, enviar mídia
   - DelayNode: aguardar o tempo configurado (fixo ou sugerido pela IA)
   - ABTestNode: dividir leads aleatoriamente nos dois grupos
   - ConditionNode: avaliar condição e seguir edge correto
   - PollNode / ListNode: enviar via endpoint correspondente da Evolution API
4. Salvar resultado de cada mensagem na tabela Dispatch

---

## PARTE 4 — Limpeza de código legado

### 4.1 Remover campos legados do schema Prisma

Os seguintes campos estão marcados como legados nos comentários mas ainda existem no schema:
- Campaign.messageTemplate
- Campaign.pollEnabled, Campaign.pollQuestion, Campaign.pollOptionYes, Campaign.pollOptionNo

Ações:
1. Verificar se esses campos ainda são referenciados em algum worker ou service
2. Criar migration para remover os campos
3. Remover referências no código TypeScript

### 4.2 Unificar stepsExecutor.ts e messageService.ts

As funções sendCampaignMessageToLead e executeSteps duplicam lógica de fingerprint evasion.

Criar src/services/messageDispatcher.ts que centraliza:
- Aplicação de fingerprint evasion (importado de fingerprintEvasion.ts)
- Envio de texto via Evolution API
- Envio de mídia via Evolution API
- Salvamento do resultado no banco

Substituir as chamadas duplicadas em stepsExecutor.ts e messageService.ts por chamadas ao novo messageDispatcher.ts.

### 4.3 Corrigir sendOptInComparison em warmingFlowService.ts

A função sendOptInComparison chama sendPollMessage e sendListMessage sem importá-las.

Adicionar os imports corretos de evolutionApi.ts ou mover a função para o arquivo correto.

### 4.4 Corrigir navegação duplicada na sidebar do frontend

Existem dois itens com o mesmo ícone de Settings:
- "Config. IA" → /settings
- "Configurações" → /config

Unificar em uma única página de configurações com abas internas:
- Aba "IA": configurações do Groq, prompts, temperatura
- Aba "Geral": configurações da Evolution API, chips, horários
- Aba "Anti-ban": delays, limites de mensagens, pausa

### 4.5 Adicionar interceptor de erro global no frontend

O arquivo src/api/client.ts não tem interceptor. Adicionar:
1. Interceptor de response que captura erros 401 (limpar token + redirecionar para /login)
2. Interceptor de response que captura erros 500 e exibe toast genérico
3. Interceptor de request que adiciona o JWT Bearer token em todas as requisições

---

## PARTE 5 — Substituir polling por SSE no Inbox

O Inbox faz polling a cada 3s e 5s, gerando carga desnecessária.

Substituir por Server-Sent Events:

Backend:
1. Criar endpoint GET /api/inbox/stream que mantém conexão SSE aberta
2. Quando uma nova mensagem chega (webhook da Evolution API), emitir evento no stream
3. Formato do evento: { type: 'new_message' | 'update_conversation', data: {...} }

Frontend:
1. Substituir os setInterval de polling em Inbox.tsx por EventSource
2. Reconectar automaticamente em caso de queda (EventSource faz isso nativamente)
3. Manter o polling apenas como fallback caso SSE não seja suportado

---

## Restrições e convenções a seguir em todo o código

1. TypeScript strict mode — sem any implícito, sem ts-ignore sem comentário explicando o motivo
2. Todas as funções assíncronas devem ter try/catch com log estruturado (usar o logger existente)
3. Variáveis de ambiente devem ser acessadas via um arquivo src/config.ts centralizado, nunca process.env direto espalhado pelo código
4. Nomes de arquivos: camelCase para services e utils, PascalCase para componentes React
5. Commits atômicos por funcionalidade — não misturar correção de bug com nova feature no mesmo commit
6. Após cada parte concluída, rodar npx prisma generate para garantir que o client está atualizado

---

## Ordem de execução recomendada

Execute nesta ordem para minimizar risco de regressão:

1. PARTE 1 — Segurança (crítico, não pular)
2. PARTE 4 — Limpeza de legado (facilita as partes seguintes)
3. PARTE 2 — Confiabilidade (estabiliza o que já existe)
4. PARTE 3 — Campaign Builder (nova funcionalidade, sobre base limpa)
5. PARTE 5 — SSE no Inbox (otimização, pode ser feita em paralelo com Parte 3)

Comece pela PARTE 1.1 agora.