import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import https from 'https';
import { EventEmitter } from 'events';
import { normalizeStorageObjectPath, generateStorageSignedUrl } from '../controllers/api';

describe('Storage Signing Remediation & Path Normalization', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Path Normalization (normalizeStorageObjectPath)', () => {
    it('should strip exact redundant bucket prefix once', () => {
      const normalized = normalizeStorageObjectPath(
        'digital-products',
        'digital-products/TRATTORIA_EM_CASA_PREMIUM_FINAL.pdf'
      );
      expect(normalized).toBe('TRATTORIA_EM_CASA_PREMIUM_FINAL.pdf');
    });

    it('should preserve subfolders when redundant bucket prefix is removed', () => {
      const normalized = normalizeStorageObjectPath(
        'digital-products',
        'digital-products/recipes/trattoria/guide.pdf'
      );
      expect(normalized).toBe('recipes/trattoria/guide.pdf');
    });

    it('should strip leading slashes before and after bucket prefix removal', () => {
      const normalized1 = normalizeStorageObjectPath('digital-products', '/digital-products/file.pdf');
      expect(normalized1).toBe('file.pdf');

      const normalized2 = normalizeStorageObjectPath('digital-products', '///digital-products///nested/file.pdf');
      expect(normalized2).toBe('nested/file.pdf');
    });

    it('should preserve paths that do not start with the bucket name', () => {
      const normalized = normalizeStorageObjectPath('digital-products', 'products/file.pdf');
      expect(normalized).toBe('products/file.pdf');
    });

    it('should preserve paths that start with a prefix sharing bucket substring but differing by hyphen/name', () => {
      const normalized = normalizeStorageObjectPath('digital-products', 'digital-products-old/file.pdf');
      expect(normalized).toBe('digital-products-old/file.pdf');
    });

    it('should throw INVALID_STORAGE_PATH on empty or invalid inputs', () => {
      expect(() => normalizeStorageObjectPath('digital-products', '')).toThrow('INVALID_STORAGE_PATH');
      expect(() => normalizeStorageObjectPath('digital-products', null as any)).toThrow('INVALID_STORAGE_PATH');
      expect(() => normalizeStorageObjectPath('digital-products', undefined as any)).toThrow('INVALID_STORAGE_PATH');
    });

    it('should throw EMPTY_STORAGE_PATH if path only contains slashes or bucket name with no object key', () => {
      expect(() => normalizeStorageObjectPath('digital-products', '///')).toThrow('EMPTY_STORAGE_PATH');
      expect(() => normalizeStorageObjectPath('digital-products', 'digital-products/')).toThrow('EMPTY_STORAGE_PATH');
    });
  });

  describe('Production Credential Contract (generateStorageSignedUrl)', () => {
    it('should throw SUPABASE_URL_MISSING if SUPABASE_URL is not configured', async () => {
      delete process.env.SUPABASE_URL;
      await expect(generateStorageSignedUrl('digital-products', 'file.pdf', 60)).rejects.toThrow('SUPABASE_URL_MISSING');
    });

    it('should fail closed with SUPABASE_SERVICE_ROLE_KEY_MISSING in production if service role key is absent, without fallback to publishable key', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_PUBLISHABLE_KEY = 'mock_pub_key';

      const httpsSpy = vi.spyOn(https, 'request');
      const httpSpy = vi.spyOn(http, 'request');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(generateStorageSignedUrl('digital-products', 'digital-products/TRATTORIA_EM_CASA_PREMIUM_FINAL.pdf', 60))
        .rejects.toThrow('SUPABASE_SERVICE_ROLE_KEY_MISSING');

      expect(httpsSpy).not.toHaveBeenCalled();
      expect(httpSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('SUPABASE_SERVICE_ROLE_KEY_MISSING')
      );
    });

    it('should execute signing request with SUPABASE_SERVICE_ROLE_KEY and normalized path in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://test-project.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret_service_role_key_123';

      let capturedOptions: any = null;
      let capturedPayload = '';

      vi.spyOn(https, 'request').mockImplementation((options: any, callback?: any) => {
        capturedOptions = options;
        const reqEmitter: any = new EventEmitter();
        reqEmitter.write = vi.fn((data: string) => {
          capturedPayload += data;
        });
        reqEmitter.end = vi.fn(() => {
          const resEmitter: any = new EventEmitter();
          resEmitter.statusCode = 200;
          if (callback) callback(resEmitter);
          resEmitter.emit('data', JSON.stringify({ signedURL: '/storage/v1/object/sign/digital-products/TRATTORIA_EM_CASA_PREMIUM_FINAL.pdf?token=abc' }));
          resEmitter.emit('end');
        });
        return reqEmitter as any;
      });

      const result = await generateStorageSignedUrl('digital-products', 'digital-products/TRATTORIA_EM_CASA_PREMIUM_FINAL.pdf', 60);

      expect(capturedOptions.hostname).toBe('test-project.supabase.co');
      expect(capturedOptions.path).toBe('/storage/v1/object/sign/digital-products/TRATTORIA_EM_CASA_PREMIUM_FINAL.pdf');
      expect(capturedOptions.headers['Authorization']).toBe('Bearer secret_service_role_key_123');
      expect(capturedOptions.headers['apikey']).toBe('secret_service_role_key_123');
      expect(JSON.parse(capturedPayload)).toEqual({ expiresIn: 60 });
      expect(result).toBe('https://test-project.supabase.co/storage/v1/object/sign/digital-products/TRATTORIA_EM_CASA_PREMIUM_FINAL.pdf?token=abc');
    });

    it('should map 401/403 status to SUPABASE_STORAGE_AUTH_ERROR', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://test-project.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'invalid_key';

      vi.spyOn(https, 'request').mockImplementation((options: any, callback?: any) => {
        const reqEmitter: any = new EventEmitter();
        reqEmitter.write = vi.fn();
        reqEmitter.end = vi.fn(() => {
          const resEmitter: any = new EventEmitter();
          resEmitter.statusCode = 401;
          if (callback) callback(resEmitter);
          resEmitter.emit('data', JSON.stringify({ statusCode: '401', error: 'Unauthorized', message: 'Invalid JWT' }));
          resEmitter.emit('end');
        });
        return reqEmitter as any;
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(generateStorageSignedUrl('digital-products', 'file.pdf', 60))
        .rejects.toThrow('SUPABASE_STORAGE_AUTH_ERROR');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('SUPABASE_STORAGE_AUTH_ERROR')
      );
    });

    it('should map 404 status to SUPABASE_STORAGE_OBJECT_NOT_FOUND', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://test-project.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'valid_key';

      vi.spyOn(https, 'request').mockImplementation((options: any, callback?: any) => {
        const reqEmitter: any = new EventEmitter();
        reqEmitter.write = vi.fn();
        reqEmitter.end = vi.fn(() => {
          const resEmitter: any = new EventEmitter();
          resEmitter.statusCode = 404;
          if (callback) callback(resEmitter);
          resEmitter.emit('data', JSON.stringify({ error: 'Object not found' }));
          resEmitter.emit('end');
        });
        return reqEmitter as any;
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(generateStorageSignedUrl('digital-products', 'non_existent.pdf', 60))
        .rejects.toThrow('SUPABASE_STORAGE_OBJECT_NOT_FOUND');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('SUPABASE_STORAGE_OBJECT_NOT_FOUND')
      );
    });

    it('should map network errors to SUPABASE_STORAGE_NETWORK_ERROR', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://test-project.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'valid_key';

      vi.spyOn(https, 'request').mockImplementation((options: any) => {
        const reqEmitter: any = new EventEmitter();
        reqEmitter.write = vi.fn();
        reqEmitter.end = vi.fn(() => {
          reqEmitter.emit('error', new Error('ECONNRESET'));
        });
        return reqEmitter as any;
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(generateStorageSignedUrl('digital-products', 'file.pdf', 60))
        .rejects.toThrow('SUPABASE_STORAGE_NETWORK_ERROR');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('SUPABASE_STORAGE_NETWORK_ERROR')
      );
    });

    it('should sanitize logs and never log service role key, tokens, or raw credentials', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://test-project.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'super_secret_master_key_xyz987';

      const logs: string[] = [];
      vi.spyOn(console, 'error').mockImplementation((msg: string) => {
        logs.push(msg);
      });

      vi.spyOn(https, 'request').mockImplementation((options: any, callback?: any) => {
        const reqEmitter: any = new EventEmitter();
        reqEmitter.write = vi.fn();
        reqEmitter.end = vi.fn(() => {
          const resEmitter: any = new EventEmitter();
          resEmitter.statusCode = 500;
          if (callback) callback(resEmitter);
          resEmitter.emit('data', 'Internal error');
          resEmitter.emit('end');
        });
        return reqEmitter as any;
      });

      await expect(generateStorageSignedUrl('digital-products', 'file.pdf', 60))
        .rejects.toThrow('SUPABASE_STORAGE_SIGNING_ERROR');

      const allLogs = logs.join('\n');
      expect(allLogs).not.toContain('super_secret_master_key_xyz987');
      expect(allLogs).not.toContain('Bearer');
      expect(allLogs).not.toContain('apikey');
    });
  });
});
