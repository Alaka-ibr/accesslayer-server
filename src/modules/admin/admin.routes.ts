import { Router } from 'express';
import { z } from 'zod';
import {
   httpUpdateCreatorMetadata,
   httpReplayIndexerEvents,
   httpSetKeyTradingPaused,
   httpUpdateProtocolFee,
   httpGetAuditLog,
} from './admin.controllers';
import { httpSyncKeyState } from './key-sync.controllers';
import { adminGuard, AdminRequest } from '../../middlewares/admin-guard.middleware';
import { requireKeyCreator, AuthenticatedRequest } from '../../middlewares/jwt-auth.middleware';
import {
   sendError,
   sendNotFound,
   sendSuccess,
   sendValidationError,
   sendConflict,
   sendForbidden,
   zodIssuesToDetails,
} from '../../utils/api-response.utils';
import { ErrorCode } from '../../constants/error.constants';
import { prisma } from '../../utils/prisma.utils';
import { logger } from '../../utils/logger.utils';

const adminRouter = Router();

adminRouter.patch('/creators/:id/metadata', httpUpdateCreatorMetadata);
adminRouter.post('/indexer/replay', adminGuard, httpReplayIndexerEvents);
adminRouter.post('/keys/:keyId/pause', adminGuard, httpSetKeyTradingPaused);
adminRouter.post('/keys/:keyId/resume', adminGuard, httpSetKeyTradingPaused);
adminRouter.post('/keys/:keyId/sync', adminGuard, httpSyncKeyState);
adminRouter.patch('/protocol-fee', adminGuard, httpUpdateProtocolFee);
adminRouter.get('/audit-log', adminGuard, httpGetAuditLog);

// ── Timelock proposal management ──────────────────────────────

const TIMELock_DELAY_MS = 48 * 60 * 60 * 1000; // 48 hours

const proposeSchema = z.object({
   changeType: z.string().min(1),
   payload: z.record(z.unknown()),
});

/**
 * POST /api/v1/admin/timelock/propose
 *
 * Submit a propose_config_change contract call and store the proposal
 * with its executionNotBefore timestamp (now + 48h).
 */
adminRouter.post('/timelock/propose', adminGuard, async (req: AdminRequest, res, next) => {
   try {
      const parsed = proposeSchema.safeParse(req.body);
      if (!parsed.success) {
         sendValidationError(res, 'Invalid request body', zodIssuesToDetails(parsed.error.issues));
         return;
      }

      const { changeType, payload } = parsed.data;
      const executionNotBefore = new Date(Date.now() + TIMELock_DELAY_MS);

      // TODO: submit propose_config_change contract call via Stellar SDK
      // On-chain failure should return 502 before reaching this point.

      const proposal = await prisma.governanceProposal.create({
         data: {
            keyId: 'timelock',
            proposalId: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: `Timelock: ${changeType}`,
            options: ['execute', 'cancel'],
            totalVotingWeight: '0',
            results: {},
            snapshotLedger: 0,
            expiresAt: executionNotBefore,
            status: 'active',
         },
      });

      // Store timelock-specific metadata via audit log
      await prisma.activity.create({
         data: {
            type: 'CREATOR_REGISTERED', // reuse existing type for timelock events
            actor: req.adminId || 'unknown',
            payload: {
               proposalId: proposal.proposalId,
               changeType,
               payload,
               executionNotBefore: executionNotBefore.toISOString(),
            },
         },
      });

      sendSuccess(res, {
         proposalId: proposal.proposalId,
         changeType,
         executionNotBefore: executionNotBefore.toISOString(),
         status: 'pending',
      }, 201);
   } catch (error) {
      logger.error({ error }, 'Timelock propose failed');
      next(error);
   }
});

/**
 * POST /api/v1/admin/timelock/:proposalId/execute
 *
 * Check the execution window is open and submit execute_config_change.
 */
