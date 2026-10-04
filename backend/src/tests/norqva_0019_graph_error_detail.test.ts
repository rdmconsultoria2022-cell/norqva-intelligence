import { describe, it, expect } from 'vitest';
import { MetaMutatingClient } from '../services/meta/metaMutatingClient';

describe('NORQVA-0019 — Meta Graph error detail', () => {
  it('appends code, subcode, user title/message and blamed fields', () => {
    const text = MetaMutatingClient.describeGraphError({
      message: 'Invalid parameter',
      code: 100,
      error_subcode: 1885366,
      error_user_title: 'Público inválido',
      error_user_msg: 'A idade máxima não pode ser alterada com público Advantage+.',
      error_data: '{"blame_field_specs":[["targeting","age_max"]]}'
    });
    expect(text).toContain('Invalid parameter');
    expect(text).toContain('code 100, subcode 1885366');
    expect(text).toContain('Público inválido');
    expect(text).toContain('Advantage+');
    expect(text).toContain('[campos: [["targeting","age_max"]]]');
  });

  it('degrades to the plain message and to empty for missing errors', () => {
    expect(MetaMutatingClient.describeGraphError({ message: 'Invalid parameter' })).toBe('Invalid parameter');
    expect(MetaMutatingClient.describeGraphError({ message: 'x', error_data: 'not json' })).toBe('x');
    expect(MetaMutatingClient.describeGraphError(undefined)).toBe('');
  });
});
