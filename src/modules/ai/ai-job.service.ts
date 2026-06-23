import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { AiGeneratedCampaign } from './ai-campaign.types';
import type { AiGeneratedMenu } from './ai-menu.types';
import { AiService } from './ai.service';
import { AiCampaignService } from './campaign.service';
import type { GenerateCampaignDto } from './dto/generate-campaign.dto';
import type { GenerateMenuDto } from './dto/generate-menu.dto';

type AiJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
type AiJobKind = 'menu' | 'campaign';

type MenuJobResult = {
  draftId: string;
  menu: AiGeneratedMenu;
  source: 'deepseek' | 'mock';
};

type CampaignJobResult = {
  draftId: string;
  campaign: AiGeneratedCampaign;
  source: 'deepseek' | 'mock';
};

type AiJobResult = MenuJobResult | CampaignJobResult;

type AiJob = {
  id: string;
  kind: AiJobKind;
  status: AiJobStatus;
  createdAt: string;
  updatedAt: string;
  result?: AiJobResult;
  error?: string;
};

@Injectable()
export class AiJobService {
  private readonly jobs = new Map<string, AiJob>();

  constructor(
    private readonly aiService: AiService,
    private readonly aiCampaignService: AiCampaignService,
  ) {}

  startMenuGeneration(dto: GenerateMenuDto) {
    const job = this.createJob('menu');
    void this.runJob(job.id, async () => this.aiService.generateMenu(dto));
    return this.presentJob(job);
  }

  startCampaignGeneration(dto: GenerateCampaignDto) {
    const job = this.createJob('campaign');
    void this.runJob(job.id, async () => this.aiCampaignService.generateCampaign(dto));
    return this.presentJob(job);
  }

  getJob(id: string) {
    const job = this.jobs.get(id);
    return job ? this.presentJob(job) : null;
  }

  private createJob(kind: AiJobKind) {
    const now = new Date().toISOString();
    const job: AiJob = {
      id: randomUUID(),
      kind,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  private async runJob(id: string, task: () => Promise<AiJobResult>) {
    this.updateJob(id, { status: 'running' });
    try {
      const result = await task();
      this.updateJob(id, { status: 'succeeded', result });
    } catch (error) {
      this.updateJob(id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'AI generation failed.',
      });
    }
  }

  private updateJob(id: string, patch: Partial<Pick<AiJob, 'status' | 'result' | 'error'>>) {
    const job = this.jobs.get(id);
    if (!job) {
      return;
    }
    this.jobs.set(id, {
      ...job,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  private presentJob(job: AiJob) {
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      result: job.result,
      error: job.error,
    };
  }
}
