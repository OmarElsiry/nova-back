import { Hono } from 'hono';
import { ServiceFactory } from '../services';

// Import default exports from route files
import systemRoutes from './routes/system.routes';
import userRoutes from './routes/user.routes';
import marketplaceRoutes from './routes/marketplace.routes';
import channelRoutes from './routes/channel.routes';
import giftRoutes from './routes/gift.routes';
import withdrawalRoutes from './routes/withdrawal.routes';

export function registerAPIRoutes(app: Hono, services: ServiceFactory) {
  // Mount routes
  // Note: Services are currently instantiated inside the route files or generic usages.
  // In a future refactor, we should inject 'services' into these routes.

  app.route('/api', systemRoutes);
  app.route('/api/users', userRoutes);
  app.route('/api/marketplace', marketplaceRoutes);
  app.route('/api/channels', channelRoutes);
  app.route('/api/gifts', giftRoutes);
  app.route('/api/withdrawals', withdrawalRoutes);

  // Listing alias routes (proxy to channel routes)
  // These are required if the frontend explicitly calls /api/listings/...
  // However, relying on the marketplace routes for listings is better.

  // We can add simple handlers if needed, but for now let's ensure the main routes work.
}

// Export for potential testing or strict typing needs
export {
  systemRoutes,
  userRoutes,
  marketplaceRoutes,
  channelRoutes,
  giftRoutes,
  withdrawalRoutes
};