adminRouter.post('/timelock/:proposalId/execute', adminGuard, async (req: AdminRequest, res, next) => {
   try {
      const proposalId = String(req.params.proposalId);

      const proposal = await prisma.governanceProposal.findFirst({
         where: { keyId: 'timelock', proposalId },
      });

      if (!proposal) {
         sendNotFound(res, 'Timelock proposal');
         return;
      }

      if (proposal.status !== 'active') {
         sendError(res, 400, ErrorCode.BAD_REQUEST, `Proposal is already ${proposal.status}`);
         return;
      }

      if (new Date() < proposal.expiresAt) {
         sendError(res, 400, ErrorCode.BAD_REQUEST, 'Execution window has not opened yet');
         return;
      }

      // TODO: submit execute_config_change contract call via Stellar SDK
      // On-chain failure should return 502 before reaching this point.

      await prisma.governanceProposal.update({
         where: { keyId_proposalId: { keyId: 'timelock', proposalId } },
         data: { status: 'closed', closedAt: new Date() },
      });

      await prisma.activity.create({
         data: {
            type: 'CREATOR_REGISTERED',
            actor: req.adminId || 'unknown',
            payload: {
               proposalId,
               action: 'executed',
            },
         },
      });

      sendSuccess(res, { proposalId, status: 'executed' });
   } catch (error) {
      logger.error({ error, proposalId: req.params.proposalId }, 'Timelock execute failed');
      next(error);
   }
});

/**
 * POST /api/v1/admin/timelock/:proposalId/cancel
 *
 * Cancel a pending timelock proposal.
 */
adminRouter.post('/timelock/:proposalId/cancel', adminGuard, async (req: AdminRequest, res, next) => {
   try {
      const proposalId = String(req.params.proposalId);

      const proposal = await prisma.governanceProposal.findFirst({
         where: { keyId: 'timelock', proposalId },
      });

      if (!proposal) {
         sendNotFound(res, 'Timelock proposal');
         return;
      }

      if (proposal.status !== 'active') {
         sendError(res, 400, ErrorCode.BAD_REQUEST, `Proposal is already ${proposal.status}`);
         return;
      }

      // TODO: submit cancel_config_change contract call via Stellar SDK
      // On-chain failure should return 502 before reaching this point.

      await prisma.governanceProposal.delete({
         where: { keyId_proposalId: { keyId: 'timelock', proposalId } },
      });

      await prisma.activity.create({
         data: {
            type: 'CREATOR_REGISTERED',
            actor: req.adminId || 'unknown',
            payload: {
               proposalId,
               action: 'cancelled',
            },
         },
      });

      sendSuccess(res, { proposalId, status: 'cancelled' });
   } catch (error) {
      logger.error({ error, proposalId: req.params.proposalId }, 'Timelock cancel failed');
      next(error);
   }
});

/**
 * GET /api/v1/admin/timelock/proposals
 *
 * List all pending and executed timelock proposals.
 */
adminRouter.get('/timelock/proposals', adminGuard, async (_req: AdminRequest, res, next) => {
   try {
      const proposals = await prisma.governanceProposal.findMany({
         where: { keyId: 'timelock' },
         orderBy: { createdAt: 'desc' },
      });

      sendSuccess(res, proposals.map(p => ({
         proposalId: p.proposalId,
         title: p.title,
         status: p.status,
         expiresAt: p.expiresAt.toISOString(),
         closedAt: p.closedAt?.toISOString() ?? null,
         createdAt: p.createdAt.toISOString(),
      })));
   } catch (error) {
      logger.error({ error }, 'Failed to list timelock proposals');
      next(error);
   }
});

// ── Supply cap management ─────────────────────────────────────

const supplyCapSchema = z.object({
   cap: z.number().int().positive(),
});

/**
 * POST /api/v1/creator/:keyId/supply-cap
 *
 * Set or update the supply cap for a creator key. Validates cap >= circulatingSupply.
 * Requires a JWT matching the key creator.
 */
adminRouter.post('/creator/:keyId/supply-cap', requireKeyCreator('keyId'), async (req: AuthenticatedRequest, res, next) => {
   try {
      const keyId = String(req.params.keyId);

      const parsed = supplyCapSchema.safeParse(req.body);
      if (!parsed.success) {
         sendValidationError(res, 'Invalid request body', zodIssuesToDetails(parsed.error.issues));
         return;
      }

      const { cap } = parsed.data;

      const creator = await prisma.creatorProfile.findUnique({
         where: { id: keyId },
         select: { id: true, supplyCap: true, circulatingSupply: true },
      });

      if (!creator) {
         sendNotFound(res, 'Key');
         return;
      }

      const circulating = Number(creator.circulatingSupply);
      if (cap < circulating) {
         sendConflict(res, `Cap cannot be lower than current circulating supply (${circulating})`);
         return;
      }

      // TODO: submit set_supply_cap contract call via Stellar SDK
      // On-chain failure should return 502 before reaching this point.

      const updated = await prisma.creatorProfile.update({
         where: { id: keyId },
         data: { supplyCap: cap },
      });

      await prisma.activity.create({
         data: {
            type: 'SUPPLY_CAP_SET',
            actor: req.user!.wallet,
            creatorId: keyId,
            payload: {
               keyId,
               previousCap: creator.supplyCap,
               newCap: cap,
               circulatingSupply: circulating,
               remainingMintable: cap - circulating,
            },
         },
      });

      sendSuccess(res, {
         supplyCap: updated.supplyCap,
         remainingMintable: cap - circulating,
      });
   } catch (error) {
      logger.error({ error, keyId: req.params.keyId }, 'Supply cap update failed');
      next(error);
   }
});


