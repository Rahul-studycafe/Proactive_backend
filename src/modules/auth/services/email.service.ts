import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Standard transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends an OTP email to the user.
 * @param to The recipient email address
 * @param otp The 6-digit OTP to send
 */
export const sendOtpEmail = async (to: string, otp: string): Promise<void> => {
  const mailOptions = {
    from: `"PMS" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Your Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaeb; border-radius: 8px;">
        <h2 style="color: #111; text-align: center;">Verify your email</h2>
        <p style="color: #444; font-size: 16px;">
          Use the following 6-digit code to verify your email address. This code is valid for 10 minutes.
        </p>
        <div style="background-color: #f4f4f5; padding: 16px; border-radius: 8px; text-align: center; margin: 24px 0;">
          <span style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #111;">${otp}</span>
        </div>
        <p style="color: #666; font-size: 14px;">
          If you didn't request this code, you can safely ignore this email.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Sends a dual-verification OTP email for changing the Super Admin email address.
 * @param to The destination email (current or new)
 * @param otp The 6-digit OTP code
 * @param target Whether this is for the 'current' or 'new' email
 * @param otherEmail The counterpart email address
 */
export const sendEmailChangeOtpEmail = async (
  to: string,
  otp: string,
  target: 'current' | 'new',
  otherEmail: string
): Promise<void> => {
  const isCurrent = target === 'current';
  const subject = isCurrent
    ? 'Security Alert: Approval Code to Change Super Admin Email'
    : 'Verification Code: Confirm Your New Super Admin Email';

  const heading = isCurrent
    ? 'Approve Super Admin Email Change'
    : 'Confirm Your New Email Address';

  const bodyText = isCurrent
    ? `A request was received to change your Super Admin primary email address from <strong>${to}</strong> to <strong>${otherEmail}</strong>. To approve this security-sensitive change, enter this approval code:`
    : `You requested to set <strong>${to}</strong> as the new primary email for your Super Admin account. To verify that you own and have access to this inbox, enter this verification code:`;

  const mailOptions = {
    from: `"PMS Security" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaeb; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #111; margin: 0; font-size: 20px;">${heading}</h2>
          <p style="color: #6b7280; font-size: 13px; margin-top: 4px;">Two-Way Security Verification</p>
        </div>
        <p style="color: #374151; font-size: 15px; line-height: 1.5;">
          ${bodyText}
        </p>
        <div style="background-color: #f3f4f6; padding: 18px; border-radius: 8px; text-align: center; margin: 24px 0; border: 1px dashed #d1d5db;">
          <span style="font-size: 30px; font-weight: bold; letter-spacing: 6px; color: #111827; font-family: monospace;">${otp}</span>
        </div>
        <p style="color: #b91c1c; font-size: 12px; font-weight: 500; margin-bottom: 0;">
          ⚠️ This code expires in 10 minutes. If you did not initiate this email change, please secure your account immediately.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Sends a password reset link to the user.
 * @param to The recipient email address
 * @param resetLink The full URL for resetting the password
 */
export const sendPasswordResetEmail = async (to: string, resetLink: string): Promise<void> => {
  const mailOptions = {
    from: `"PMS" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Reset Your Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaeb; border-radius: 8px;">
        <h2 style="color: #111; text-align: center;">Reset your password</h2>
        <p style="color: #444; font-size: 16px;">
          We received a request to reset the password for your account. Click the button below to set a new password. This link will expire in 15 minutes.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #111; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          If you didn't request a password reset, you can safely ignore this email.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Sends an invitation email to a newly added practice team member.
 */
export const sendStaffInvitationEmail = async (
  to: string,
  inviteLink: string,
  orgName: string,
  inviterName: string
): Promise<void> => {
  const mailOptions = {
    from: `"PMS" <${process.env.EMAIL_USER}>`,
    to,
    subject: `You've been invited to join ${orgName} on PMS`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaeb; border-radius: 8px;">
        <h2 style="color: #111; text-align: center;">You're Invited!</h2>
        <p style="color: #444; font-size: 16px;">
          <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on PMS Practice Management System.
        </p>
        <p style="color: #444; font-size: 16px;">
          Click the button below to accept your invitation and set up your password. This link is valid for 7 days.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" style="background-color: #2563eb; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
            Accept Invitation & Set Password
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          If you were not expecting this invitation, you can safely ignore this email.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Failed to send staff invitation email:', err);
  }
};

/**
 * Sends a one-time cryptographic magic sign-in link to a client portal user.
 */
export const sendMagicLinkEmail = async (
  to: string,
  magicUrl: string,
  clientName: string,
  orgName: string
): Promise<void> => {
  const mailOptions = {
    from: `"${orgName} Portal" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Your Sign-In Link for ${orgName} Client Portal`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 28px;">
          <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 22px; font-weight: 700;">${orgName}</h2>
          <span style="display: inline-block; padding: 4px 12px; background-color: #f1f5f9; color: #475569; border-radius: 9999px; font-size: 12px; font-weight: 500;">
            Client Self-Service Portal
          </span>
        </div>
        
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 12px;">
          Hello <strong>${clientName}</strong>,
        </p>
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 28px;">
          We received a request to access your client portal. Click the button below to sign in instantly without a password:
        </p>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${magicUrl}" style="background-color: #0284c7; color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 2px 4px rgba(2, 132, 199, 0.2);">
            Sign In to Portal
          </a>
        </div>
        
        <div style="background-color: #f8fafc; border-radius: 8px; padding: 14px 16px; margin: 24px 0;">
          <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 0;">
            ⏳ This magic link will expire in <strong>15 minutes</strong> and can only be used once. If you did not request this link, you can safely ignore this email.
          </p>
        </div>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        
        <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin: 0; word-break: break-all;">
          Button not working? Copy and paste this URL into your browser:<br/>
          <a href="${magicUrl}" style="color: #0284c7; text-decoration: underline;">${magicUrl}</a>
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] Magic link email successfully dispatched to ${to}`);
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed to send magic link email to ${to}:`, err);
    throw err;
  }
};

/**
 * Sends a 6-digit login OTP to a client portal user.
 */
export const sendPortalOtpEmail = async (
  to: string,
  otpCode: string,
  clientName: string,
  orgName: string
): Promise<void> => {
  const mailOptions = {
    from: `"${orgName} Portal" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Your Verification Code - ${orgName} Portal`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 28px;">
          <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 22px; font-weight: 700;">${orgName}</h2>
          <span style="display: inline-block; padding: 4px 12px; background-color: #f1f5f9; color: #475569; border-radius: 9999px; font-size: 12px; font-weight: 500;">
            Client Self-Service Portal
          </span>
        </div>
        
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 12px;">
          Hello <strong>${clientName}</strong>,
        </p>
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
          Use the following 6-digit verification code to complete your login to the client portal:
        </p>
        
        <div style="background-color: #f1f5f9; padding: 18px; border-radius: 8px; text-align: center; margin: 24px 0;">
          <span style="font-size: 30px; font-weight: 700; letter-spacing: 8px; color: #0f172a; font-family: monospace;">${otpCode}</span>
        </div>
        
        <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 0;">
          ⏳ This code is valid for <strong>10 minutes</strong>. If you did not request this verification code, please ignore this email.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] Portal OTP email successfully dispatched to ${to}`);
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed to send portal OTP email to ${to}:`, err);
    throw err;
  }
};
