import { PrismaClient } from '@prisma/client';
import { PurchaseService } from '../purchase.service';

export class MarketplacePurchaseService {
    private prisma: PrismaClient;
    private purchaseService: PurchaseService;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
        this.purchaseService = new PurchaseService(prisma);
    }

    async createPurchase(data: any) {
        const { channel_id, buyer_telegram_id, seller_telegram_id, price } = data;

        if (!channel_id || !buyer_telegram_id || !seller_telegram_id || !price) {
            return { success: false, message: 'Missing required fields' };
        }

        // Resolve internal User IDs from Telegram IDs
        const [buyer, seller] = await Promise.all([
            this.prisma.user.findUnique({ where: { telegramId: buyer_telegram_id.toString() } }),
            this.prisma.user.findUnique({ where: { telegramId: seller_telegram_id.toString() } })
        ]);

        if (!buyer) return { success: false, message: 'Buyer not found' };
        if (!seller) return { success: false, message: 'Seller not found' };

        const result = await this.purchaseService.createPurchase(
            parseInt(channel_id),
            buyer.id,
            seller.id,
            parseFloat(price)
        );

        if (!result.success) {
            throw new Error(result.error);
        }

        return result.data;
    }

    async verifyPurchase(purchaseId: number, token: string) {
        const result = await this.purchaseService.verifyPurchase(purchaseId, token);

        if (!result.success) {
            throw new Error(result.error);
        }

        return result.success;
    }

    async getUserPurchases(telegramId: string) {
        const user = await this.prisma.user.findUnique({
            where: { telegramId: telegramId.toString() }
        });

        if (!user) {
            throw new Error('User not found');
        }

        return await this.purchaseService.getUserPurchases(user.id);
    }
}
