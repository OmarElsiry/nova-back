import { Hono } from 'hono';
import type { Context } from 'hono';
import { ServiceFactory } from '../../../services';
import { ChannelValidationService } from '../../../services/channel/channel-validation.service';

export class ChannelCrudController {
  private router: Hono;
  private validation: ChannelValidationService;

  constructor(private services: ServiceFactory) {
    this.router = new Hono();
    this.validation = new ChannelValidationService();
    this.setupRoutes();
  }

  private setupRoutes() {
    this.router.get('/', this.listChannels.bind(this));
    this.router.get('/:id', this.getChannel.bind(this));
    this.router.post('/', this.createChannel.bind(this));
    this.router.put('/:id', this.updateChannel.bind(this));
    this.router.delete('/:id', this.deleteChannel.bind(this));
  }

  private async listChannels(c: Context) {
    try {
      const marketplace = this.services.getMarketplaceService();
      const channels = await marketplace.getActiveChannels();
      return c.json({ success: true, data: channels });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  }

  private async getChannel(c: Context) {
    try {
      const id = c.req.param('id');
      const marketplace = this.services.getMarketplaceService();
      const channel = await marketplace.getChannelById(Number(id));
      
      if (!channel) {
        return c.json({ success: false, error: 'Channel not found' }, 404);
      }
      
      return c.json({ success: true, data: channel });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  }

  private async createChannel(c: Context) {
    try {
      const body = await c.req.json();
      const validated = this.validation.validateCreateChannel(body);
      const verification = this.services.getChannelVerificationService();
      const channel = await verification.verifyAndStoreChannel(
        validated.username,
        validated.telegram_id,
        validated.display_name,
        validated.description
      );
      return c.json({ success: true, data: channel }, 201);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  }

  private async updateChannel(c: Context) {
    try {
      const id = c.req.param('id');
      const body = await c.req.json();
      const validated = this.validation.validateUpdateChannel(body);
      const marketplace = this.services.getMarketplaceService();
      const channel = await marketplace.updateChannelDetails(Number(id), validated);
      return c.json({ success: true, data: channel });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  }

  private async deleteChannel(c: Context) {
    try {
      const id = c.req.param('id');
      const marketplace = this.services.getMarketplaceService();
      await marketplace.removeChannelListing(Number(id));
      return c.json({ success: true, message: 'Channel deleted' });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  }

  getRouter() {
    return this.router;
  }
}
