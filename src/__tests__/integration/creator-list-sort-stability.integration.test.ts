import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Creator list stable sort with tied values', () => {
  const CREATOR_COUNT = 3;
  const SAME_PRICE = '9.99';

  beforeAll(async () => {
    // Seed three creators with identical prices
    for (let i = 0; i < CREATOR_COUNT; i++) {
      await prisma.creatorProfile.create({
        data: {
          handle: 	ied-creator-,
          displayName: Tied Creator ,
          priceSnapshot: SAME_PRICE,
          verified: true,
        },
      });
    }
  });

  afterAll(async () => {
    // Cleanup
    for (let i = 0; i < CREATOR_COUNT; i++) {
      await prisma.creatorProfile.deleteMany({
        where: { handle: 	ied-creator- },
      });
    }
  });

  it('returns all creators exactly once across paginated pages with tied sort values', async () => {
    const seen = new Set<string>();
    let cursor: string | undefined;

    // Fetch all pages
    do {
      const params = new URLSearchParams({
        sort: 'price',
        order: 'asc',
        limit: '2', // Small page size to force pagination
      });
      if (cursor) params.set('cursor', cursor);

      const response = await fetch(/api/v1/creators?);
      const body = await response.json();

      for (const creator of body.data) {
        if (creator.priceSnapshot === SAME_PRICE) {
          seen.add(creator.handle);
        }
      }

      cursor = body.meta?.nextCursor;
    } while (cursor);

    // All 3 tied creators should appear exactly once
    expect(seen.size).toBe(CREATOR_COUNT);
    for (let i = 0; i < CREATOR_COUNT; i++) {
      expect(seen.has(	ied-creator-)).toBe(true);
    }
  });

  it('returns consistent order across repeated requests', async () => {
    const firstRun: string[] = [];
    const secondRun: string[] = [];

    const fetchCreators = async (): Promise<string[]> => {
      const handles: string[] = [];
      let cursor: string | undefined;
      do {
        const params = new URLSearchParams({ sort: 'price', order: 'asc', limit: '2' });
        if (cursor) params.set('cursor', cursor);

        const response = await fetch(/api/v1/creators?);
        const body = await response.json();

        for (const creator of body.data) {
          if (creator.priceSnapshot === SAME_PRICE) {
            handles.push(creator.handle);
          }
        }
        cursor = body.meta?.nextCursor;
      } while (cursor);
      return handles;
    };

    const first = await fetchCreators();
    const second = await fetchCreators();

    // Order must be identical between runs
    expect(first).toEqual(second);
    expect(first.length).toBe(CREATOR_COUNT);
  });
});
