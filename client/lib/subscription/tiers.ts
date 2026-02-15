export type Tier = 'free' | 'pro';

export interface TierLimits {
    maxRooms: number;
    liveGlass: boolean;
    whisperDurationSec: number;
    revealImages: number;
    textLimit: number;
}

export const TIERS: Record<Tier, TierLimits> = {
    free: {
        maxRooms: 1,
        liveGlass: false,
        whisperDurationSec: 10,
        revealImages: 1,
        textLimit: 2000,
    },
    pro: {
        maxRooms: 5,
        liveGlass: true,
        whisperDurationSec: 60,
        revealImages: 10,
        textLimit: 10000,
    },
} as const;

export const PRICING = {
    monthly: {
        id: 'piqabu_pro_monthly',
        price: '$2.99',
        period: 'month',
    },
    yearly: {
        id: 'piqabu_pro_yearly',
        price: '$24.99',
        period: 'year',
        savings: '30%',
    },
} as const;
