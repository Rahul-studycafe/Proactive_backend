import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import { SsoService } from '../services/sso.service';

const initiateTicketSchema = z.object({
  email: z.string().email('A valid email address is required'),
  name: z.string().min(1, 'Full name is mandatory for SSO provisioning'),
  expiryDate: z.string().min(1, 'Automation Cafe plan expiry date is mandatory for SSO provisioning'),
  password: z.string().optional(),
  mobile: z.string().optional(),
  externalUserId: z.string().optional(),
  redirectPath: z.string().optional(),
  state: z.string().optional(),
});

const exchangeTicketSchema = z.object({
  ticket: z.string().min(10, 'A valid ticket code is required'),
});

export const createTicketHandler = asyncHandler(async (req: Request, res: Response) => {
  // Extract client credentials from headers or basic auth
  let clientId = (req.headers['x-sso-client-id'] || req.headers['x-client-id']) as string;
  let clientSecret = (req.headers['x-sso-client-secret'] || req.headers['x-client-secret']) as string;

  // Support Authorization: Basic <base64(clientId:clientSecret)>
  if ((!clientId || !clientSecret) && req.headers.authorization?.startsWith('Basic ')) {
    const credentials = Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString('ascii');
    const [cId, ...cSecParts] = credentials.split(':');
    clientId = cId;
    clientSecret = cSecParts.join(':');
  }

  if (!clientId || !clientSecret) {
    throw new ApiError(
      401,
      'Missing external application credentials. Please supply X-SSO-Client-Id and X-SSO-Client-Secret headers.',
      'SSO_CLIENT_AUTH_REQUIRED'
    );
  }

  // Verify client authorization
  const client = await SsoService.verifyClientCredentials(clientId, clientSecret);

  // Validate request body
  const parsed = initiateTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  // Resolve user account and organization (strict 1:1 binding)
  const resolution = await SsoService.resolveOrCreateUser(client, parsed.data);

  // Generate single-use ticket
  const ticketData = await SsoService.createSsoTicket(client, resolution, {
    redirectPath: parsed.data.redirectPath,
    state: parsed.data.state,
  });

  return sendSuccess(res, 201, 'SSO ticket generated successfully', ticketData);
});

export const exchangeTicketHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = exchangeTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const sessionData = await SsoService.consumeSsoTicket(parsed.data.ticket);

  return sendSuccess(res, 200, 'SSO authentication successful', sessionData);
});

const updateOrgSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(100),
});

export const updateOrganizationHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
  if (!tenantId) {
    throw new ApiError(401, 'Tenant authentication required', 'UNAUTHORIZED');
  }

  const updated = await SsoService.updateOrganizationName(tenantId, parsed.data.name);

  return sendSuccess(res, 200, 'Organization name updated successfully', updated);
});

