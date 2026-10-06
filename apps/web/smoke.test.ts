import { describe, expect, it } from 'vitest';

describe('web app smoke', () => {
  it('loads the web package test runner', () => {
    expect(typeof globalThis).toBe('object');
  });
});
