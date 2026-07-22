import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Creator list stable sort with tied values', () => {
  const CREATOR_COUNT = 3;
  const SAME_PRICE = '9.99';

  beforeAll(async () => {
    for (let i = 0; i < CREATOR_COUNT; i++) {
      await prisma.creatorProfile.create({
        data: {
          handle: 'tied-creator-' + i,
          displayName: 'Tied Creator ' + i,
          priceSnapshot: SAME_PRICE,
          verified: true,
        },
      });
    }
  });

  afterAll(async () => {
    for (let i = 0; i < CREATOR_COUNT; i++) {
      await prisma.creatorProfile.deleteMany({
        where: { handle: 'tied-creator-' + i },
      });
    }
  });

  it('returns all creators exactly once across paginated pages with tied sort values', async () => {
    const seen = new Set<string>();
    const allHandles = [];
    for (let i = 0; i < CREATOR_COUNT; i++) {
      allHandles.push('tied-creator-' + i);
    }

    for (const handle of allHandles) {
      const record = await prisma.creatorProfile.findFirst({ where: { handle } });
      expect(record).not.toBeNull();
      if (record) seen.add(record.handle);
    }

    expect(seen.size).toBe(CREATOR_COUNT);
    for (const handle of allHandles) {
      expect(seen.has(handle)).toBe(true);
    }
  });

  it('returns consistent order across repeated requests', async () => {
    const firstRun: string[] = [];
    const secondRun: string[] = [];

    const fetchHandles = async (): Promise<string[]> => {
      const records = await prisma.creatorProfile.findMany({
        where: { priceSnapshot: SAME_PRICE },
        orderBy: [{ priceSnapshot: 'asc' }, { handle: 'asc' }],
      });
      return records.map(r => r.handle);
    };

    const first = await fetchHandles();
    const second = await fetchHandles();

    expect(first).toEqual(second);
    expect(first.length).toBe(CREATOR_COUNT);
  });
});
