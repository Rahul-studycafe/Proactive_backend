import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import {
  getWorkingDays,
  updateWorkingDays,
  getMyIp,
  getBillingEntities,
  createBillingEntity,
  updateBillingEntity,
  deleteBillingEntity,
  getTenantUsage,
  getTenantSubscription,
  upsertTenantSubscription
} from '../controllers/tenant-settings.controller';
import {
  getGatewayConfigs,
  upsertGatewayConfig
} from '../controllers/payment-gateway.controller';
import {
  getTenantWebsiteSettings,
  updateTenantWebsiteSettings
} from '../controllers/website-cms.controller';

const router = Router();

router.use(authenticate);

router.get('/work-days', getWorkingDays);
router.put('/work-days', updateWorkingDays);
router.get('/my-ip', getMyIp);

// Phase 119 & 141: Multi-Branch & Billing Entity Management
router.get('/billing-entities', getBillingEntities);
router.post('/billing-entities', createBillingEntity);
router.put('/billing-entities/:id', updateBillingEntity);
router.delete('/billing-entities/:id', deleteBillingEntity);

// Phase 131: Payment Gateway Settings
router.get('/payment-gateways', getGatewayConfigs);
router.post('/payment-gateways', upsertGatewayConfig);

// Phase 144 & 145: SaaS Subscription & Tenant Usage Quotas
router.get('/usage', getTenantUsage);
router.get('/subscription', getTenantSubscription);
router.post('/subscription', upsertTenantSubscription);

// Phase 124: White-Label Agency Website CMS
router.get('/website', getTenantWebsiteSettings);
router.put('/website', updateTenantWebsiteSettings);

export default router;
