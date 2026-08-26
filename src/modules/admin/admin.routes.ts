import { Router } from 'express';
import {
   httpUpdateCreatorMetadata,
   httpReplayIndexerEvents,
   httpSetKeyTradingPaused,
} from './admin.controllers';
import { adminGuard } from '../../middlewares/admin-guard.middleware';

const adminRouter = Router();

adminRouter.patch('/creators/:id/metadata', httpUpdateCreatorMetadata);
adminRouter.post('/indexer/replay', adminGuard, httpReplayIndexerEvents);
adminRouter.post('/keys/:keyId/pause', adminGuard, httpSetKeyTradingPaused);
adminRouter.post('/keys/:keyId/resume', adminGuard, httpSetKeyTradingPaused);

export default adminRouter;
