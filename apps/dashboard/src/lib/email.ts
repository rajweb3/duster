import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
});

const FROM_ADDRESS = process.env.EMAIL_FROM || 'Duster <noreply@duster.ai>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]+>/g, ''),
    });
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
}

export async function sendVerificationEmail(email: string, token: string, name: string): Promise<boolean> {
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;

  return sendEmail({
    to: email,
    subject: 'Verify your Duster account',
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 700; color: #000; margin-bottom: 16px;">Welcome to Duster</h1>
        <p style="font-size: 14px; color: #666; line-height: 1.6; margin-bottom: 24px;">
          Hi ${name}, please verify your email address to complete your account setup.
        </p>
        <a href="${verifyUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
          Verify Email
        </a>
        <p style="font-size: 12px; color: #999; margin-top: 24px; line-height: 1.5;">
          This link expires in 24 hours. If you didn't create a Duster account, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0 16px;" />
        <p style="font-size: 11px; color: #999;">Duster — Zero-knowledge AI for small teams</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, token: string, name: string): Promise<boolean> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

  return sendEmail({
    to: email,
    subject: 'Reset your Duster password',
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 700; color: #000; margin-bottom: 16px;">Reset your password</h1>
        <p style="font-size: 14px; color: #666; line-height: 1.6; margin-bottom: 24px;">
          Hi ${name}, we received a request to reset your password. Click below to choose a new one.
        </p>
        <a href="${resetUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
          Reset Password
        </a>
        <p style="font-size: 12px; color: #999; margin-top: 24px; line-height: 1.5;">
          This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password won't be changed.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0 16px;" />
        <p style="font-size: 11px; color: #999;">Duster — Zero-knowledge AI for small teams</p>
      </div>
    `,
  });
}
