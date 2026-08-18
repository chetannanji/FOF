import nodemailer from "nodemailer";

export interface EmailOptions {
  to: string;
  subject: string;
  body: string;
  from?: string;
  html?: string;
}

// Create transporter with optimized settings for production hosting (Render, etc.)
const createTransporter = (): nodemailer.Transporter => {
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;

  // Validate required environment variables
  if (!smtpUser || !smtpPassword) {
    throw new Error('SMTP_USER and SMTP_PASSWORD environment variables must be set');
  }

  console.log(`📧 Configuring SMTP: ${smtpHost}:${smtpPort} for ${smtpUser}`);

  // Create transporter with explicit configuration (more reliable than service: "gmail")
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
    // Critical settings for hosting providers like Render
    tls: {
      rejectUnauthorized: false, // Accept self-signed certificates
      minVersion: 'TLSv1.2',     // Minimum TLS version
    },
    // Timeout settings to prevent hanging
    connectionTimeout: 10000,  // 10 seconds to establish connection
    greetingTimeout: 10000,    // 10 seconds for greeting
    socketTimeout: 10000,      // 10 seconds of inactivity
    // Debug logging (set to false in production for less verbose output)
    debug: process.env.NODE_ENV !== 'production',
    logger: process.env.NODE_ENV !== 'production',
  });
};

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER;

  if (!smtpFrom || smtpFrom.includes("example.com")) {
    throw new Error("SMTP_FROM or SMTP_USER not configured. Cannot send emails.");
  }

  // Create fresh transporter for each send (avoids caching issues)
  const transporter = createTransporter();

  const mailOptions = {
    from: options.from || smtpFrom,
    to: options.to,
    subject: options.subject,
    text: options.body,
    html: options.html || options.body.replace(/\n/g, "<br>"),
  };

  try {
    console.log(`📧 Sending email to ${options.to}...`);
    console.log(`   Subject: ${options.subject}`);

    const info = await transporter.sendMail(mailOptions);
    
    console.log("✅ Email sent successfully!");
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Response: ${info.response}`);

  } catch (error: any) {
    console.error("❌ Error sending email:", error.message);
    
    // Provide helpful error messages based on error type
    if (error.code === 'ETIMEDOUT') {
      console.error('   → Connection timeout: SMTP server unreachable');
      console.error('   → This usually means SMTP ports are blocked by your hosting provider');
      console.error('   → Consider using SendGrid, Resend, or another API-based service');
      throw new Error('Connection timeout - SMTP port may be blocked by hosting provider');
    } else if (error.code === 'EAUTH') {
      console.error('   → Authentication failed: Check SMTP_USER and SMTP_PASSWORD');
      console.error('   → For Gmail: Make sure you are using an App Password, not your regular password');
      throw new Error('SMTP authentication failed - verify credentials');
    } else if (error.code === 'ECONNECTION' || error.code === 'ESOCKET') {
      console.error('   → Connection error: Cannot reach SMTP server');
      throw new Error('Cannot connect to SMTP server - check network connectivity');
    }

    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// Verify transporter configuration
export const verifyEmailConfig = async (): Promise<boolean> => {
  try {
    console.log('🔍 Verifying email configuration...');
    const transporter = createTransporter();
    await transporter.verify();
    console.log("✅ Email server is ready to send messages");
    return true;
  } catch (error: any) {
    console.error("❌ Email server configuration error:", error.message);
    
    if (error.code === 'ETIMEDOUT') {
      console.error("   → SMTP connection timed out - ports may be blocked");
    } else if (error.code === 'EAUTH') {
      console.error("   → Authentication failed - check credentials");
    }
    
    console.error("   Make sure SMTP_USER and SMTP_PASSWORD are set correctly");
    return false;
  }
};