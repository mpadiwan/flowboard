import { setTimeout as delay } from 'node:timers/promises';
import { ensureGroup, runConsumer } from '../src/consumer';
import { prisma } from '../src/lib/prisma';
import { blockingRedis, redis } from '../src/lib/redis';
import { taskEvent, toFields } from './helpers/events';

// ADR-006, ARCH §9.3, AC-6.4, AC-6.5. Redis and Prisma are mocked, so each test scripts
// the replies of one consumer pass and asserts the commands the worker sends back.

jest.mock('node:timers/promises', () => ({ setTimeout: jest.fn() }));
jest.mock('../src/lib/prisma', () => ({
  prisma: { auditLog: { create: jest.fn() } },
}));
jest.mock('../src/lib/redis', () => ({
  redis: {
    xgroup: jest.fn(),
    xautoclaim: jest.fn(),
    xpending: jest.fn(),
    xack: jest.fn(),
    xadd: jest.fn(),
  },
  blockingRedis: { xreadgroup: jest.fn() },
}));

// ioredis overloads its stream commands, so the mocks are reached through plain jest.Mock.
interface RedisMock {
  xgroup: jest.Mock;
  xautoclaim: jest.Mock;
  xpending: jest.Mock;
  xack: jest.Mock;
  xadd: jest.Mock;
}

const commands = redis as unknown as RedisMock;
const xreadgroup = (blockingRedis as unknown as { xreadgroup: jest.Mock }).xreadgroup;
const create = (prisma as unknown as { auditLog: { create: jest.Mock } }).auditLog.create;

const STREAM = 'tasks:events';
const GROUP = 'audit-group';
const ID = '1700000000000-0';
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// isStopping for runConsumer: false for the first `passes` checks, then true.
function stopAfter(passes: number): () => boolean {
  let checks = 0;
  return () => checks++ >= passes;
}

// An XAUTOCLAIM reply that hands back one entry for retry.
function claimed(fields: string[]): [string, [string, string[]][], string[]] {
  return ['0-0', [[ID, fields]], []];
}

// An extended XPENDING reply giving the entry's delivery count.
function pending(deliveries: number): [string, string, number, number][] {
  return [[ID, 'worker-test', 30000, deliveries]];
}

function callOrder(mock: jest.Mock): number {
  return mock.mock.invocationCallOrder[0];
}

beforeEach(() => {
  jest.resetAllMocks();
  // An idle pass: nothing to reclaim, nothing new.
  commands.xautoclaim.mockResolvedValue(['0-0', [], []]);
  xreadgroup.mockResolvedValue(null);
  commands.xack.mockResolvedValue(1);
  commands.xadd.mockResolvedValue('1700000000001-0');
});

describe('ensureGroup', () => {
  it('creates audit-group from new messages only, creating the stream if needed', async () => {
    commands.xgroup.mockResolvedValue('OK');

    await ensureGroup();

    expect(commands.xgroup).toHaveBeenCalledWith('CREATE', STREAM, GROUP, '$', 'MKSTREAM');
  });

  it('accepts a group that already exists (BUSYGROUP)', async () => {
    commands.xgroup.mockRejectedValue(new Error('BUSYGROUP Consumer Group name already exists'));

    await expect(ensureGroup()).resolves.toBeUndefined();
  });

  it('rethrows any other error', async () => {
    commands.xgroup.mockRejectedValue(new Error('Connection is closed.'));

    await expect(ensureGroup()).rejects.toThrow('Connection is closed.');
  });
});

describe('new messages (XREADGROUP)', () => {
  it('writes the AuditLog row, then XACKs the message (AC-6.4)', async () => {
    const event = taskEvent('UPDATED');
    xreadgroup.mockResolvedValue([[STREAM, [[ID, toFields({ ...event })]]]]);

    await runConsumer(stopAfter(1));

    expect(create).toHaveBeenCalledWith({
      data: { userId: event.userId, action: 'UPDATED', entity: 'Task', entityId: event.taskId },
    });
    expect(commands.xack).toHaveBeenCalledWith(STREAM, GROUP, ID);
    expect(callOrder(create)).toBeLessThan(callOrder(commands.xack));
  });

  it('leaves an invalid message pending: no row, no XACK, no DLQ on delivery 1', async () => {
    const fields = toFields({ ...taskEvent(), taskId: 'not-a-uuid' });
    xreadgroup.mockResolvedValue([[STREAM, [[ID, fields]]]]);

    await runConsumer(stopAfter(1));

    expect(create).not.toHaveBeenCalled();
    expect(commands.xack).not.toHaveBeenCalled();
    expect(commands.xadd).not.toHaveBeenCalled();
  });
});

