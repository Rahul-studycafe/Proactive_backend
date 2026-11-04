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
    from: `"Proactive" <${process.env.EMAIL_USER}>`,
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
 * Sends a password reset link to the user.
 * @param to The recipient email address
 * @param resetLink The full URL for resetting the password
 */
export const sendPasswordResetEmail = async (to: string, resetLink: string): Promise<void> => {
  const mailOptions = {
    from: `"Proactive" <${process.env.EMAIL_USER}>`,
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
    from: `"Proactive" <${process.env.EMAIL_USER}>`,
    to,
    subject: `You've been invited to join ${orgName} on Proactive`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaeb; border-radius: 8px;">
        <h2 style="color: #111; text-align: center;">You're Invited!</h2>
        <p style="color: #444; font-size: 16px;">
          <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on Proactive Practice Management System.
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
