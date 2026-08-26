// src/modules/vesting/vesting.routes.ts
import { Router } from 'express';
import { sendNotFound, sendSuccess } from '../../utils/api-response.utils';
import { requireWalletParamMatch } from '../../middlewares/jwt-auth.middleware';
import { getVestingSchedule, VestingNotFoundError } from './vesting.service';
import { prisma } from '../../utils/prisma.utils';

const vestingRouter = Router();

/**
 * GET /api/v1/vesting/:keyId/:wallet
 *
 * Returns the vesting schedule and claimable amount for a beneficiary.
 * Requires a JWT whose wallet matches the :wallet path param.
 */
vestingRouter.get(
  '/:keyId/:wallet',
  requireWalletParamMatch('wallet'),
  async (req, res, next) => {
    try {
      const keyId = Array.isArray(req.params.keyId) ? req.params.keyId[0] : req.params.keyId;
      const wallet = Array.isArray(req.params.wallet) ? req.params.wallet[0] : req.params.wallet;
      const ledger = await prisma.indexedLedger.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { ledger: true },
      });
      const currentLedger = ledger?.ledger ?? 0;
      sendSuccess(
        res,
        await getVestingSchedule(keyId, wallet, currentLedger)
      );
    } catch (error) {
      if (error instanceof VestingNotFoundError) {
        sendNotFound(res, 'Vesting schedule');
        return;
      }
      next(error);
    }
  }
);

vestingRouter.all('/:keyId/:wallet', (_req, res) => {
  res.set('Allow', 'GET').sendStatus(405);
});

export default vestingRouter;
