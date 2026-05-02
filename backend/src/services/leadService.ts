import prisma from '../prisma/client';
import { Stage, PreferredContact, Prisma } from '@prisma/client';
import { autoEnrollLead } from './followUpService';
import { startWarmingFlow } from './warmingFlowService';

export interface CreateLeadInput {
  name?: string;
  phone: string;
  email?: string;
  source: string;
  stage?: Stage;
  assignedNumber: 1 | 2;
  preferredContact?: PreferredContact;
  observations?: string;
  tags?: string[];
}

export interface UpdateLeadInput {
  name?: string;
  email?: string;
  source?: string;
  stage?: Stage;
  nameCollected?: boolean;
  preferredContact?: PreferredContact;
  observations?: string;
  tags?: string[];
}

export interface LeadFilters {
  stage?: Stage;
  source?: string;
  assignedNumber?: number;
  nameCollected?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export async function createLead(data: CreateLeadInput) {
  const lead = await prisma.lead.create({
    data: {
      name: data.name || null,
      phone: data.phone,
      email: data.email,
      source: data.source,
      stage: data.stage || 'COLD',
      nameCollected: !!data.name,
      assignedNumber: data.assignedNumber,
      preferredContact: data.preferredContact || 'WHATSAPP',
      observations: data.observations,
      tags: data.tags || [],
    },
  });

  // Inscreve automaticamente em sequências elegíveis
  await autoEnrollLead(lead.id).catch(() => {});

  return lead;
}

export async function updateLead(id: string, data: UpdateLeadInput) {
  const lead = await prisma.lead.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
  });

  // Se mudou o stage, verifica novas sequências elegíveis
  if (data.stage) {
    await autoEnrollLead(id).catch(() => {});
  }

  return lead;
}

export async function getLeadById(id: string) {
  return prisma.lead.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { sentAt: 'desc' },
        take: 20,
      },
    },
  });
}

export async function getLeadByPhone(phone: string) {
  return prisma.lead.findUnique({
    where: { phone },
    include: {
      messages: {
        orderBy: { sentAt: 'desc' },
        take: 5,
      },
    },
  });
}

export async function listLeads(filters: LeadFilters = {}) {
  const { stage, source, assignedNumber, nameCollected, search, page = 1, limit = 20 } = filters;

  const where: Prisma.LeadWhereInput = {};

  if (stage) where.stage = stage;
  if (source) where.source = source;
  if (assignedNumber) where.assignedNumber = assignedNumber;
  if (nameCollected !== undefined) where.nameCollected = nameCollected;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: { select: { messages: true } },
      },
    }),
    prisma.lead.count({ where }),
  ]);

  return {
    leads,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function deleteLead(id: string) {
  return prisma.lead.delete({ where: { id } });
}

export async function updateLeadName(leadId: string, name: string) {
  return prisma.lead.update({
    where: { id: leadId },
    data: {
      name,
      nameCollected: true,
      stage: 'WARMING', // avança o stage ao coletar o nome
      updatedAt: new Date(),
    },
  });
}

export async function getLeadStats() {
  const [stageStats, sourceStats, total] = await Promise.all([
    prisma.lead.groupBy({
      by: ['stage'],
      _count: { id: true },
    }),
    prisma.lead.groupBy({
      by: ['source'],
      _count: { id: true },
    }),
    prisma.lead.count(),
  ]);

  return {
    total,
    byStage: stageStats.reduce(
      (acc, s) => ({ ...acc, [s.stage]: s._count.id }),
      {} as Record<string, number>
    ),
    bySource: sourceStats.reduce(
      (acc, s) => ({ ...acc, [s.source]: s._count.id }),
      {} as Record<string, number>
    ),
  };
}
