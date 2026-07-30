import { Module } from '@nestjs/common';

/**
 * Bounded context: AI-assisted features, all routed through Claude with
 * model IDs/pricing in server config (never hardcoded, never client-side).
 * Empty in Phase 1. Phase 2 adds AI quiz generator + weekly parent digest.
 * Phase 3 adds the RAG doubt solver (pgvector).
 */
@Module({})
export class AiModule {}
