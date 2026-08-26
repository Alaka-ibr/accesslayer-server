// src/modules/creator/creator.routes.ts
import { Router } from 'express';
import { listCreators } from './creator.controller';
import {
   getCreatorProfileHandler,
   upsertCreatorProfileHandler,
} from './creator-profile.handlers';
import { httpGetCreatorAnalytics } from './creator-analytics.controller';
import { ROOT as CREATORS_ROOT } from '../../constants/creator.constants';
import { cacheControl } from '../../middlewares/cache-control.middleware';
import { CREATOR_PUBLIC_ROUTE_CACHE_PRESETS } from '../../constants/creator-public-cache.constants';
import { CREATOR_PUBLIC_ROUTE_NAMES } from '../../constants/creator-public-routes.constants';
import { requireCreatorProfileOwnership } from '../../middlewares/wallet-ownership.middleware';
import { requireKeyCreator } from '../../middlewares/jwt-auth.middleware';

const router = Router();

/**
 * Creator module route map:
 *
 * - GET /api/v1/creators
 * - GET /api/v1/creators/:creatorId/profile
 * - PUT /api/v1/creators/:creatorId/profile
 *
 * Note: The legacy creators list route is no longer mounted from `src/modules/index.ts` because
 * `src/modules/creators/creators.routes.ts` is the active public endpoint.
 */

/**
 * @route GET /api/v1/creators
 * @desc Get a paginated list of creators
 * @access Public
 */
router.get(
   CREATORS_ROOT,
   cacheControl(
      CREATOR_PUBLIC_ROUTE_CACHE_PRESETS[CREATOR_PUBLIC_ROUTE_NAMES.LIST]
   ),
   listCreators
);
// 405 handler for CREATORS_ROOT
router.all(CREATORS_ROOT, (_req, res) => {
   res.set('Allow', 'GET').sendStatus(405);
});

/**
 * @route GET /api/v1/creators/:creatorId/profile
 * @desc Get creator profile scaffold payload
 * @access Public
 */
router.get(
   '/:creatorId/profile',
   cacheControl(
      CREATOR_PUBLIC_ROUTE_CACHE_PRESETS[CREATOR_PUBLIC_ROUTE_NAMES.GET_PROFILE]
   ),
   getCreatorProfileHandler
);

/**
 * @route PUT /api/v1/creators/:creatorId/profile
 * @desc Upsert creator profile scaffold payload
 * @access Wallet ownership required — caller must send a `x-wallet-address`
 *         header tied to the creator profile being updated.
 */
router.put(
   '/:creatorId/profile',
   requireCreatorProfileOwnership('creatorId'),
   upsertCreatorProfileHandler
);
// 405 handler for /:creatorId/profile
router.all('/:creatorId/profile', (_req, res) => {
   res.set('Allow', 'GET, PUT').sendStatus(405);
});

/**
 * @route GET /api/v1/creators/:keyId/analytics
 * @desc Daily aggregated trade analytics (past 30 days) for the caller's key
 * @access JWT required — only the key creator may read analytics.
 */
router.get(
   '/:keyId/analytics',
   requireKeyCreator('keyId'),
   httpGetCreatorAnalytics
);
// 405 handler for /:keyId/analytics
router.all('/:keyId/analytics', (_req, res) => {
   res.set('Allow', 'GET').sendStatus(405);
});

export default router;
