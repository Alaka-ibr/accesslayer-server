import { Router } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess, zodIssuesToDetails } from '../../utils/api-response.utils';
import { ErrorCode } from '../../constants/error.constants';
import { getKeyPriceHistory, PRICE_HISTORY_INTERVALS } from './key-price-history.service';

const querySchema = z.object({
   from: z.string().datetime(),
   to: z.string().datetime(),
   interval: z.enum(PRICE_HISTORY_INTERVALS),
});
const router = Router();

router.get('/:keyId/price-history', async (req, res, next) => {
   const parsed = querySchema.safeParse(req.query);
   if (!parsed.success) {
      sendError(res, 400, ErrorCode.VALIDATION_ERROR, 'Invalid price-history query', zodIssuesToDetails(parsed.error.issues));
      return;
   }
   const from = new Date(parsed.data.from);
   const to = new Date(parsed.data.to);
   if (from > to) {
      sendError(res, 400, ErrorCode.BAD_REQUEST, 'from must be before or equal to to');
      return;
   }
   try {
      sendSuccess(res, await getKeyPriceHistory(req.params.keyId, from, to, parsed.data.interval));
   } catch (error) {
      next(error);
   }
});

export default router;