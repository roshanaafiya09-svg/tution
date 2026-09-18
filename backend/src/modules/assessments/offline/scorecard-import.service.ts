import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { AssessmentsRepository } from '../assessments.repository';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { MAX_SCORECARD_BYTES } from '../dto/scorecard-upload-url.dto';
import type { AssessmentsTable } from '../../../database/types';
import type { Selectable } from 'kysely';

const MAX_REPORTED_ERRORS = 50;
const HEADER_ALIASES: Record<string, 'studentId' | 'batchId' | 'score'> = {
  'student id': 'studentId',
  'batch id': 'batchId',
  score: 'score',
};

export interface ImportOutcome {
  status: 'success' | 'failed';
  rowCount: number;
  errors: string[];
  completedAt?: Date;
  completedLate?: boolean;
}

interface ParsedRow {
  rowNumber: number;
  studentId: string | null;
  batchId: string | null;
  score: number | null;
  hasFormulaCell: boolean;
}

/**
 * Full offline scorecard validation (spec §14/§15) + transactional
 * import (§15/§47: all valid results saved, or none). Every check runs
 * and every failure is collected before deciding pass/fail, so a teacher
 * sees the whole problem list in one round trip instead of fixing errors
 * one at a time.
 */
@Injectable()
export class ScorecardImportService {
  constructor(
    private readonly repository: AssessmentsRepository,
    private readonly batchesRepository: BatchesRepository,
  ) {}

  async import(
    assessment: Selectable<AssessmentsTable>,
    buffer: Buffer,
    uploadedBy: string,
  ): Promise<ImportOutcome> {
    if (buffer.byteLength > MAX_SCORECARD_BYTES) {
      return this.fail(assessment.id, uploadedBy, 0, [
        `File is too large (max ${Math.floor(MAX_SCORECARD_BYTES / 1024 / 1024)}MB)`,
      ]);
    }

    const workbook = new ExcelJS.Workbook();
    try {
      // exceljs's declared Buffer parameter type doesn't structurally
      // match this project's @types/node Buffer<ArrayBufferLike> — a
      // known upstream typing gap, not a real runtime mismatch.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await workbook.xlsx.load(buffer as any);
    } catch {
      return this.fail(assessment.id, uploadedBy, 0, [
        'Could not read this file — is it a valid .xlsx spreadsheet?',
      ]);
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return this.fail(assessment.id, uploadedBy, 0, [
        'The spreadsheet has no worksheet',
      ]);
    }

    const columnIndex = this.readHeader(sheet);
    if (!columnIndex) {
      return this.fail(assessment.id, uploadedBy, 0, [
        'Incorrect spreadsheet structure — expected columns: Student ID, Batch ID, Score',
      ]);
    }

    const rows = this.readRows(sheet, columnIndex);
    const errors: string[] = [];

    const batches = await this.repository.listBatchesForAssessment(
      assessment.id,
    );
    const selectedBatchIds = new Set(batches.map((b) => b.id));
    const batchNames = new Map(batches.map((b) => [b.id, b.title]));

    const rosterByBatch = new Map<string, Map<string, string | null>>();
    await Promise.all(
      batches.map(async (batch) => {
        const enrollments = await this.batchesRepository.listEnrollments(
          batch.id,
        );
        rosterByBatch.set(
          batch.id,
          new Map(
            enrollments
              .filter((e) => e.status === 'active')
              .map((e) => [e.student_id, e.display_name ?? null]),
          ),
        );
      }),
    );

    const seenStudentIds = new Set<string>();
    const validated: { batchId: string; studentId: string; score: number }[] =
      [];

    for (const row of rows) {
      if (row.hasFormulaCell) {
        errors.push(
          `Row ${row.rowNumber}: contains a formula — enter plain values only`,
        );
        continue;
      }
      if (!row.studentId || !row.batchId || row.score === null) {
        errors.push(`Row ${row.rowNumber}: missing a required value`);
        continue;
      }
      if (!selectedBatchIds.has(row.batchId)) {
        errors.push(
          `Row ${row.rowNumber}: batch "${row.batchId}" is not one of this assessment's selected batches`,
        );
        continue;
      }
      const roster = rosterByBatch.get(row.batchId);
      if (!roster || !roster.has(row.studentId)) {
        errors.push(
          `Row ${row.rowNumber}: student "${row.studentId}" is not an active member of batch "${batchNames.get(row.batchId) ?? row.batchId}"`,
        );
        continue;
      }
      if (seenStudentIds.has(row.studentId)) {
        errors.push(
          `Row ${row.rowNumber}: duplicate student "${row.studentId}" (already appears earlier in the file)`,
        );
        continue;
      }
      if (!Number.isInteger(row.score)) {
        errors.push(`Row ${row.rowNumber}: score must be a whole number`);
        continue;
      }
      if (row.score < 0) {
        errors.push(`Row ${row.rowNumber}: score cannot be negative`);
        continue;
      }
      if (assessment.max_score !== null && row.score > assessment.max_score) {
        errors.push(
          `Row ${row.rowNumber}: score ${row.score} exceeds the maximum score of ${assessment.max_score}`,
        );
        continue;
      }

      seenStudentIds.add(row.studentId);
      validated.push({
        batchId: row.batchId,
        studentId: row.studentId,
        score: row.score,
      });
    }

    for (const [batchId, roster] of rosterByBatch) {
      for (const [studentId, displayName] of roster) {
        if (!seenStudentIds.has(studentId)) {
          errors.push(
            `Missing required student "${displayName ?? studentId}" (${studentId}) in batch "${batchNames.get(batchId) ?? batchId}"`,
          );
        }
      }
    }

    if (errors.length > 0) {
      return this.fail(assessment.id, uploadedBy, rows.length, errors);
    }

    const now = new Date();
    const completedLate =
      assessment.scorecard_deadline_at !== null &&
      now.getTime() > new Date(assessment.scorecard_deadline_at).getTime();

    await this.repository.completeOfflineImport({
      assessmentId: assessment.id,
      uploadedBy,
      results: validated.map((v) => ({
        batchId: v.batchId,
        studentId: v.studentId,
        score: v.score,
        maxScore: assessment.max_score ?? v.score,
      })),
      completedAt: now,
      completedLate,
    });

    return {
      status: 'success',
      rowCount: validated.length,
      errors: [],
      completedAt: now,
      completedLate,
    };
  }

