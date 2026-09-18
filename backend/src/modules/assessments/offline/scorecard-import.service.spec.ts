jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import * as ExcelJS from 'exceljs';
import { ScorecardImportService } from './scorecard-import.service';
import type { AssessmentsRepository } from '../assessments.repository';
import type { BatchesRepository } from '../../scheduling/batches/batches.repository';

const ASSESSMENT_ID = 'assessment-1';
const UPLOADED_BY = 'tutor-1';

const BATCHES = [
  { id: 'batch-a', title: 'Grade 6 A' },
  { id: 'batch-b', title: 'Grade 6 B' },
];

const ROSTER: Record<
  string,
  { id: string; status: string; student_id: string; display_name: string }[]
> = {
  'batch-a': [
    {
      id: 'e1',
      status: 'active',
      student_id: 'student-1',
      display_name: 'Asha',
    },
    {
      id: 'e2',
      status: 'active',
      student_id: 'student-2',
      display_name: 'Bala',
    },
  ],
  'batch-b': [
    {
      id: 'e3',
      status: 'active',
      student_id: 'student-3',
      display_name: 'Chitra',
    },
  ],
};

const ASSESSMENT: Parameters<ScorecardImportService['import']>[0] = {
  id: ASSESSMENT_ID,
  max_score: 100,
  scorecard_deadline_at: new Date('2026-09-22T18:29:59.000Z'),
} as never;

async function buildWorkbookBuffer(
  rows: (string | number)[][],
  headers = ['Student ID', 'Student Name', 'Batch ID', 'Batch Name', 'Score'],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Scorecard');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function buildService(overrides: {
  completeOfflineImport?: jest.Mock;
  recordScorecardImport?: jest.Mock;
}) {
  const repository = {
    listBatchesForAssessment: jest.fn().mockResolvedValue(BATCHES),
    completeOfflineImport:
      overrides.completeOfflineImport ?? jest.fn().mockResolvedValue({}),
    recordScorecardImport:
      overrides.recordScorecardImport ?? jest.fn().mockResolvedValue({}),
  } as unknown as AssessmentsRepository;

  const batchesRepository = {
    listEnrollments: jest.fn((batchId: string) =>
      Promise.resolve(ROSTER[batchId] ?? []),
    ),
  } as unknown as BatchesRepository;

  const service = new ScorecardImportService(repository, batchesRepository);
  return { service, repository, batchesRepository };
}

const VALID_ROWS: (string | number)[][] = [
  ['student-1', 'Asha', 'batch-a', 'Grade 6 A', 80],
  ['student-2', 'Bala', 'batch-a', 'Grade 6 A', 55],
  ['student-3', 'Chitra', 'batch-b', 'Grade 6 B', 90],
];