describe('retries (XAUTOCLAIM)', () => {
  it('claims messages idle for WORKER_CLAIM_IDLE_MS as this consumer', async () => {
    await runConsumer(stopAfter(1));

    expect(commands.xautoclaim).toHaveBeenCalledWith(
      STREAM,
      GROUP,
      'worker-test',
      30000,
      '0-0',
      'COUNT',
      10,
    );
  });

  it('XACKs a retried message once its row is written', async () => {
    commands.xautoclaim.mockResolvedValueOnce(claimed(toFields({ ...taskEvent() })));

    await runConsumer(stopAfter(1));

    expect(create).toHaveBeenCalledTimes(1);
    expect(commands.xack).toHaveBeenCalledWith(STREAM, GROUP, ID);
    expect(commands.xpending).not.toHaveBeenCalled();
  });

  it('leaves a message pending when it fails before its 3rd delivery', async () => {
    commands.xautoclaim.mockResolvedValueOnce(claimed(toFields({ ...taskEvent() })));
    create.mockRejectedValueOnce(new Error('Foreign key constraint failed'));
    commands.xpending.mockResolvedValue(pending(2));

    await runConsumer(stopAfter(1));

    expect(commands.xpending).toHaveBeenCalledWith(STREAM, GROUP, ID, ID, 1);
    expect(commands.xadd).not.toHaveBeenCalled();
    expect(commands.xack).not.toHaveBeenCalled();
  });

  it('moves a message that fails its 3rd delivery to tasks:events:dlq, then XACKs it (AC-6.5)', async () => {
    const fields = toFields({ ...taskEvent('DELETED') });
    commands.xautoclaim.mockResolvedValueOnce(claimed(fields));
    create.mockRejectedValueOnce(new Error('Foreign key constraint failed'));
    commands.xpending.mockResolvedValue(pending(3));

    await runConsumer(stopAfter(1));

    // The AGENTS.md DLQ format: originalId, the original fields unchanged, then
    // error, deliveries and failedAt.
    expect(commands.xadd).toHaveBeenCalledWith(
      'tasks:events:dlq',
      '*',
      'originalId',
      ID,
      ...fields,
      'error',
      'Foreign key constraint failed',
      'deliveries',
      '3',
      'failedAt',
      expect.stringMatching(ISO_TIMESTAMP) as string,
    );
    expect(commands.xack).toHaveBeenCalledWith(STREAM, GROUP, ID);
    expect(callOrder(commands.xadd)).toBeLessThan(callOrder(commands.xack));
  });

  it('records a non-Error failure as its string form in the DLQ entry', async () => {
    const fields = toFields({ ...taskEvent() });
    commands.xautoclaim.mockResolvedValueOnce(claimed(fields));
    create.mockRejectedValueOnce('connection reset');
    commands.xpending.mockResolvedValue(pending(3));

    await runConsumer(stopAfter(1));

    const xaddArgs = commands.xadd.mock.calls[0] as string[];
    expect(xaddArgs[xaddArgs.indexOf('error') + 1]).toBe('connection reset');
  });

  it('leaves a failed message pending when XPENDING no longer lists it', async () => {
    commands.xautoclaim.mockResolvedValueOnce(claimed(toFields({ ...taskEvent() })));
    create.mockRejectedValueOnce(new Error('Foreign key constraint failed'));
    commands.xpending.mockResolvedValue([]);

    await runConsumer(stopAfter(1));

    expect(commands.xadd).not.toHaveBeenCalled();
    expect(commands.xack).not.toHaveBeenCalled();
  });

  it('XACKs entries trimmed from the stream so XPENDING drains', async () => {
    commands.xautoclaim.mockResolvedValueOnce(['0-0', [], ['1-0', '2-0']]);

    await runConsumer(stopAfter(1));

    expect(commands.xack).toHaveBeenCalledWith(STREAM, GROUP, '1-0', '2-0');
  });
});

describe('failed passes', () => {
  it('waits, then recreates a vanished group from the start of the stream (NOGROUP)', async () => {
    commands.xautoclaim.mockRejectedValueOnce(new Error('NOGROUP No such key or consumer group'));
    commands.xgroup.mockResolvedValue('OK');

    await runConsumer(stopAfter(2));

    expect(delay).toHaveBeenCalledTimes(1);
    expect(commands.xgroup).toHaveBeenCalledWith('CREATE', STREAM, GROUP, '0', 'MKSTREAM');
    expect(commands.xautoclaim).toHaveBeenCalledTimes(2);
  });

  it('waits and retries without touching the group for any other error', async () => {
    commands.xautoclaim.mockRejectedValueOnce(new Error('Connection is closed.'));

    await runConsumer(stopAfter(2));

    expect(delay).toHaveBeenCalledTimes(1);
    expect(commands.xgroup).not.toHaveBeenCalled();
    expect(commands.xautoclaim).toHaveBeenCalledTimes(2);
  });
});
