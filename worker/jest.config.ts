import type { Config } from 'jest';

// ADR-008 #7: worker unit tests with Redis and Prisma mocked, so they run on the host
// with no stack up. Coverage is reported but has no threshold (OQ-6).
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tests/tsconfig.json' }],
  },
  setupFiles: ['<rootDir>/tests/setup/env.ts'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
};

export default config;
