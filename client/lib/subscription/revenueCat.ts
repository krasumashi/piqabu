import { Platform } from 'react-native';
import { Tier } from './tiers';

// RevenueCat API Keys - should be set via environment
const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || '';
const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || '';

let isInitialized = false;

export async function initRevenueCat(deviceId: string): Promise<void> {
    if (Platform.OS === 'web' || isInitialized) return;

    try {
        const Purchases = require('react-native-purchases').default;
        const apiKey = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;

        if (!apiKey) {
            console.log('[RevenueCat] No API key configured');
            return;
        }

        await Purchases.configure({
            apiKey,
            appUserID: deviceId,
        });
        isInitialized = true;
        console.log('[RevenueCat] Initialized');
    } catch (e) {
        console.error('[RevenueCat] Init failed:', e);
    }
}

export async function getSubscriptionStatus(): Promise<Tier> {
    if (Platform.OS === 'web' || !isInitialized) return 'free';

    try {
        const Purchases = require('react-native-purchases').default;
        const customerInfo = await Purchases.getCustomerInfo();
        const hasPro = customerInfo.entitlements.active['pro'] !== undefined;
        return hasPro ? 'pro' : 'free';
    } catch (e) {
        console.error('[RevenueCat] Status check failed:', e);
        return 'free';
    }
}

export async function getOfferings(): Promise<any[]> {
    if (Platform.OS === 'web' || !isInitialized) return [];

    try {
        const Purchases = require('react-native-purchases').default;
        const offerings = await Purchases.getOfferings();
        return offerings.current?.availablePackages || [];
    } catch (e) {
        console.error('[RevenueCat] Get offerings failed:', e);
        return [];
    }
}

export async function purchasePackage(packageId: string): Promise<boolean> {
    if (Platform.OS === 'web' || !isInitialized) return false;

    try {
        const Purchases = require('react-native-purchases').default;
        const offerings = await Purchases.getOfferings();
        const pkg = offerings.current?.availablePackages.find(
            (p: any) => p.identifier === packageId
        );

        if (!pkg) {
            console.error('[RevenueCat] Package not found:', packageId);
            return false;
        }

        const { customerInfo } = await Purchases.purchasePackage(pkg);
        return customerInfo.entitlements.active['pro'] !== undefined;
    } catch (e: any) {
        if (e.userCancelled) {
            console.log('[RevenueCat] Purchase cancelled by user');
        } else {
            console.error('[RevenueCat] Purchase failed:', e);
        }
        return false;
    }
}

export async function restorePurchases(): Promise<Tier> {
    if (Platform.OS === 'web' || !isInitialized) return 'free';

    try {
        const Purchases = require('react-native-purchases').default;
        const customerInfo = await Purchases.restorePurchases();
        return customerInfo.entitlements.active['pro'] !== undefined ? 'pro' : 'free';
    } catch (e) {
        console.error('[RevenueCat] Restore failed:', e);
        return 'free';
    }
}
