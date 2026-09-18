const generateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent },
  })),
}));

import { InternalServerErrorException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GeminiAssessmentAiProvider } from './gemini-assessment-ai.provider';

function buildProvider() {
  const config = {
    getOrThrow: jest.fn().mockReturnValue('fake-key'),
    get: jest.fn().mockReturnValue('gemini-2.5-flash'),
  } as unknown as ConfigService;
  return new GeminiAssessmentAiProvider(config);
}

const VALID_QUESTION = {
  questionText: 'What is 2+2?',
  choices: ['3', '4', '5', '6'],
  correctChoiceIndex: 1,
  marks: 2,
  difficulty: 'easy',
  explanation: '2+2 equals 4.',
};

describe('GeminiAssessmentAiProvider.generateQuestions', () => {
  beforeEach(() => generateContent.mockReset());

  it('parses and returns valid structured questions', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ questions: [VALID_QUESTION] }),
    });

    const provider = buildProvider();
    const result = await provider.generateQuestions('material text', 1);

    expect(result).toEqual([
      {
        questionText: VALID_QUESTION.questionText,
        choices: VALID_QUESTION.choices,
        correctChoiceIndex: 1,
        marks: 2,
        difficulty: 'easy',
        explanation: VALID_QUESTION.explanation,
      },
    ]);
  });

  it('rejects malformed JSON rather than storing it', async () => {
    generateContent.mockResolvedValue({ text: 'not json at all' });
    const provider = buildProvider();

    await expect(
      provider.generateQuestions('material text', 1),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('rejects an empty questions array', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ questions: [] }),
    });
    const provider = buildProvider();

    await expect(
      provider.generateQuestions('material text', 1),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('rejects a question with an out-of-range correctChoiceIndex', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        questions: [{ ...VALID_QUESTION, correctChoiceIndex: 7 }],
      }),
    });
    const provider = buildProvider();

    await expect(
      provider.generateQuestions('material text', 1),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('rejects duplicate questions in the same response', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ questions: [VALID_QUESTION, VALID_QUESTION] }),
    });
    const provider = buildProvider();

    await expect(
      provider.generateQuestions('material text', 2),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('rejects a response missing required fields', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        questions: [{ questionText: 'incomplete' }],
      }),
    });
    const provider = buildProvider();

    await expect(
      provider.generateQuestions('material text', 1),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('rejects a response with no text content', async () => {
    generateContent.mockResolvedValue({ text: undefined });
    const provider = buildProvider();

    await expect(
      provider.generateQuestions('material text', 1),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});

describe('GeminiAssessmentAiProvider.evaluateSubjectiveAnswer', () => {
  beforeEach(() => generateContent.mockReset());

  it('clamps an out-of-range score into [0, maxMarks]', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ score: 999, feedback: 'great job' }),
    });
    const provider = buildProvider();

    const result = await provider.evaluateSubjectiveAnswer({
      question: 'Explain photosynthesis',
      studentAnswer: 'Plants make food from sunlight',
      referenceAnswer: 'Plants convert light energy into chemical energy',
      maxMarks: 5,
    });

    expect(result.score).toBe(5);
  });
});

describe('GeminiAssessmentAiProvider.healthCheck', () => {
  beforeEach(() => generateContent.mockReset());

  it('returns true when the provider responds', async () => {
    generateContent.mockResolvedValue({ text: 'ok' });
    const provider = buildProvider();
    await expect(provider.healthCheck()).resolves.toBe(true);
  });

  it('returns false rather than throwing when the provider call fails', async () => {
    generateContent.mockRejectedValue(new Error('network error'));
    const provider = buildProvider();
    await expect(provider.healthCheck()).resolves.toBe(false);
  });
});
