import request from 'supertest';
import { prisma } from '../../utils/prisma.utils';

jest.mock('../../utils/prisma.utils', () => ({
  prisma: {
    activity: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    creatorProfile: {
      findMany: jest.fn(),
    },
  },
}));

import app from '../../app';

const mockPrisma = prisma as unknown as {
  activity: { findMany: jest.Mock; count: jest.Mock };
  creatorProfile: { findMany: jest.Mock };
};

const VALID_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

describe('GET /api/v1/wallets/:address/activity - Malformed Stellar Address', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 400 for address with wrong prefix', async () => {
    const response = await request(app)
      .get(
        '/api/v1/wallets/XBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB/activity'
      )
      .expect(400);

    expect(response.body.error).toBeDefined();
    expect(response.body.error.details).toBeDefined();
    expect(
      response.body.error.details.some((d: any) => d.field === 'address')
    ).toBeTruthy();
  });

  it('should return 400 for too-short address', async () => {
    const response = await request(app)
      .get('/api/v1/wallets/GASHORT/activity')
      .expect(400);

    expect(response.body.error).toBeDefined();
    expect(response.body.error.details).toBeDefined();
    expect(
      response.body.error.details.some((d: any) => d.field === 'address')
    ).toBeTruthy();
  });

  it('should return 400 for address with invalid characters', async () => {
    const response = await request(app)
      .get(
        '/api/v1/wallets/GA!!!INVALID!!!CHARACTERS!!!HERE!!!AAAAAAAAAAAAAAAAA/activity'
      )
      .expect(400);

    expect(response.body.error).toBeDefined();
    expect(response.body.error.details).toBeDefined();
    expect(
      response.body.error.details.some((d: any) => d.field === 'address')
    ).toBeTruthy();
  });

  it('should return 400 for completely invalid address format', async () => {
    const response = await request(app)
      .get('/api/v1/wallets/not-a-stellar-address/activity')
      .expect(400);

    expect(response.body.error).toBeDefined();
    expect(response.body.error.details).toBeDefined();
    expect(
      response.body.error.details.some((d: any) => d.field === 'address')
    ).toBeTruthy();
  });

  it('should return 200 with empty data array for a valid Stellar address with no trade history', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockPrisma.activity.count.mockResolvedValue(0);
    mockPrisma.creatorProfile.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get(`/api/v1/wallets/${VALID_ADDRESS}/activity`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toEqual([]);
    expect(response.body.data.meta.total).toBe(0);
    expect(response.body.data.meta.hasMore).toBe(false);
  });
});
