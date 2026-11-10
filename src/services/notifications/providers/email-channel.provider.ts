import nodemailer from 'nodemailer';
import { INotificationChannelProvider } from '../notification-channel.interface';
import {
  NotificationChannel,
  NotificationDispatchPayload,
  NotificationRecipient
} from '../../../types/notification.types';

export class EmailChannelProvider implements INotificationChannelProvider {
  public readonly channelName: NotificationChannel = 'email';
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter(): void {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
    } else if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }
  }

  public async send(
    payload: NotificationDispatchPayload,
    recipient: NotificationRecipient
  ): Promise<void> {
    if (!recipient.email) {
      return;
    }

    if (!this.transporter) {
      this.initTransporter();
      if (!this.transporter) {
        console.warn(
          `[EmailChannelProvider] Email provider unconfigured. Skipping email to ${recipient.email}`
        );
        return;
      }
    }

    const frontendBaseUrl =
      process.env.FRONTEND_APP_URL ||
      process.env.FRONTEND_URL ||
      'http://localhost:8080';

    const fullActionUrl = payload.link
      ? payload.link.startsWith('http')
        ? payload.link
        : `${frontendBaseUrl.replace(/\/+$/, '')}${payload.link.startsWith('/') ? '' : '/'}${payload.link}`
      : frontendBaseUrl;

    const fromAddress =
      process.env.EMAIL_FROM ||
      process.env.EMAIL_USER ||
      'no-reply@proactiveapp.com';

    const emailHtml = `
      <div style="background-color: #f8fafc; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 24px 32px; border-bottom: 2px solid #38bdf8;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">Proactive</span>
                    <span style="font-size: 13px; color: #38bdf8; font-weight: 600; margin-left: 8px;">Practice System</span>
                  </td>
                  <td align="right">
                    <span style="background-color: #1e293b; color: #94a3b8; font-size: 11px; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; font-weight: 600;">
                      ${payload.category.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b;">
                Hello ${recipient.name || 'there'},
              </p>
              <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #0f172a; line-height: 1.4;">
                ${payload.title}
              </h2>
              <div style="background-color: #f1f5f9; border-left: 4px solid #0284c7; padding: 16px; border-radius: 6px; font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
                ${payload.message}
              </div>

              <!-- Action Link -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px 0 16px 0;">
                    <a href="${fullActionUrl}" style="background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 28px; font-size: 14px; font-weight: 600; border-radius: 8px; display: inline-block;">
                      View in Proactive &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5;">
              You received this automated notification according to your practice notification preferences.<br/>
              To update your email alert settings, go to <a href="${frontendBaseUrl}/settings?module=user-notifications" style="color: #0284c7; text-decoration: underline;">Settings &gt; User Notifications</a>.
            </td>
          </tr>
        </table>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: `"Proactive Notifications" <${fromAddress}>`,
        to: recipient.email,
        subject: `[Proactive] ${payload.title}`,
        html: emailHtml
      });
    } catch (error) {
      console.error(
        `[EmailChannelProvider] Failed to dispatch email to ${recipient.email}:`,
        error
      );
    }
  }
}

