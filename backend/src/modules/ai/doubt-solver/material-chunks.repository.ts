import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface NewChunk {
  content: string;
  embedding: number[];
}

const DEFAULT_MATCH_LIMIT = 4;

@Injectable()
export class MaterialChunksRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  /** Re-indexing a material replaces its chunks wholesale — there's no
   *  partial-update case (the source PDF doesn't change, only whether
   *  it's been indexed at all). */
  replaceForMaterial(
    materialId: string,
    batchId: string,
    tutorId: string,
    chunks: NewChunk[],
  ) {
    return this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('material_chunks')
        .where('material_id', '=', materialId)
        .execute();

      if (chunks.length === 0) return [];

      return trx
        .insertInto('material_chunks')
        .values(
          chunks.map((c, index) => ({
            id: newId(),
            material_id: materialId,
            batch_id: batchId,
            tutor_id: tutorId,
            chunk_index: index,
            content: c.content,
            embedding: vectorCast(c.embedding),
          })),
        )
        .returningAll()
        .execute();
    });
  }

  /** Point lookups by (materialId, chunkIndex) — used to re-fetch the
   *  exact chunk content a hint cited, so the follow-up full-answer call
   *  is grounded in precisely what the student was pointed to, not a
   *  fresh (possibly different) vector search. K is always small (the
   *  match limit from searchByBatch), so N point lookups beat building
   *  a composite-key IN-list query. */
  async findByRefs(refs: { materialId: string; chunkIndex: number }[]) {
    const results = await Promise.all(
      refs.map((r) =>
        this.db
          .selectFrom('material_chunks')
          .innerJoin('materials', 'materials.id', 'material_chunks.material_id')
          .select([
            'material_chunks.material_id',
            'materials.title as material_title',
            'material_chunks.chunk_index',
            'material_chunks.content',
          ])
          .where('material_chunks.material_id', '=', r.materialId)
          .where('material_chunks.chunk_index', '=', r.chunkIndex)
          .executeTakeFirst(),
      ),
    );
    return results.filter((r): r is NonNullable<typeof r> => r != null);
  }

  async hasChunks(materialId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('material_chunks')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('material_id', '=', materialId)
      .executeTakeFirstOrThrow();
    return Number(row.count) > 0;
  }

  /** Top-K nearest chunks in a batch by cosine distance (`<=>`), joined
   *  to the material for its title (a citation needs a human-readable
   *  source, not just an id). */
  searchByBatch(
    batchId: string,
    queryEmbedding: number[],
    limit = DEFAULT_MATCH_LIMIT,
  ) {
    return this.db
      .selectFrom('material_chunks')
      .innerJoin('materials', 'materials.id', 'material_chunks.material_id')
      .select([
        'material_chunks.material_id',
        'materials.title as material_title',
        'material_chunks.chunk_index',
        'material_chunks.content',
      ])
      .where('material_chunks.batch_id', '=', batchId)
      .orderBy(
        sql`material_chunks.embedding <=> ${vectorLiteral(queryEmbedding)}::vector`,
      )
      .limit(limit)
      .execute();
  }
}

function vectorLiteral(embedding: number[]): string {
  return `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;
}

function vectorCast(embedding: number[]) {
  return sql`${vectorLiteral(embedding)}::vector`;
}
