import { mapEnabledStatus } from './user.entity.js';

describe('mapEnabledStatus', () => {
  it.each([
    [0, 'active'],
    ['0', 'active'],
    [1, 'inactive'],
    ['1', 'inactive'],
    [2, 'banned'],
    ['2', 'banned'],
    ['active', 'active'],
    ['inactive', 'inactive'],
    ['banned', 'banned'],
  ] as const)('maps enable value %s to %s', (enabled, expected) => {
    expect(mapEnabledStatus(enabled)).toBe(expected);
  });

  it('fails closed for an unknown enable value', () => {
    expect(mapEnabledStatus('disabled')).toBe('banned');
  });
});
