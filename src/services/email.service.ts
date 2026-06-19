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
