const express = require('express');
const router = express.Router();
const { getTier, setSubscription, findByStripeCustomer } = require('../lib/subscriptionStore');

// Stripe is initialized lazily - only if STRIPE_SECRET_KEY is set
let stripe = null;

function getStripe() {
    if (!stripe) {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (!secretKey) {
            throw new Error('STRIPE_SECRET_KEY not configured');
        }
        stripe = require('stripe')(secretKey);
    }
    return stripe;
}

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Price ID mapping (set via environment or defaults)
const PRICE_IDS = {
    piqabu_pro_monthly: process.env.STRIPE_PRICE_MONTHLY || '',
    piqabu_pro_yearly: process.env.STRIPE_PRICE_YEARLY || '',
};

// Success/cancel URLs for checkout
const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL || 'http://localhost:8081/?subscription=success';
const CANCEL_URL = process.env.STRIPE_CANCEL_URL || 'http://localhost:8081/?subscription=cancelled';

/**
 * POST /api/create-checkout-session
 * Body: { deviceId: string, priceId: 'piqabu_pro_monthly' | 'piqabu_pro_yearly' }
 */
router.post('/api/create-checkout-session', express.json(), async (req, res) => {
    try {
        const { deviceId, priceId } = req.body;

        if (!deviceId || typeof deviceId !== 'string' || deviceId.length > 100) {
            return res.status(400).json({ error: 'Invalid deviceId' });
        }

        const stripePriceId = PRICE_IDS[priceId];
        if (!stripePriceId) {
            return res.status(400).json({ error: 'Invalid priceId' });
        }

        const s = getStripe();

        // Check if this device already has a Stripe customer
        const existing = require('../lib/subscriptionStore').getSubscription(deviceId);
        let customerId = existing?.stripeCustomerId;

        if (!customerId) {
            // Create a new customer with deviceId as metadata
            const customer = await s.customers.create({
                metadata: { deviceId },
            });
            customerId = customer.id;

            // Save the customer ID
            setSubscription(deviceId, {
                tier: 'free',
                stripeCustomerId: customerId,
            });
        }

        const session = await s.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [{ price: stripePriceId, quantity: 1 }],
            mode: 'subscription',
            success_url: SUCCESS_URL,
            cancel_url: CANCEL_URL,
            metadata: { deviceId },
        });

        res.json({ url: session.url });
    } catch (e) {
        console.error('[Stripe] Checkout error:', e.message);
        res.status(500).json({ error: 'Unable to create checkout session' });
    }
});

/**
 * GET /api/subscription-status/:deviceId
 * Returns { tier: 'free' | 'pro' }
 */
router.get('/api/subscription-status/:deviceId', (req, res) => {
    const { deviceId } = req.params;

    if (!deviceId || typeof deviceId !== 'string' || deviceId.length > 100) {
        return res.status(400).json({ error: 'Invalid deviceId' });
    }

    const tier = getTier(deviceId);
    res.json({ tier });
});

/**
 * POST /api/stripe-webhook
 * Handles Stripe webhook events for subscription lifecycle
 * Must be registered with express.raw() body parser (NOT express.json())
 */
router.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    let event;

    try {
        const s = getStripe();

        if (WEBHOOK_SECRET) {
            const sig = req.headers['stripe-signature'];
            event = s.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
        } else {
            // Dev mode: parse directly (no signature verification)
            event = JSON.parse(req.body.toString());
            console.warn('[Stripe] No webhook secret configured - skipping signature verification');
        }
    } catch (e) {
        console.error('[Stripe] Webhook signature verification failed:', e.message);
        return res.status(400).send('Webhook signature verification failed');
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const deviceId = session.metadata?.deviceId;
                const customerId = session.customer;

                if (deviceId) {
                    setSubscription(deviceId, {
                        tier: 'pro',
                        stripeCustomerId: customerId,
                        stripeSubscriptionId: session.subscription,
                    });
                    console.log(`[Stripe] Checkout completed for device ${deviceId.substring(0, 8)}...`);
                }
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const customerId = subscription.customer;
                const deviceId = findByStripeCustomer(customerId);

                if (deviceId) {
                    const isActive = ['active', 'trialing'].includes(subscription.status);
                    const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();

                    setSubscription(deviceId, {
                        tier: isActive ? 'pro' : 'free',
                        stripeSubscriptionId: subscription.id,
                        expiresAt,
                    });
                    console.log(`[Stripe] Subscription updated for device ${deviceId.substring(0, 8)}...: ${isActive ? 'pro' : 'free'}`);
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const customerId = subscription.customer;
                const deviceId = findByStripeCustomer(customerId);

                if (deviceId) {
                    setSubscription(deviceId, {
                        tier: 'free',
                        stripeSubscriptionId: null,
                        expiresAt: null,
                    });
                    console.log(`[Stripe] Subscription cancelled for device ${deviceId.substring(0, 8)}...`);
                }
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const customerId = invoice.customer;
                const deviceId = findByStripeCustomer(customerId);

                if (deviceId) {
                    console.log(`[Stripe] Payment failed for device ${deviceId.substring(0, 8)}...`);
                    // Don't immediately downgrade - Stripe retries payments
                    // Downgrade happens via customer.subscription.deleted after all retries fail
                }
                break;
            }

            default:
                console.log(`[Stripe] Unhandled event type: ${event.type}`);
        }
    } catch (e) {
        console.error('[Stripe] Webhook handler error:', e.message);
    }

    res.json({ received: true });
});

module.exports = router;
