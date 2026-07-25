import supertest from 'supertest';
import app from '../../app';
import { prisma } from '../../utils/prisma.utils';
import * as tradingVolumeUtils from '../../utils/trading-volume.utils';

// Mock the database
jest.mock('../../utils/prisma.utils', () => ({
   prisma: {
      creatorProfile: {
         findMany: jest.fn(),
      },
      $disconnect: jest.fn(),
   },
}));

jest.mock('../../utils/trading-volume.utils', () => ({
   compute24hVolume: jest.fn(),
}));

const mockPrisma = prisma as unknown as {
   creatorProfile: { findMany: jest.Mock };
};

const mockCompute24hVolume = tradingVolumeUtils.compute24hVolume as jest.Mock;

describe('GET /api/v1/creators/trending', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('orders trending creators by 24h trading volume descending', async () => {
      // Mock creator profiles in the database
      const mockCreators = [
         {
            id: 'creator-1',
            handle: 'alice',
            displayName: 'Alice Creator',
            avatarUrl: 'https://example.com/alice.png',
            isVerified: true,
            createdAt: new Date('2026-07-25T12:00:00.000Z'),
            updatedAt: new Date('2026-07-25T12:00:00.000Z'),
         },
         {
            id: 'creator-2',
            handle: 'bob',
            displayName: 'Bob Creator',
            avatarUrl: null,
            isVerified: false,
            createdAt: new Date('2026-07-25T12:00:00.000Z'),
            updatedAt: new Date('2026-07-25T12:00:00.000Z'),
         },
         {
            id: 'creator-3',
            handle: 'charlie',
            displayName: 'Charlie Creator',
            avatarUrl: 'https://example.com/charlie.png',
            isVerified: true,
            createdAt: new Date('2026-07-25T12:00:00.000Z'),
            updatedAt: new Date('2026-07-25T12:00:00.000Z'),
         },
         {
            id: 'creator-zero',
            handle: 'zero',
            displayName: 'Zero Volume Creator',
            avatarUrl: null,
            isVerified: false,
            createdAt: new Date('2026-07-25T12:00:00.000Z'),
            updatedAt: new Date('2026-07-25T12:00:00.000Z'),
         },
      ];

      mockPrisma.creatorProfile.findMany.mockResolvedValue(mockCreators);

      // Seed 24h trade volumes of 1000, 500, 2000, and 0 stroops
      mockCompute24hVolume.mockImplementation((creatorId: string) => {
         if (creatorId === 'creator-1') return Promise.resolve(1000n); // Alice
         if (creatorId === 'creator-2') return Promise.resolve(500n);  // Bob
         if (creatorId === 'creator-3') return Promise.resolve(2000n); // Charlie
         if (creatorId === 'creator-zero') return Promise.resolve(0n); // Zero
         return Promise.resolve(0n);
      });

      const res = await supertest(app).get('/api/v1/creators/trending');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data.items;
      expect(items).toHaveLength(4);

      // Assert descending order: 2000 (Charlie), 1000 (Alice), 500 (Bob), 0 (Zero)
      expect(items[0].id).toBe('creator-3');
      expect(items[0].volume_24h).toBe('2000');

      expect(items[1].id).toBe('creator-1');
      expect(items[1].volume_24h).toBe('1000');

      expect(items[2].id).toBe('creator-2');
      expect(items[2].volume_24h).toBe('500');

      // Assert zero-volume creator appears last (as documented)
      expect(items[3].id).toBe('creator-zero');
      expect(items[3].volume_24h).toBe('0');
   });

   it('respects the pagination limit param', async () => {
      const mockCreators = [
         {
            id: 'creator-1',
            handle: 'alice',
            displayName: 'Alice Creator',
            avatarUrl: null,
            isVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
         },
         {
            id: 'creator-2',
            handle: 'bob',
            displayName: 'Bob Creator',
            avatarUrl: null,
            isVerified: false,
            createdAt: new Date(),
            updatedAt: new Date(),
         },
      ];

      mockPrisma.creatorProfile.findMany.mockResolvedValue(mockCreators);
      mockCompute24hVolume.mockResolvedValue(100n);

      // Call with limit=1
      const res = await supertest(app).get('/api/v1/creators/trending?limit=1');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
   });
});