  private async fail(
    assessmentId: string,
    uploadedBy: string,
    rowCount: number,
    errors: string[],
  ): Promise<ImportOutcome> {
    const capped = errors.slice(0, MAX_REPORTED_ERRORS);
    await this.repository.recordScorecardImport({
      assessmentId,
      uploadedBy,
      status: 'failed',
      errorDetail: { errors: capped, totalErrorCount: errors.length },
      rowCount,
    });
    return { status: 'failed', rowCount, errors: capped };
  }

  private readHeader(
    sheet: ExcelJS.Worksheet,
  ): Record<'studentId' | 'batchId' | 'score', number> | null {
    const headerRow = sheet.getRow(1);
    const found: Partial<Record<'studentId' | 'batchId' | 'score', number>> =
      {};
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cellToPlainText(cell).trim().toLowerCase();
      const key = HEADER_ALIASES[text];
      if (key) found[key] = colNumber;
    });
    if (
      found.studentId === undefined ||
      found.batchId === undefined ||
      found.score === undefined
    ) {
      return null;
    }
    return found as Record<'studentId' | 'batchId' | 'score', number>;
  }

  private readRows(
    sheet: ExcelJS.Worksheet,
    columnIndex: Record<'studentId' | 'batchId' | 'score', number>,
  ): ParsedRow[] {
    const rows: ParsedRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const studentCell = row.getCell(columnIndex.studentId);
      const batchCell = row.getCell(columnIndex.batchId);
      const scoreCell = row.getCell(columnIndex.score);

      const hasFormulaCell = [studentCell, batchCell, scoreCell].some(
        (cell) => cell.type === ExcelJS.ValueType.Formula,
      );

      const studentId = cellToPlainText(studentCell).trim() || null;
      const batchId = cellToPlainText(batchCell).trim() || null;
      const scoreRaw = scoreCell.value;
      const score =
        typeof scoreRaw === 'number'
          ? scoreRaw
          : typeof scoreRaw === 'string' && scoreRaw.trim() !== ''
            ? Number(scoreRaw.trim())
            : null;

      if (studentId === null && batchId === null && score === null) return;

      rows.push({
        rowNumber,
        studentId,
        batchId,
        score: score !== null && Number.isFinite(score) ? score : null,
        hasFormulaCell,
      });
    });
    return rows;
  }
}

/** Never trusts a formula-result object's `.result` for a required
 *  column (see readRows' hasFormulaCell check) — this only stringifies
 *  plain scalar values encountered outside that path (e.g. the header
 *  row, which isn't security-sensitive). */
function cellToPlainText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value) {
    const { text } = value as { text: unknown };
    return typeof text === 'string' ? text : '';
  }
  return '';
}
