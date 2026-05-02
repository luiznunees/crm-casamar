# CRM Imobiliária + WhatsApp

Sistema completo de CRM com disparo de mensagens WhatsApp via Evolution API e geração de mensagens com IA (Groq).

## Stack

- **Backend**: Node.js + TypeScript + Express + Prisma (PostgreSQL) + BullMQ + Groq SDK
- **Frontend**: React + Vite + TanStack Query
- **WhatsApp**: Evolution API (self-hosted, 2 números)
- **Filas**: BullMQ + Redis
- **IA**: Groq — modelo `llama-3.3-70b-versatile` (tier gratuita)

---

## Pré-requisitos

- Node.js 18+
- PostgreSQL rodando
- Redis rodando
- Evolution API rodando com 2 instâncias configuradas
- Conta Groq com API key (gratuita em console.groq.com)

---

## Setup Backend

```bash
# 1. Instalar dependências (já feito)
cd backend && npm install

# 2. Copiar e preencher variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais

# 3. Rodar migrations do banco
npx prisma migrate dev --schema=src/prisma/schema.prisma --name init

# 4. Iniciar em desenvolvimento
npm run dev
```

O servidor sobe em `http://localhost:3001`.

---

## Setup Frontend

```bash
cd frontend && npm install
npm run dev
```

O dashboard abre em `http://localhost:5173`.

---

## Variáveis de Ambiente (backend/.env)

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL |
| `REDIS_URL` | URL do Redis (default: `redis://localhost:6379`) |
| `GROQ_API_KEY` | API key da Groq (console.groq.com) |
| `EVOLUTION_API_URL` | URL da Evolution API (ex: `http://localhost:8080`) |
| `EVOLUTION_API_KEY` | API key da Evolution API |
| `EVOLUTION_INSTANCE_1` | Nome da instância 1 (número 1) |
| `EVOLUTION_INSTANCE_2` | Nome da instância 2 (número 2) |
| `PORT` | Porta do servidor (default: 3001) |

---

## Configurar Webhook na Evolution API

Após subir o backend, configure o webhook em cada instância da Evolution API apontando para:

```
POST http://SEU_SERVIDOR:3001/webhook/evolution
```

Evento a habilitar: `messages.upsert`

---

## API Endpoints

### Leads
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/leads` | Listar leads (filtros: stage, source, search, page) |
| GET | `/api/leads/stats` | Estatísticas por stage e empreendimento |
| GET | `/api/leads/:id` | Buscar lead com histórico de mensagens |
| POST | `/api/leads` | Criar lead |
| PATCH | `/api/leads/:id` | Atualizar lead |
| PATCH | `/api/leads/:id/name` | Atualizar nome e marcar nameCollected=true |
| DELETE | `/api/leads/:id` | Deletar lead |

### Campanhas
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/campaigns` | Listar campanhas |
| GET | `/api/campaigns/:id` | Detalhes da campanha com leads |
| GET | `/api/campaigns/:id/stats` | Estatísticas de envio |
| POST | `/api/campaigns` | Criar campanha |
| POST | `/api/campaigns/:id/dispatch` | Disparar campanha imediatamente |
| PATCH | `/api/campaigns/:id/cancel` | Cancelar campanha |

### Mensagens
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/messages/lead/:leadId` | Histórico de mensagens do lead |
| POST | `/api/messages/send-name-request` | Enviar mensagem de coleta de nome |
| POST | `/api/messages/send-manual` | Enviar mensagem manual com template IA |

### WhatsApp
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/whatsapp/status` | Status de conexão dos 2 números |

### Webhook
| Método | Rota | Descrição |
|---|---|---|
| POST | `/webhook/evolution` | Receptor de mensagens da Evolution API |

---

## Fluxo de Mensagens

### Lead COLD sem nome
1. Lead criado → sistema enfileira `send-name-request` automaticamente
2. Mensagem gerada pela IA com objetivo único: pedir o nome
3. Lead responde → webhook detecta o nome → `nameCollected = true`, stage → `WARMING`

### Campanha
1. Criar campanha com `targetStages`, `targetSources` e `messageTemplate`
2. Disparar via dashboard ou agendamento
3. Sistema filtra leads elegíveis, enfileira com delay de 3s entre envios
4. Para cada lead: IA gera mensagem personalizada com seed de variação (`Date.now()`)
5. **Bloqueio automático**: leads sem nome coletado são pulados com log de aviso

### Agendamento Semanal
- Toda segunda-feira às 9h o scheduler verifica campanhas com `status=SCHEDULED` e `scheduledAt <= now`
- Também verifica a cada hora para campanhas atrasadas

---

## Regras de Negócio Implementadas

- **assignedNumber** é definido na criação e nunca muda
- Mensagens de campanha **nunca** são enviadas sem nome coletado
- Variação obrigatória de estilo via seed `Date.now()` + temperatura 1.0 no Groq
- Delay humanizado de ~3s entre mensagens de campanha
- Extração automática de nome de respostas curtas via regex
- Histórico das últimas 5 mensagens incluído no contexto da IA
