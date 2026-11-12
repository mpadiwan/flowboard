import type { Env } from '../src/config/env';

// ARCH §11.3: config/env.ts validates process.env once, at import, and stops the process
// on a bad value. Loaded in an isolated module registry so the cached env stays untouched.

class ExitCalled extends Error {}

afterEach(() => {
  jest.restoreAllMocks();
});

// Loads a fresh env module with the given overrides on top of the test environment.
function loadEnvWith(overrides: Record<string, string>): Env {
  const replaced = jest.replaceProperty(process, 'env', { ...process.env, ...overrides });
  try {
    let loaded: Env | undefined;
    jest.isolateModules(() => {
      loaded = jest.requireActual<{ env: Env }>('../src/config/env').env;
    });
    if (!loaded) throw new Error('env module did not load');
    return loaded;
  } finally {
    replaced.restore();
  }
}

// Expects loading env with the overrides to exit, and returns what was written to stderr.
function exitMessage(overrides: Record<string, string>): string {
  jest.spyOn(process, 'exit').mockImplementation(() => {
    throw new ExitCalled();
  });
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  expect(() => loadEnvWith(overrides)).toThrow(ExitCalled);
  return String(stderr.mock.calls[0]?.[0]);
}

describe('ALLOWED_ORIGINS (NFR-4)', () => {
  it('splits a comma-separated list and trims each origin', () => {
    const env = loadEnvWith({ ALLOWED_ORIGINS: 'http://localhost:5173, https://app.example.com,' });

    expect(env.ALLOWED_ORIGINS).toEqual(['http://localhost:5173', 'https://app.example.com']);
  });

  it('rejects an entry that is not a URL', () => {
    expect(exitMessage({ ALLOWED_ORIGINS: 'http://localhost:5173,*' })).toContain(
      'ALLOWED_ORIGINS: Each origin must be a URL',
    );
  });

  it('rejects an empty list', () => {
    expect(exitMessage({ ALLOWED_ORIGINS: ' , ' })).toContain(
      'ALLOWED_ORIGINS: Must list at least one origin',
    );
  });
});

describe('env', () => {
  it('writes the invalid keys to stderr and exits with code 1', () => {
    const env = jest.replaceProperty(process, 'env', {
      ...process.env,
      JWT_ACCESS_SECRET: 'too-short',
    });
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new ExitCalled();
    });
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      expect(() => {
        jest.isolateModules(() => {
          jest.requireActual('../src/config/env');
        });
      }).toThrow(ExitCalled);
    } finally {
      env.restore();
    }

    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('Invalid environment configuration: JWT_ACCESS_SECRET:'),
    );
  });
});