// ── Multi-sig Pause Coordination (#826) ──────────────────────────

/**
 * POST /api/v1/admin/keys/:keyId/pause/propose
 * Initiates a trading pause proposal requiring two distinct admin signatures.
 */
adminRouter.post("/keys/:keyId/pause/propose", adminGuard, async (req: AdminRequest, res, next) => {
   try {
      const keyId = String(req.params.keyId);

      const creator = await prisma.creatorProfile.findFirst({
         where: { OR: [{ id: keyId }, { handle: keyId }] },
      });

      if (!creator) {
         sendNotFound(res, "Key");
         return;
      }

      const proposalId = `pause-${creator.id}-${Date.now()}`;
      const proposerWallet = req.adminId || "unknown";

      // Store the pending proposal in the database
      const proposal = await prisma.pauseProposal.create({
         data: {
            proposalId,
            keyId: creator.id,
            proposerWallet,
            status: "pending",
         },
      });

      // Also record proposal in activity log
      await prisma.activity.create({
         data: {
            type: "TRADING_PAUSE_PROPOSED",
            actor: proposerWallet,
            creatorId: creator.id,
            payload: {
               proposalId,
               keyId: creator.id,
               notification: "pause_proposal_created",
            },
         },
      });

      sendSuccess(
         res,
         {
            proposalId: proposal.proposalId,
            keyId: creator.id,
            proposerWallet,
            status: "pending",
            notification: "pause_proposal_created",
         },
         201
      );
   } catch (error) {
      logger.error({ error, keyId: req.params.keyId }, "Pause propose failed");
      next(error);
   }
});

/**
 * POST /api/v1/admin/keys/:keyId/pause/approve
 * Second admin approves and executes the trading pause proposal.
 */
adminRouter.post("/keys/:keyId/pause/approve", adminGuard, async (req: AdminRequest, res, next) => {
   try {
      const keyId = String(req.params.keyId);
      const approverWallet = req.adminId || "unknown";

      const creator = await prisma.creatorProfile.findFirst({
         where: { OR: [{ id: keyId }, { handle: keyId }] },
      });

      if (!creator) {
         sendNotFound(res, "Key");
         return;
      }

      const proposal = await prisma.pauseProposal.findFirst({
         where: { keyId: creator.id, status: "pending" },
         orderBy: { createdAt: "desc" },
      });

      if (!proposal) {
         sendNotFound(res, "Pending pause proposal");
         return;
      }

      // Reject approve calls from the same wallet that proposed
      if (
         proposal.proposerWallet.toLowerCase() === approverWallet.toLowerCase()
      ) {
         sendForbidden(
            res,
            "Cannot approve your own pause proposal. Multi-sig requires two distinct admins."
         );
         return;
      }

      // Mark proposal executed and pause trading on the key
      await prisma.pauseProposal.update({
         where: { id: proposal.id },
         data: {
            status: "executed",
            approverWallet,
            executedAt: new Date(),
         },
      });

      await prisma.creatorProfile.update({
         where: { id: creator.id },
         data: { tradingPaused: true },
      });

      // Record approval in activity
      await prisma.activity.create({
         data: {
            type: "TRADING_PAUSE_APPROVED",
            actor: approverWallet,
            creatorId: creator.id,
            payload: {
               proposalId: proposal.proposalId,
               keyId: creator.id,
               notification: "trading_paused",
            },
         },
      });

      sendSuccess(res, {
         proposalId: proposal.proposalId,
         keyId: creator.id,
         status: "executed",
         isTradingPaused: true,
         notification: "trading_paused",
      });
   } catch (error) {
      logger.error({ error, keyId: req.params.keyId }, "Pause approve failed");
      next(error);
   }
});

export default adminRouter;

