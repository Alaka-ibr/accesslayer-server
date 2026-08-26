import type { Response } from 'express';
import { z } from 'zod';
import type { StellarSignedRequest } from '../../middlewares/stellar-signature.middleware';
import { ErrorCode } from '../../constants/error.constants';
import {
   sendError,
   sendSuccess,
   zodIssuesToDetails,
} from '../../utils/api-response.utils';
import { buyGateway } from './buy.service';
import { assertTradingActive, TradingPausedError } from '../keys/key-trading.service';

const buySchema = z.object({
   quantity: z.number().int().positive(),
   key_cost_xlm: z.number().nonnegative(),
   fee_xlm: z.number().nonnegative().default(0),
});

export async function httpBuyCreatorKey(
   req: StellarSignedRequest,
   res: Response
): Promise<void> {
   const parsed = buySchema.safeParse(req.body);
   if (!parsed.success) {
      sendError(
         res,
         422,
         ErrorCode.VALIDATION_ERROR,
         'Invalid buy request',
         zodIssuesToDetails(parsed.error.issues)
      );
      return;
   }

   const walletAddress = req.walletAddress!;
   try {
      await assertTradingActive(String(req.params.id));
   } catch (error) {
      if (error instanceof TradingPausedError) {
         sendError(res, 503, ErrorCode.INTERNAL_ERROR, error.message);
         return;
      }
      throw error;
   }
   const required =
      parsed.data.key_cost_xlm * parsed.data.quantity + parsed.data.fee_xlm;
   const balance = await buyGateway.getXlmBalance(walletAddress);
   if (balance < required) {
      sendError(
         res,
         422,
         ErrorCode.INSUFFICIENT_BALANCE,
         'Wallet does not have enough XLM for the purchase and fees'
      );
      return;
   }

   const result = await buyGateway.submitBuy({
      walletAddress,
      creatorId: String(req.params.id),
      quantity: parsed.data.quantity,
   });
   sendSuccess(res, result, 200);
}
