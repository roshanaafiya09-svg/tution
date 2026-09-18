import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export interface ScorecardTemplateRow {
  studentId: string;
  studentName: string;
  batchId: string;
  batchName: string;
}

/**
 * Generates the offline scorecard template fresh from the current
 * enrollment roster (never a cached/stale one — spec §13/§33). Every
 * assigned cell value is a plain string/number, never a formula object —
 * `exceljs` only interprets a value as a formula when explicitly given a
 * `{formula: ...}` object, so a plain string starting with "=" (an
 * unlikely but possible student name) is written and read back as
 * literal text, not executed. This is the formula-injection defense for
 * generated cells; scorecard-import.service.ts covers the read side.
 */
@Injectable()
export class ScorecardTemplateService {
  async build(rows: ScorecardTemplateRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Scorecard');

    sheet.columns = [
      { header: 'Student ID', key: 'studentId', width: 38 },
      { header: 'Student Name', key: 'studentName', width: 28 },
      { header: 'Batch ID', key: 'batchId', width: 38 },
      { header: 'Batch Name', key: 'batchName', width: 24 },
      { header: 'Score', key: 'score', width: 10 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const row of rows) {
      sheet.addRow({
        studentId: row.studentId,
        studentName: row.studentName,
        batchId: row.batchId,
        batchName: row.batchName,
        score: null,
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
