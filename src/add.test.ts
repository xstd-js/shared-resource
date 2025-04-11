import { describe, expect, it } from 'vitest';
import { add } from './add.js';

describe('add', () => {
  it('should return correct result', () => {
    expect(add(1, 2)).toBe(3);
  });
});
