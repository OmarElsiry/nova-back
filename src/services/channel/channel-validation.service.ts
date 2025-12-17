import { z } from 'zod';

// Validation schemas
export const createChannelSchema = z.object({
  username: z.string().min(5).max(32).regex(/^[a-zA-Z0-9_]+$/),
  telegram_id: z.union([z.string(), z.number()]).transform(val => String(val)),
  display_name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  subscribers_count: z.number().int().min(0).default(0),
  is_verified: z.boolean().default(false),
  gifts: z.array(z.any()).optional(),
});

export const updateChannelSchema = z.object({
  display_name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  subscribers_count: z.number().int().min(0).optional(),
  is_verified: z.boolean().optional(),
});

export const createListingSchema = z.object({
  channel_id: z.number(),
  seller_id: z.union([z.string(), z.number()]).transform(val => Number(val)),
  price: z.number().min(0.1).max(10000),
});

export const updateListingSchema = z.object({
  price: z.number().min(0.1).max(10000).optional(),
  status: z.enum(['listed', 'sold', 'cancelled']).optional(),
});

export class ChannelValidationService {
  validateCreateChannel(data: unknown) {
    return createChannelSchema.parse(data);
  }

  validateUpdateChannel(data: unknown) {
    return updateChannelSchema.parse(data);
  }

  validateCreateListing(data: unknown) {
    return createListingSchema.parse(data);
  }

  validateUpdateListing(data: unknown) {
    return updateListingSchema.parse(data);
  }

  validateChannelUsername(username: string): boolean {
    return /^[a-zA-Z0-9_]{5,32}$/.test(username);
  }
}
