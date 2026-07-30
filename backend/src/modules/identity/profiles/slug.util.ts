import { randomBytes } from 'node:crypto';

/**
 * Blueprint §7: profiles_tutor.slug "feeds the public SEO page"
 * (/tutor/priya-physics-anna-nagar). A short random suffix keeps slugs
 * unique without a numbered-suffix collision loop.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function randomSlugSuffix(): string {
  return randomBytes(3).toString('hex');
}
