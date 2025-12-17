
import { PrismaClient } from '@prisma/client';
import { calculateGiftFlags } from '../src/utils/giftUtils';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting gift flags backfill...');

    const channels = await prisma.channel.findMany({
        select: {
            id: true,
            username: true,
            giftsJson: true
        }
    });

    console.log(`Found ${channels.length} channels to process.`);

    let updatedCount = 0;

    for (const channel of channels) {
        const flags = calculateGiftFlags(channel.giftsJson);

        // Minimal optimization: check if we actually need to update? 
        // Since columns are new (defaults false), we should update everything that is true.
        // But for simplicity/robustness, update all.

        await prisma.channel.update({
            where: { id: channel.id },
            data: {
                hasUpgradedGifts: flags.hasUpgradedGifts,
                hasRegularGifts: flags.hasRegularGifts
            } as any // Cast for stale types
        });

        updatedCount++;
        if (updatedCount % 10 === 0) {
            process.stdout.write(`\rProcessed ${updatedCount}/${channels.length}`);
        }
    }

    console.log(`\n\n✅ Backfill complete! Processed ${updatedCount} channels.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
