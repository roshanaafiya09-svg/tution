'use client';

import { useEffect } from 'react';
import { warmUpApi } from '@/lib/api';

/** Fires one fire-and-forget /health ping on first load so a sleeping
 *  backend (Render free plan) starts waking while the visitor is still
 *  on the landing or login page, instead of on their first real request. */
export function ApiWarmup() {
  useEffect(() => {
    warmUpApi();
  }, []);
  return null;
}
