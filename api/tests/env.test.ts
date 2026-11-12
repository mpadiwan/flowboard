// ARCH §11.3: config/env.ts validates process.env once, at import, and stops the process
// on a bad value. Loaded in an isolated module registry so the cached env stays untouched.

class ExitCalled extends Error {}

afterEach(() => {
  jest.restoreAllMocks();
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
