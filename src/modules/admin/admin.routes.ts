import { Router } from 'express';
import {
   httpUpdateCreatorMetadata,
   httpReplayIndexerEvents,
   httpSetKeyTradingPaused,
   httpUpdateProtocolFee,
   httpGetAuditLog,
} from './admin.controllers';
import { httpSyncKeyState } from './key-sync.controllers';
import { adminGuard } from '../../middlewares/admin-guard.middleware';

const adminRouter = Router();

adminRouter.patch('/creators/:id/metadata', httpUpdateCreatorMetadata);
adminRouter.post('/indexer/replay', adminGuard, httpReplayIndexerEvents);
adminRouter.post('/keys/:keyId/pause', adminGuard, httpSetKeyTradingPaused);
adminRouter.post('/keys/:keyId/resume', adminGuard, httpSetKeyTradingPaused);
adminRouter.post('/keys/:keyId/sync', adminGuard, httpSyncKeyState);
adminRouter.patch('/protocol-fee', adminGuard, httpUpdateProtocolFee);
adminRouter.get('/audit-log', adminGuard, httpGetAuditLog);

export default adminRouter;
