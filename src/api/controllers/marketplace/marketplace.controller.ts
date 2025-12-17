import { Hono } from 'hono';
import type { Context } from 'hono';
import { PrismaClient } from '@prisma/client';
import { MarketplaceFilterService, filterOptionsSchema, filterSchema } from '../../../services/marketplace/marketplace-filter.service';
import { MarketplaceSearchService } from '../../../services/marketplace/marketplace-search.service';

export class MarketplaceController {
  private router: Hono;
  private filterService: MarketplaceFilterService;
  private searchService: MarketplaceSearchService;

  constructor(private prisma: PrismaClient) {
    this.router = new Hono();
    this.filterService = new MarketplaceFilterService(prisma);
    this.searchService = new MarketplaceSearchService(prisma);
    this.setupRoutes();
  }

  private setupRoutes() {
    this.router.get('/options', this.getFilterOptions.bind(this));
    this.router.get('/', this.filterChannels.bind(this));
    this.router.get('/search', this.searchChannels.bind(this));
  }

  private async getFilterOptions(c: Context) {
    try {
      const query = c.req.query();
      const data = filterOptionsSchema.parse(query);

      const options = await this.filterService.getFilterOptions(data.tab);

      return c.json({
        success: true,
        data: {
          options,
          tab: data.tab || 'all'
        }
      });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to get filter options'
      }, 400);
    }
  }

  private async filterChannels(c: Context) {
    try {
      let query = c.req.query();
      query = this.transformQueryParams(query);
      const params = filterSchema.parse(query);

      const result = await this.searchService.searchChannels({
        ...params,
        status: params.status || 'listed'
      });

      return c.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to filter channels'
      }, 400);
    }
  }

  private async searchChannels(c: Context) {
    try {
      let query = c.req.query();
      query = this.transformQueryParams(query);
      const { q, ...params } = query;

      const result = await this.searchService.searchChannels({
        query: q as string,
        ...params
      });

      return c.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to search channels'
      }, 400);
    }
  }

  private transformQueryParams(query: Record<string, any>) {
    // Transform Sort
    if (query.sort) {
      switch (query.sort) {
        case 'latest':
          query.sortBy = 'date';
          query.sortOrder = 'desc';
          break;
        case 'price_asc':
          query.sortBy = 'price';
          query.sortOrder = 'asc';
          break;
        case 'price_desc':
          query.sortBy = 'price';
          query.sortOrder = 'desc';
          break;
        case 'popular':
          query.sortBy = 'popularity';
          query.sortOrder = 'desc';
          break;
      }
    }

    // Transform Filters
    if (query.price_from) query.minPrice = Number(query.price_from);
    if (query.price_to) query.maxPrice = Number(query.price_to);
    if (query.gift_category) query.category = query.gift_category;
    if (query.gift_status) query.giftStatus = query.gift_status;
    if (query.search) query.query = query.search;

    return query;
  }

  getRouter() {
    return this.router;
  }
}
