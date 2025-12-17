
import { PrismaClient } from '@prisma/client';
import { MarketplaceSearchService } from '../src/services/marketplace/marketplace-search.service';

const prisma = new PrismaClient();
const searchService = new MarketplaceSearchService(prisma);

async function main() {
    console.log('Testing Marketplace Search...');

    // 1. Test Unupgraded filter
    console.log('\nTesting "unupgraded" filter:');
    const unupgraded = await searchService.searchChannels({ giftStatus: 'unupgraded' });
    console.log(`Found ${unupgraded.items.length} unupgraded channels.`);
    unupgraded.items.forEach(c => {
        // Check flags - cast to any since types are stale
        const flags = { hasUpgraded: (c as any).hasUpgradedGifts, hasRegular: (c as any).hasRegularGifts };
        console.log(`- ${c.username}: flags=${JSON.stringify(flags)}`);
        if ((c as any).hasUpgradedGifts) {
            console.error('❌ FAIL: Found upgraded channel in unupgraded filter!');
        }
    });

    // 2. Test Upgraded filter
    console.log('\nTesting "upgraded" filter:');
    const upgraded = await searchService.searchChannels({ giftStatus: 'upgraded' });
    console.log(`Found ${upgraded.items.length} upgraded channels.`);
    upgraded.items.forEach(c => {
        const flags = { hasUpgraded: (c as any).hasUpgradedGifts, hasRegular: (c as any).hasRegularGifts };
        console.log(`- ${c.username}: flags=${JSON.stringify(flags)}`);
        if (!(c as any).hasUpgradedGifts) {
            console.error('❌ FAIL: Found unupgraded channel in upgraded filter!');
        }
    });

    // 3. Test Text Search
    console.log('\nTesting text search "Milkshake":');
    const textSearch = await searchService.searchChannels({ query: 'Milkshake' });
    console.log(`Found ${textSearch.items.length} matches.`);
    textSearch.items.forEach((item: any) => {
        console.log(`- ${item.username}: matches? ${item.giftsJson.includes('Milkshake')}`);
    });

    console.log('\nDone.');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
