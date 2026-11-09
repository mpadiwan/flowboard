import type { Config } from 'jest';

// ADR-008: the bare `npx jest` must run serially against the test database and fail
// when coverage drops below 80%.
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tests/tsconfig.json' }],
  },
  maxWorkers: 1,
  globalSetup: '<rootDir>/tests/setup/globalSetup.ts',
  setupFilesAfterEnv: ['<rootDir>/tests/setup/afterEnv.ts'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/types/**'],
  coverageThreshold: {
    global: { lines: 80, branches: 80 },
  },
};

export default config;
