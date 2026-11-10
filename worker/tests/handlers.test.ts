import { handleTaskEvent } from '../src/handlers';
import { prisma } from '../src/lib/prisma';
import { taskEvent } from './helpers/events';

// FR-L2, ARCH C6.3: one handler per action, each writing one AuditLog row.

jest.mock('../src/lib/prisma', () => ({
  prisma: { auditLog: { create: jest.fn() } },
}));

const create = (prisma as unknown as { auditLog: { create: jest.Mock } }).auditLog.create;

afterEach(() => {
  jest.resetAllMocks();
});

describe('handleTaskEvent', () => {
  it.each(['CREATED', 'UPDATED', 'DELETED'] as const)(
    'writes one %s AuditLog row for the task',
    async (action) => {
      const event = taskEvent(action);

      await handleTaskEvent(event);

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        data: { userId: event.userId, action, entity: 'Task', entityId: event.taskId },
      });
    },
  );

  it('rethrows a failed insert, so the consumer leaves the message pending (ADR-006)', async () => {
    create.mockRejectedValueOnce(new Error('Foreign key constraint failed'));

    await expect(handleTaskEvent(taskEvent())).rejects.toThrow('Foreign key constraint failed');
  });
});
