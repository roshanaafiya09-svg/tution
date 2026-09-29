import { isInternalCronDisabled } from './cron-gate';

describe('isInternalCronDisabled', () => {
  it('is enabled (false) by default — unset, empty, or any other value', () => {
    expect(isInternalCronDisabled({})).toBe(false);
    expect(isInternalCronDisabled({ DISABLE_INTERNAL_CRON: '' })).toBe(false);
    expect(isInternalCronDisabled({ DISABLE_INTERNAL_CRON: 'yes' })).toBe(
      false,
    );
    expect(isInternalCronDisabled({ DISABLE_INTERNAL_CRON: 'TRUE' })).toBe(
      false,
    ); // exact 'true' only — no case-insensitive surprises
  });

  it('is disabled only for the exact string "true"', () => {
    expect(isInternalCronDisabled({ DISABLE_INTERNAL_CRON: 'true' })).toBe(
      true,
    );
  });
});