describe('ScorecardImportService.import — multi-batch (spec §14/§15)', () => {
  it('imports successfully when every required student across all selected batches is present exactly once', async () => {
    const completeOfflineImport = jest.fn().mockResolvedValue({});
    const { service } = buildService({ completeOfflineImport });
    const buffer = await buildWorkbookBuffer(VALID_ROWS);

    const outcome = await service.import(ASSESSMENT, buffer, UPLOADED_BY);

    expect(outcome.status).toBe('success');
    expect(outcome.rowCount).toBe(3);
    expect(completeOfflineImport).toHaveBeenCalledTimes(1);

    interface CompleteImportArg {
      assessmentId: string;
      results: { studentId: string; batchId: string; score: number }[];
    }
    const calls = completeOfflineImport.mock.calls as [CompleteImportArg][];
    const call = calls[0][0];
    expect(call.assessmentId).toBe(ASSESSMENT_ID);
    expect(call.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: 'student-1',
          batchId: 'batch-a',
          score: 80,
        }),
        expect.objectContaining({
          studentId: 'student-3',
          batchId: 'batch-b',
          score: 90,
        }),
      ]),
    );
  });

  it('marks completion late when uploaded after the deadline', async () => {
    const completeOfflineImport = jest.fn().mockResolvedValue({});
    const { service } = buildService({ completeOfflineImport });
    const buffer = await buildWorkbookBuffer(VALID_ROWS);

    // A deadline fixed safely in the past (rather than mocking the
    // clock forward) so this doesn't depend on — or destabilize —
    // real-timer-based async work inside exceljs's parser.
    const pastDeadlineAssessment = {
      ...ASSESSMENT,
      scorecard_deadline_at: new Date('2020-01-01T00:00:00.000Z'),
    } as never;

    const outcome = await service.import(
      pastDeadlineAssessment,
      buffer,
      UPLOADED_BY,
    );

    expect(outcome.completedLate).toBe(true);
    expect(completeOfflineImport).toHaveBeenCalledWith(
      expect.objectContaining({ completedLate: true }),
    );
  });

  it('fails validation and saves nothing when a required student is missing', async () => {
    const completeOfflineImport = jest.fn();
    const recordScorecardImport = jest.fn().mockResolvedValue({});
    const { service } = buildService({
      completeOfflineImport,
      recordScorecardImport,
    });
    // student-2 (batch-a) is missing entirely.
    const buffer = await buildWorkbookBuffer([
      ['student-1', 'Asha', 'batch-a', 'Grade 6 A', 80],
      ['student-3', 'Chitra', 'batch-b', 'Grade 6 B', 90],
    ]);

    const outcome = await service.import(ASSESSMENT, buffer, UPLOADED_BY);

    expect(outcome.status).toBe('failed');
    expect(
      outcome.errors.some((e) => e.includes('Missing required student')),
    ).toBe(true);
    expect(completeOfflineImport).not.toHaveBeenCalled();
    expect(recordScorecardImport).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('fails validation on a duplicate student row', async () => {
    const { service } = buildService({});
    const buffer = await buildWorkbookBuffer([
      ['student-1', 'Asha', 'batch-a', 'Grade 6 A', 80],
      ['student-1', 'Asha', 'batch-a', 'Grade 6 A', 81],
      ['student-2', 'Bala', 'batch-a', 'Grade 6 A', 55],
      ['student-3', 'Chitra', 'batch-b', 'Grade 6 B', 90],
    ]);

    const outcome = await service.import(ASSESSMENT, buffer, UPLOADED_BY);

    expect(outcome.status).toBe('failed');
    expect(outcome.errors.some((e) => e.includes('duplicate student'))).toBe(
      true,
    );
  });

  it('fails validation on an unknown student (not enrolled in the stated batch)', async () => {
    const { service } = buildService({});
    const buffer = await buildWorkbookBuffer([
      ['student-1', 'Asha', 'batch-a', 'Grade 6 A', 80],
      ['student-2', 'Bala', 'batch-a', 'Grade 6 A', 55],
      ['student-99', 'Ghost', 'batch-b', 'Grade 6 B', 90],
    ]);

    const outcome = await service.import(ASSESSMENT, buffer, UPLOADED_BY);

    expect(outcome.status).toBe('failed');
    expect(outcome.errors.some((e) => e.includes('not an active member'))).toBe(
      true,
    );
  });

  it('fails validation on a row referencing a batch that is not selected for this assessment', async () => {
    const { service } = buildService({});
    const buffer = await buildWorkbookBuffer([
      ['student-1', 'Asha', 'batch-a', 'Grade 6 A', 80],
      ['student-2', 'Bala', 'batch-a', 'Grade 6 A', 55],
      ['student-9', 'Zed', 'batch-z', 'Unrelated Batch', 90],
    ]);

    const outcome = await service.import(ASSESSMENT, buffer, UPLOADED_BY);

    expect(outcome.status).toBe('failed');
    expect(
      outcome.errors.some((e) =>
        e.includes("not one of this assessment's selected batches"),
      ),
    ).toBe(true);
  });

  it('fails validation on a negative score', async () => {
    const { service } = buildService({});
    const buffer = await buildWorkbookBuffer([
      ['student-1', 'Asha', 'batch-a', 'Grade 6 A', -5],
      ['student-2', 'Bala', 'batch-a', 'Grade 6 A', 55],
      ['student-3', 'Chitra', 'batch-b', 'Grade 6 B', 90],
    ]);

    const outcome = await service.import(ASSESSMENT, buffer, UPLOADED_BY);

    expect(outcome.status).toBe('failed');
    expect(outcome.errors.some((e) => e.includes('cannot be negative'))).toBe(
      true,
    );
  });

  it("fails validation on a score above the assessment's maximum", async () => {
    const { service } = buildService({});
    const buffer = await buildWorkbookBuffer([
      ['student-1', 'Asha', 'batch-a', 'Grade 6 A', 500],
      ['student-2', 'Bala', 'batch-a', 'Grade 6 A', 55],
      ['student-3', 'Chitra', 'batch-b', 'Grade 6 B', 90],
    ]);

    const outcome = await service.import(ASSESSMENT, buffer, UPLOADED_BY);

    expect(outcome.status).toBe('failed');
    expect(
      outcome.errors.some((e) => e.includes('exceeds the maximum score')),
    ).toBe(true);
  });

  it('rejects an incorrectly structured spreadsheet (missing required columns)', async () => {
    const { service } = buildService({});
    const buffer = await buildWorkbookBuffer(
      [['student-1', 80]],
      ['Name', 'Marks'],
    );

    const outcome = await service.import(ASSESSMENT, buffer, UPLOADED_BY);

    expect(outcome.status).toBe('failed');
    expect(
      outcome.errors.some((e) => e.includes('Incorrect spreadsheet structure')),
    ).toBe(true);
  });

  it('rejects a cell containing a formula rather than a plain value (formula-injection defense)', async () => {
    const { service } = buildService({});
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Scorecard');
    sheet.addRow([
      'Student ID',
      'Student Name',
      'Batch ID',
      'Batch Name',
      'Score',
    ]);
    sheet.addRow(['student-1', 'Asha', 'batch-a', 'Grade 6 A', 80]);
    sheet.addRow(['student-2', 'Bala', 'batch-a', 'Grade 6 A', 55]);
    // Score cell is a formula, not a plain number.
    sheet.getCell('E4').value = { formula: 'SUM(1,2)', result: 3 };
    sheet.getCell('A4').value = 'student-3';
    sheet.getCell('C4').value = 'batch-b';
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const outcome = await service.import(ASSESSMENT, buffer, UPLOADED_BY);

    expect(outcome.status).toBe('failed');
    expect(outcome.errors.some((e) => e.includes('formula'))).toBe(true);
  });

  it('rejects an unparseable file', async () => {
    const { service } = buildService({});
    const outcome = await service.import(
      ASSESSMENT,
      Buffer.from('not a real xlsx file'),
      UPLOADED_BY,
    );

    expect(outcome.status).toBe('failed');
  });
});
