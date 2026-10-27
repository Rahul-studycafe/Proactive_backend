import nodemailer from 'nodemailer';

// Create a transporter
// Admin will configure this using env variables for production
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER, // Admin's email user
    pass: process.env.SMTP_PASS, // Admin's email password
  },
});

export const sendWelcomeEmail = async (toEmail: string, userName: string, orgName: string) => {
  try {
    const info = await transporter.sendMail({
      from: `"Proactive App" <${process.env.SMTP_FROM || 'no-reply@proactiveapp.com'}>`,
      to: toEmail,
      subject: `Welcome to Proactive, ${userName}! Payment Successful.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Welcome to Proactive, ${userName}!</h2>
          <p>We are thrilled to let you know that the payment for your organization <strong>${orgName}</strong> was successful.</p>
          <p>Your subscription is now active, and you can start adding users and utilizing all the features of Proactive.</p>
          <br/>
          <p>If you have any questions, feel free to reach out to our support team.</p>
          <p>Best regards,</p>
          <p><strong>The Proactive Team</strong></p>
        </div>
      `,
    });
    console.log('Welcome email sent: %s', info.messageId);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
};

export const sendDscExpiryEmail = async (
  toEmail: string,
  clientName: string,
  certificateName: string,
  expiryDateStr: string,
  daysLeft: number
) => {
  try {
    const info = await transporter.sendMail({
      from: `"Proactive Compliance Desk" <${process.env.SMTP_FROM || 'compliance@proactiveapp.com'}>`,
      to: toEmail,
      subject: `Urgent: Digital Signature Certificate (DSC) Expiry Notice for ${clientName}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; color: #333;">
          <h2 style="color: #dc2626;">Digital Signature Certificate (DSC) Expiry Reminder</h2>
          <p>Dear <strong>${clientName}</strong>,</p>
          <p>This is an automated operational notice regarding your Digital Signature Certificate on file:</p>
          <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0;">
            <p style="margin: 0 0 8px 0;"><strong>Certificate:</strong> ${certificateName}</p>
            <p style="margin: 0 0 8px 0;"><strong>Expiry Date:</strong> ${expiryDateStr}</p>
            <p style="margin: 0; color: #dc2626;"><strong>Time Remaining:</strong> ${daysLeft} day(s)</p>
          </div>
          <p>To avoid disruptions in timely tax filings, MCA submissions, and GST compliances, please initiate your renewal immediately.</p>
          <br/>
          <p>Warm regards,</p>
          <p><strong>Compliance & Operations Team</strong></p>
        </div>
      `,
    });
    console.log('DSC expiry email sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending DSC expiry email:', error);
    return null;
  }
};

export const sendDocumentRequestEmail = async (
  toEmail: string,
  clientName: string,
  firmName: string,
  requestTitle: string,
  itemsList: string[],
  uploadUrl: string,
  expiresAtStr: string
) => {
  try {
    const listHtml = itemsList
      .map((item) => `<li style="margin-bottom: 6px;">${item}</li>`)
      .join('');

    const info = await transporter.sendMail({
      from: `"${firmName}" <${process.env.SMTP_FROM || 'requests@proactiveapp.com'}>`,
      to: toEmail,
      subject: `Document Request: ${requestTitle} - ${firmName}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 24px; color: #1e293b; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">Action Required: Document Upload</h2>
          <p>Dear <strong>${clientName}</strong>,</p>
          <p><strong>${firmName}</strong> has requested documents from you for: <strong>${requestTitle}</strong>.</p>
          
          <div style="background-color: #f8fafc; border-radius: 6px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; font-weight: bold; color: #475569;">Requested Items Checklist:</p>
            <ul style="margin: 0; padding-left: 20px; color: #334155;">
              ${listHtml}
            </ul>
          </div>

          <p style="font-size: 14px; color: #64748b;">No account or password is required. Simply click the link below to securely upload your files from your phone or computer:</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${uploadUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Upload Requested Documents</a>
          </div>

          <p style="font-size: 13px; color: #94a3b8; text-align: center;">This secure link will expire on <strong>${expiresAtStr}</strong>.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">If you received this in error, please disregard this email.</p>
        </div>
      `,
    });
    console.log('Document request email sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending document request email:', error);
    return null;
  }
};

