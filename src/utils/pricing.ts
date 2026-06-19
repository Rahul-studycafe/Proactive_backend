import { PricingTier } from '../models/PricingTier';
import { PromoCode } from '../models/PromoCode';
import { ApiError } from './ApiError';

export interface PricingCalculationResult {
  baseAmount: number;
  discountPercentage: number;
  discountAmount: number;
  subTotal: number;
  gstAmount: number;
  grandTotal: number;
  usersCount: number;
  pricePerUserYearly: number;
  promoCode?: string;
}

export const calculateSubscriptionPrice = async (
  usersCount: number,
  promoCodeString?: string
): Promise<PricingCalculationResult> => {
  if (!usersCount || usersCount < 1) {
    throw new ApiError(400, 'Invalid users count', 'INVALID_USERS_COUNT');
  }

  // 1. Fetch Tier
  const tier = await PricingTier.findOne({
    minUsers: { $lte: usersCount },
    maxUsers: { $gte: usersCount },
    isActive: true
  });

  if (!tier) {
    throw new ApiError(400, 'No pricing tier found for this number of users', 'NO_TIER_FOUND');
  }

  const pricePerUserYearly = tier.pricePerUserYearly;
  const baseAmount = pricePerUserYearly * usersCount;
  
  // 2. Validate Promo Code
  let discountPercentage = 0;
  let appliedPromoCode = undefined;

  if (promoCodeString) {
    const code = promoCodeString.toUpperCase().trim();
    const promo = await PromoCode.findOne({ code, isActive: true });
    
    if (promo) {
      if (promo.expiryDate && promo.expiryDate < new Date()) {
        // Expired, we just ignore it (or could throw error, but ignoring is softer for real-time calc)
      } else {
        discountPercentage = promo.discountPercentage;
        appliedPromoCode = promo.code;
      }
    }
  }

  // 3. Calculate with standard rounding
  const discountAmount = Math.round(baseAmount * (discountPercentage / 100));
  const subTotal = baseAmount - discountAmount;
  const gstAmount = Math.round(subTotal * 0.18);
  const grandTotal = subTotal + gstAmount;

  return {
    baseAmount,
    discountPercentage,
    discountAmount,
    subTotal,
    gstAmount,
    grandTotal,
    usersCount,
    pricePerUserYearly,
    promoCode: appliedPromoCode
  };
};
