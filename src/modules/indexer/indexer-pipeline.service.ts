import { prisma } from '../../utils/prisma.utils';
import { updateOwnership } from '../ownership/ownership.service';
import { upsertPriceSnapshot } from './price-snapshot.service';
import { logger } from '../../utils/logger.utils';
import { processIndexerChainEvents, IndexerChainEvent } from '../../utils/indexer-event-processor.utils';

/**
 * Processes a batch of on-chain trade events (KEY_BOUGHT or KEY_SOLD).
 *
 * - Deduplicates the events based on txHash and eventIndex.
 * - Parses and validates each event.
 * - Creates an Activity record (representing the trade).
 * - Updates the KeyOwnership read model.
 * - Upserts the CreatorPriceSnapshot read model.
 */
export async function processTradeEvents(events: IndexerChainEvent[]): Promise<void> {
   await processIndexerChainEvents(events, async (event) => {
      // Validate event type
      if (event.eventType !== 'KEY_BOUGHT' && event.eventType !== 'KEY_SOLD') {
         return;
      }

      // Check required fields. Skip with a warn-level log if any is missing.
      const requiredFields = ['creatorId', 'actor', 'amount', 'price', 'feePaid', 'tradeAt', 'ledger'];
      for (const field of requiredFields) {
         if (event[field] === undefined || event[field] === null || event[field] === '') {
            logger.warn(
               { eventId: `${event.txHash}:${event.eventIndex}`, missingField: field },
               'Skipping trade event due to missing required field'
            );
            return;
         }
      }

      const { creatorId, actor, amount, price, feePaid, tradeAt, ledger } = event;

      // 1. Create corresponding Activity record
      await prisma.activity.create({
         data: {
            type: event.eventType as any,
            actor,
            creatorId,
            payload: {
               amount: Number(amount),
               price_at_trade: price.toString(),
               fee_paid: feePaid.toString(),
               ledger_sequence: Number(ledger),
            },
            createdAt: new Date(tradeAt),
         },
      });

      // 2. updateOwnership (balance delta: positive for buy, negative for sell)
      const balanceChange = event.eventType === 'KEY_BOUGHT' ? Number(amount) : -Number(amount);
      await updateOwnership(actor, creatorId, balanceChange, {
         event_type: event.eventType === 'KEY_BOUGHT' ? 'buy' : 'sell',
         ledger_sequence: Number(ledger),
      });

      // 3. upsertPriceSnapshot
      await upsertPriceSnapshot({
         creatorId,
         price: BigInt(price),
         tradeAt: new Date(tradeAt),
         ledger: Number(ledger),
      });
   });
}
