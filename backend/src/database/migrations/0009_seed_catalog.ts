import { Kysely, sql } from 'kysely';
import { newId } from '../id';

/**
 * Reference data (blueprint §4: "CBSE, State Board, ICSE to start").
 * Tutors pick from this shared list rather than creating their own
 * subjects/curricula — Phase 1 has no admin UI for managing it, so it's
 * seeded here.
 */
export async function up(db: Kysely<any>): Promise<void> {
  const curricula = [
    { slug: 'cbse', name: 'CBSE' },
    { slug: 'tn-state-board', name: 'Tamil Nadu State Board' },
    { slug: 'icse', name: 'ICSE' },
  ];

  const curriculumIds: Record<string, string> = {};
  for (const c of curricula) {
    const id = newId();
    curriculumIds[c.slug] = id;
    await db
      .insertInto('curricula')
      .values({ id, slug: c.slug, name: c.name, country_code: 'IN' })
      .execute();
  }

  // Grades 1-12 for every curriculum — good enough for a tuition app;
  // no curriculum here actually varies its grade labels from "1".."12".
  for (const slug of Object.keys(curriculumIds)) {
    for (let grade = 1; grade <= 12; grade++) {
      await db
        .insertInto('grade_levels')
        .values({
          id: newId(),
          curriculum_id: curriculumIds[slug],
          ordinal: grade,
          label: `Grade ${grade}`,
        })
        .execute();
    }
  }

  const subjects = [
    { slug: 'mathematics', en: 'Mathematics', ta: 'கணிதம்' },
    { slug: 'physics', en: 'Physics', ta: 'இயற்பியல்' },
    { slug: 'chemistry', en: 'Chemistry', ta: 'வேதியியல்' },
    { slug: 'biology', en: 'Biology', ta: 'உயிரியல்' },
    { slug: 'english', en: 'English', ta: 'ஆங்கிலம்' },
    { slug: 'tamil', en: 'Tamil', ta: 'தமிழ்' },
    { slug: 'social-science', en: 'Social Science', ta: 'சமூக அறிவியல்' },
    { slug: 'computer-science', en: 'Computer Science', ta: 'கணினி அறிவியல்' },
    { slug: 'accountancy', en: 'Accountancy', ta: 'கணக்கியல்' },
    { slug: 'economics', en: 'Economics', ta: 'பொருளாதாரம்' },
  ];

  for (const s of subjects) {
    await db
      .insertInto('subjects')
      .values({
        id: newId(),
        slug: s.slug,
        name_i18n: JSON.stringify({ en: s.en, ta: s.ta }),
      })
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`delete from subjects;`.execute(db);
  await sql`delete from grade_levels;`.execute(db);
  await sql`delete from curricula;`.execute(db);
}
