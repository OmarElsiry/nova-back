
export function calculateGiftFlags(jsonStr: string | null | undefined): { hasUpgradedGifts: boolean; hasRegularGifts: boolean } {
    if (!jsonStr) return { hasUpgradedGifts: false, hasRegularGifts: false };
    try {
        const gifts = JSON.parse(jsonStr);
        if (!Array.isArray(gifts)) return { hasUpgradedGifts: false, hasRegularGifts: false };

        const hasUpgradedGifts = gifts.some((g: any) => g.category === 'upgraded');
        const hasRegularGifts = gifts.some((g: any) => g.category === 'regular');

        return { hasUpgradedGifts, hasRegularGifts };
    } catch (e) {
        return { hasUpgradedGifts: false, hasRegularGifts: false };
    }
}
