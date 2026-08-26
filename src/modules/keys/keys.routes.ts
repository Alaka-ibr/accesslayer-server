// src/modules/keys/keys.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import {
   sendError,
   sendNotFound,
   sendSuccess,
   sendValidationError,
   zodIssuesToDetails,
} from '../../utils/api-response.utils';
import { ErrorCode } from '../../constants/error.constants';
import {
   getKeyPriceHistory,
   PRICE_HISTORY_INTERVALS,
} from './key-price-history.service';
import { getKeyFees, KeyNotFoundError } from './key-fees.service';
import { KeySearchQueryTooShortError, searchKeys } from './key-search.service';
import { KEY_SEARCH_MIN_QUERY_LENGTH } from '../../constants/notifications.constants';
import dividendRouter from '../dividends/dividend.routes';
import whitelistRouter from '../whitelist/whitelist.routes';

const priceHistoryQuerySchema = z.object({
   from: z.string().datetime(),
   to: z.string().datetime(),
   interval: z.enum(PRICE_HISTORY_INTERVALS),
});

const searchQuerySchema = z.object({
   q: z.string(),
});

const router = Router();

/**
 * GET /api/v1/keys/search?q=
 * Full-text search over creator name and description.
 * Must be registered before /:keyId routes.
 */
router.get('/search', async (req, res, next) => {
   const parsed = searchQuerySchema.safeParse(req.query);
   if (!parsed.success) {
      sendValidationError(
         res,
         'Invalid search query',
         zodIssuesToDetails(parsed.error.issues)
      );
      return;
   }

   const q = typeof parsed.data.q === 'string' ? parsed.data.q : '';
   if (q.trim().length < KEY_SEARCH_MIN_QUERY_LENGTH) {
      sendError(
         res,
         400,
         ErrorCode.VALIDATION_ERROR,
         `Query must be at least ${KEY_SEARCH_MIN_QUERY_LENGTH} characters`
      );
      return;
   }

   try {
      sendSuccess(res, { items: await searchKeys(q) });
   } catch (error) {
      if (error instanceof KeySearchQueryTooShortError) {
         sendError(res, 400, ErrorCode.VALIDATION_ERROR, error.message);
         return;
      }
      next(error);
   }
});

/**
 * GET /api/v1/keys/:keyId/fees
 * Protocol fee + creator royalty BPS for the buy confirmation modal.
 */
router.get('/:keyId/fees', async (req, res, next) => {
   try {
      sendSuccess(res, await getKeyFees(req.params.keyId));
   } catch (error) {
      if (error instanceof KeyNotFoundError) {
         sendNotFound(res, 'Key');
         return;
      }
      next(error);
   }
});

router.get('/:keyId/price-history', async (req, res, next) => {
   const parsed = priceHistoryQuerySchema.safeParse(req.query);
   if (!parsed.success) {
      sendError(
         res,
         400,
         ErrorCode.VALIDATION_ERROR,
         'Invalid price-history query',
         zodIssuesToDetails(parsed.error.issues)
      );
      return;
   }
   const from = new Date(parsed.data.from);
   const to = new Date(parsed.data.to);
   if (from > to) {
      sendError(
         res,
         400,
         ErrorCode.BAD_REQUEST,
         'from must be before or equal to to'
      );
      return;
   }
   try {
      sendSuccess(
         res,
         await getKeyPriceHistory(
            req.params.keyId,
            from,
            to,
            parsed.data.interval
         )
      );
   } catch (error) {
      next(error);
   }
});

// Mount dividend routes
router.use('/', dividendRouter);

// Mount whitelist routes
router.use('/', whitelistRouter);

export default router;
